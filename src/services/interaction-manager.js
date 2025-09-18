/**
 * 互动管理器
 * 管理小红书用户互动功能：点赞、评论、关注等
 */

import { logger } from '../utils/logger.js';
import { query, transaction } from '../database/index.js';
import { BrowserManager } from '../browser/browser-manager.js';
import { AccountManager } from './account-manager.js';
import { TaskManager } from './task-manager.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 互动管理器类
 */
export class InteractionManager {
  constructor() {
    this.browserManager = new BrowserManager();
    this.accountManager = new AccountManager();
    this.taskManager = new TaskManager();
    this.interactionLimits = new Map(); // 互动限制记录
  }
  
  /**
   * 点赞笔记
   * @param {Object} params - 参数
   * @returns {Promise<Object>} 点赞结果
   */
  async likePost(params) {
    const { accountId, postId, postUrl } = params;
    
    try {
      // 验证参数
      if (!accountId) {
        throw new Error('账号ID不能为空');
      }
      
      if (!postId && !postUrl) {
        throw new Error('笔记ID或笔记链接不能为空');
      }
      
      // 检查账号状态
      const account = await query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ? AND status = "active"',
        [accountId]
      );
      
      if (account.length === 0) {
        throw new Error('账号不存在或不可用');
      }
      
      const accountData = account[0];
      
      // 检查是否已登录
      const session = this.accountManager.getLoginSession(accountId);
      if (!session) {
        throw new Error('账号未登录');
      }
      
      // 检查互动限制
      const limitCheck = await this.checkInteractionLimit(accountId, 'like');
      if (!limitCheck.allowed) {
        throw new Error(`互动限制: ${limitCheck.reason}`);
      }
      
      // 获取笔记URL
      let targetUrl = postUrl;
      if (!targetUrl && postId) {
        targetUrl = `https://www.xiaohongshu.com/discovery/item/${postId}`;
      }
      
      // 获取浏览器页面
      const page = await this.browserManager.getPage({
        accountId,
        cookies: session.cookies
      });
      
      // 导航到笔记页面
      await page.goto(targetUrl, { waitUntil: 'networkidle' });
      
      // 等待页面加载
      await page.waitForSelector('.note-detail, .post-detail, [data-testid="post-detail"]', { 
        timeout: 10000 
      });
      
      // 查找点赞按钮
      const likeButton = await page.$('.like-btn, .favorite-btn, [data-testid="like-btn"]');
      if (!likeButton) {
        throw new Error('未找到点赞按钮');
      }
      
      // 检查是否已经点赞
      const isLiked = await likeButton.evaluate(btn => 
        btn.classList.contains('liked') || 
        btn.classList.contains('active') || 
        btn.getAttribute('data-liked') === 'true'
      );
      
      if (isLiked) {
        return {
          success: true,
          alreadyLiked: true,
          message: '笔记已点赞'
        };
      }
      
      // 模拟人类行为：随机延迟
      await page.waitForTimeout(Math.random() * 3000 + 1000);
      
      // 点击点赞按钮
      await likeButton.click();
      
      // 等待点赞动画完成
      await page.waitForTimeout(1000);
      
      // 验证点赞是否成功
      const likedAfter = await likeButton.evaluate(btn => 
        btn.classList.contains('liked') || 
        btn.classList.contains('active') || 
        btn.getAttribute('data-liked') === 'true'
      );
      
      if (likedAfter) {
        // 记录互动历史
        await this.recordInteractionHistory({
          accountId,
          interactionType: 'like',
          targetId: postId,
          targetType: 'post',
          success: true
        });
        
        // 更新互动限制
        await this.updateInteractionLimit(accountId, 'like');
        
        logger.info(`点赞成功: 账号 ${accountId} 点赞笔记 ${postId}`);
        
        return {
          success: true,
          alreadyLiked: false,
          message: '点赞成功'
        };
      } else {
        throw new Error('点赞失败');
      }
    } catch (error) {
      logger.error('点赞失败:', error);
      
      // 记录失败历史
      await this.recordInteractionHistory({
        accountId,
        interactionType: 'like',
        targetId: postId,
        targetType: 'post',
        success: false,
        errorMessage: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * 评论笔记
   * @param {Object} params - 参数
   * @returns {Promise<Object>} 评论结果
   */
  async commentPost(params) {
    const { accountId, postId, postUrl, content, replyToCommentId } = params;
    
    try {
      // 验证参数
      if (!accountId) {
        throw new Error('账号ID不能为空');
      }
      
      if (!postId && !postUrl) {
        throw new Error('笔记ID或笔记链接不能为空');
      }
      
      if (!content || content.trim().length === 0) {
        throw new Error('评论内容不能为空');
      }
      
      if (content.length > 500) {
        throw new Error('评论内容长度不能超过500字符');
      }
      
      // 检查账号状态
      const account = await query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ? AND status = "active"',
        [accountId]
      );
      
      if (account.length === 0) {
        throw new Error('账号不存在或不可用');
      }
      
      const accountData = account[0];
      
      // 检查是否已登录
      const session = this.accountManager.getLoginSession(accountId);
      if (!session) {
        throw new Error('账号未登录');
      }
      
      // 检查互动限制
      const limitCheck = await this.checkInteractionLimit(accountId, 'comment');
      if (!limitCheck.allowed) {
        throw new Error(`互动限制: ${limitCheck.reason}`);
      }
      
      // 内容审核
      const auditResult = await this.commentContentAudit(content);
      if (!auditResult.passed) {
        throw new Error(`评论审核未通过: ${auditResult.reason}`);
      }
      
      // 获取笔记URL
      let targetUrl = postUrl;
      if (!targetUrl && postId) {
        targetUrl = `https://www.xiaohongshu.com/discovery/item/${postId}`;
      }
      
      // 获取浏览器页面
      const page = await this.browserManager.getPage({
        accountId,
        cookies: session.cookies
      });
      
      // 导航到笔记页面
      await page.goto(targetUrl, { waitUntil: 'networkidle' });
      
      // 等待页面加载
      await page.waitForSelector('.note-detail, .post-detail, [data-testid="post-detail"]', { 
        timeout: 10000 
      });
      
      // 查找评论输入框
      const commentInput = await page.$('.comment-input, .reply-input, [data-testid="comment-input"]');
      if (!commentInput) {
        throw new Error('未找到评论输入框');
      }
      
      // 如果是回复评论，先点击回复按钮
      if (replyToCommentId) {
        const replyButton = await page.$(`[data-comment-id="${replyToCommentId}"] .reply-btn, [data-testid="reply-btn"]`);
        if (replyButton) {
          await replyButton.click();
          await page.waitForTimeout(500);
        }
      }
      
      // 模拟人类行为：随机延迟
      await page.waitForTimeout(Math.random() * 3000 + 1000);
      
      // 输入评论内容
      await commentInput.fill(content);
      
      // 等待输入完成
      await page.waitForTimeout(500);
      
      // 查找发送按钮
      const sendButton = await page.$('.send-btn, .submit-btn, [data-testid="send-comment-btn"]');
      if (!sendButton) {
        throw new Error('未找到发送按钮');
      }
      
      // 点击发送按钮
      await sendButton.click();
      
      // 等待评论发送完成
      await page.waitForTimeout(2000);
      
      // 验证评论是否发送成功
      const commentSuccess = await page.evaluate((commentContent) => {
        const comments = document.querySelectorAll('.comment-item, [data-testid="comment-item"]');
        return Array.from(comments).some(comment => {
          const content = comment.querySelector('.comment-content, [data-testid="comment-content"]');
          return content && content.textContent.includes(commentContent);
        });
      }, content);
      
      if (commentSuccess) {
        // 记录互动历史
        await this.recordInteractionHistory({
          accountId,
          interactionType: 'comment',
          targetId: postId,
          targetType: 'post',
          content,
          success: true
        });
        
        // 更新互动限制
        await this.updateInteractionLimit(accountId, 'comment');
        
        logger.info(`评论成功: 账号 ${accountId} 评论笔记 ${postId}`);
        
        return {
          success: true,
          message: '评论成功'
        };
      } else {
        throw new Error('评论发送失败');
      }
    } catch (error) {
      logger.error('评论失败:', error);
      
      // 记录失败历史
      await this.recordInteractionHistory({
        accountId,
        interactionType: 'comment',
        targetId: postId,
        targetType: 'post',
        content,
        success: false,
        errorMessage: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * 关注用户
   * @param {Object} params - 参数
   * @returns {Promise<Object>} 关注结果
   */
  async followUser(params) {
    const { accountId, userId, userUrl } = params;
    
    try {
      // 验证参数
      if (!accountId) {
        throw new Error('账号ID不能为空');
      }
      
      if (!userId && !userUrl) {
        throw new Error('用户ID或用户链接不能为空');
      }
      
      // 检查账号状态
      const account = await query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ? AND status = "active"',
        [accountId]
      );
      
      if (account.length === 0) {
        throw new Error('账号不存在或不可用');
      }
      
      const accountData = account[0];
      
      // 检查是否已登录
      const session = this.accountManager.getLoginSession(accountId);
      if (!session) {
        throw new Error('账号未登录');
      }
      
      // 检查互动限制
      const limitCheck = await this.checkInteractionLimit(accountId, 'follow');
      if (!limitCheck.allowed) {
        throw new Error(`互动限制: ${limitCheck.reason}`);
      }
      
      // 获取用户URL
      let targetUrl = userUrl;
      if (!targetUrl && userId) {
        targetUrl = `https://www.xiaohongshu.com/user/profile/${userId}`;
      }
      
      // 获取浏览器页面
      const page = await this.browserManager.getPage({
        accountId,
        cookies: session.cookies
      });
      
      // 导航到用户主页
      await page.goto(targetUrl, { waitUntil: 'networkidle' });
      
      // 等待页面加载
      await page.waitForSelector('.user-profile, .profile-container, [data-testid="user-profile"]', { 
        timeout: 10000 
      });
      
      // 查找关注按钮
      const followButton = await page.$('.follow-btn, .subscribe-btn, [data-testid="follow-btn"]');
      if (!followButton) {
        throw new Error('未找到关注按钮');
      }
      
      // 检查是否已经关注
      const isFollowing = await followButton.evaluate(btn => 
        btn.classList.contains('following') || 
        btn.classList.contains('subscribed') || 
        btn.getAttribute('data-following') === 'true'
      );
      
      if (isFollowing) {
        return {
          success: true,
          alreadyFollowing: true,
          message: '已关注该用户'
        };
      }
      
      // 模拟人类行为：随机延迟
      await page.waitForTimeout(Math.random() * 3000 + 1000);
      
      // 点击关注按钮
      await followButton.click();
      
      // 等待关注动画完成
      await page.waitForTimeout(1000);
      
      // 验证关注是否成功
      const followingAfter = await followButton.evaluate(btn => 
        btn.classList.contains('following') || 
        btn.classList.contains('subscribed') || 
        btn.getAttribute('data-following') === 'true'
      );
      
      if (followingAfter) {
        // 记录互动历史
        await this.recordInteractionHistory({
          accountId,
          interactionType: 'follow',
          targetId: userId,
          targetType: 'user',
          success: true
        });
        
        // 更新互动限制
        await this.updateInteractionLimit(accountId, 'follow');
        
        logger.info(`关注成功: 账号 ${accountId} 关注用户 ${userId}`);
        
        return {
          success: true,
          alreadyFollowing: false,
          message: '关注成功'
        };
      } else {
        throw new Error('关注失败');
      }
    } catch (error) {
      logger.error('关注失败:', error);
      
      // 记录失败历史
      await this.recordInteractionHistory({
        accountId,
        interactionType: 'follow',
        targetId: userId,
        targetType: 'user',
        success: false,
        errorMessage: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * 批量点赞
   * @param {Object} params - 参数
   * @returns {Promise<Object>} 批量点赞结果
   */
  async batchLikePosts(params) {
    const { accountId, postIds, postUrls, delay = 2000 } = params;
    
    try {
      if (!accountId) {
        throw new Error('账号ID不能为空');
      }
      
      if ((!postIds || postIds.length === 0) && (!postUrls || postUrls.length === 0)) {
        throw new Error('笔记ID或笔记链接不能为空');
      }
      
      const targets = postIds ? postIds.map(id => ({ id })) : postUrls.map(url => ({ url }));
      const results = [];
      
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        
        try {
          const result = await this.likePost({
            accountId,
            postId: target.id,
            postUrl: target.url
          });
          
          results.push({
            target: target.id || target.url,
            success: true,
            result
          });
        } catch (error) {
          results.push({
            target: target.id || target.url,
            success: false,
            error: error.message
          });
        }
        
        // 延迟处理
        if (i < targets.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      return {
        success: true,
        total: targets.length,
        successCount,
        failureCount,
        results
      };
    } catch (error) {
      logger.error('批量点赞失败:', error);
      throw error;
    }
  }
  
  /**
   * 检查互动限制
   * @param {string} accountId - 账号ID
   * @param {string} interactionType - 互动类型
   * @returns {Promise<Object>} 检查结果
   */
  async checkInteractionLimit(accountId, interactionType) {
    try {
      const limits = {
        like: { daily: 50, hourly: 10 },
        comment: { daily: 30, hourly: 5 },
        follow: { daily: 20, hourly: 3 }
      };
      
      const limit = limits[interactionType];
      if (!limit) {
        return { allowed: true };
      }
      
      // 检查24小时内的互动次数
      const dailyCount = await query(
        `SELECT COUNT(*) as count 
         FROM idea_xiaohongshu_interactions 
         WHERE account_id = ? AND interaction_type = ? AND success = 1 
         AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [accountId, interactionType]
      );
      
      if (dailyCount[0].count >= limit.daily) {
        return {
          allowed: false,
          reason: `24小时内${interactionType}次数已达上限(${limit.daily}次)`
        };
      }
      
      // 检查1小时内的互动次数
      const hourlyCount = await query(
        `SELECT COUNT(*) as count 
         FROM idea_xiaohongshu_interactions 
         WHERE account_id = ? AND interaction_type = ? AND success = 1 
         AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
        [accountId, interactionType]
      );
      
      if (hourlyCount[0].count >= limit.hourly) {
        return {
          allowed: false,
          reason: `1小时内${interactionType}次数已达上限(${limit.hourly}次)`
        };
      }
      
      return { allowed: true };
    } catch (error) {
      logger.error('检查互动限制失败:', error);
      return { allowed: false, reason: '检查限制时出错' };
    }
  }
  
  /**
   * 更新互动限制
   * @param {string} accountId - 账号ID
   * @param {string} interactionType - 互动类型
   */
  async updateInteractionLimit(accountId, interactionType) {
    try {
      // 这里可以实现更复杂的限制逻辑
      // 例如根据账号等级、活跃度等动态调整限制
      logger.debug(`更新互动限制: ${accountId} - ${interactionType}`);
    } catch (error) {
      logger.error('更新互动限制失败:', error);
    }
  }
  
  /**
   * 记录互动历史
   * @param {Object} history - 历史记录
   */
  async recordInteractionHistory(history) {
    const {
      accountId,
      interactionType,
      targetId,
      targetType,
      content,
      success,
      errorMessage
    } = history;
    
    try {
      const historyId = uuidv4();
      
      await query(
        `INSERT INTO idea_xiaohongshu_interactions 
         (id, account_id, interaction_type, target_id, target_type, content, success, error_message) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [historyId, accountId, interactionType, targetId, targetType, content, success, errorMessage]
      );
      
      logger.debug(`记录互动历史: ${accountId} - ${interactionType}`);
    } catch (error) {
      logger.error('记录互动历史失败:', error);
    }
  }
  
  /**
   * 评论内容审核
   * @param {string} content - 评论内容
   * @returns {Promise<Object>} 审核结果
   */
  async commentContentAudit(content) {
    try {
      // 敏感词检测
      const sensitiveWords = [
        '赌博', '色情', '毒品', '暴力', '恐怖主义',
        '政治敏感', '违法', '犯罪', '诈骗', '传销',
        '广告', '推广', '营销', '联系方式'
      ];
      
      const lowerContent = content.toLowerCase();
      
      for (const word of sensitiveWords) {
        if (lowerContent.includes(word)) {
          return {
            passed: false,
            reason: `评论包含敏感词: ${word}`
          };
        }
      }
      
      // 内容长度检查
      if (content.length > 500) {
        return {
          passed: false,
          reason: '评论内容长度不能超过500字符'
        };
      }
      
      // 重复内容检查
      if (content.length < 2) {
        return {
          passed: false,
          reason: '评论内容太短'
        };
      }
      
      return {
        passed: true,
        reason: ''
      };
    } catch (error) {
      logger.error('评论内容审核失败:', error);
      return {
        passed: false,
        reason: '审核过程出错'
      };
    }
  }
  
  /**
   * 获取互动历史
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 互动历史
   */
  async getInteractionHistory(params) {
    const { accountId, interactionType, targetId, page = 1, pageSize = 20 } = params;
    
    try {
      let whereClause = 'WHERE 1=1';
      const queryParams = [];
      
      if (accountId) {
        whereClause += ' AND account_id = ?';
        queryParams.push(accountId);
      }
      
      if (interactionType) {
        whereClause += ' AND interaction_type = ?';
        queryParams.push(interactionType);
      }
      
      if (targetId) {
        whereClause += ' AND target_id = ?';
        queryParams.push(targetId);
      }
      
      // 获取总数
      const countResult = await query(
        `SELECT COUNT(*) as total FROM idea_xiaohongshu_interactions ${whereClause}`,
        queryParams
      );
      
      const total = countResult[0].total;
      
      // 获取分页数据
      const offset = (page - 1) * pageSize;
      queryParams.push(offset, pageSize);
      
      const history = await query(
        `SELECT * FROM idea_xiaohongshu_interactions 
         ${whereClause} 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        queryParams
      );
      
      return {
        data: history,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      };
    } catch (error) {
      logger.error('获取互动历史失败:', error);
      throw error;
    }
  }
}