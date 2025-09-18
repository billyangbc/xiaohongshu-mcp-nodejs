/**
 * MCP互动功能处理器
 * 提供点赞、评论、关注等互动功能的MCP接口
 */

import { logger } from '../utils/logger.js';
import { InteractionManager } from '../services/interaction-manager.js';
import { validateParams } from '../utils/validation.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 互动管理器实例
 */
const interactionManager = new InteractionManager();

/**
 * MCP互动功能处理器
 */
export const interactionHandlers = {
  
  /**
   * 点赞笔记
   * 参数: accountId, postId/postUrl
   * 返回: 点赞结果
   */
  'xiaohongshu.interaction.like': async (params) => {
    try {
      logger.info('执行点赞操作:', params);
      
      // 参数验证
      const schema = {
        accountId: { type: 'number', required: true, min: 1 },
        postId: { type: 'string', required: false },
        postUrl: { type: 'string', required: false }
      };
      
      const validation = validateParams(params, schema);
      if (!validation.valid) {
        return {
          success: false,
          error: `参数验证失败: ${validation.errors.join(', ')}`
        };
      }
      
      // 检查必要参数
      if (!params.postId && !params.postUrl) {
        return {
          success: false,
          error: 'postId或postUrl参数必须提供至少一个'
        };
      }
      
      // 执行点赞
      const result = await interactionManager.likePost({
        accountId: params.accountId,
        postId: params.postId,
        postUrl: params.postUrl
      });
      
      return {
        success: true,
        data: result,
        message: result.message || '点赞操作完成'
      };
    } catch (error) {
      logger.error('点赞操作失败:', error);
      return {
        success: false,
        error: error.message || '点赞操作失败'
      };
    }
  },
  
  /**
   * 评论笔记
   * 参数: accountId, postId/postUrl, content, replyToCommentId(可选)
   * 返回: 评论结果
   */
  'xiaohongshu.interaction.comment': async (params) => {
    try {
      logger.info('执行评论操作:', params);
      
      // 参数验证
      const schema = {
        accountId: { type: 'number', required: true, min: 1 },
        postId: { type: 'string', required: false },
        postUrl: { type: 'string', required: false },
        content: { type: 'string', required: true, min: 1, max: 500 },
        replyToCommentId: { type: 'string', required: false }
      };
      
      const validation = validateParams(params, schema);
      if (!validation.valid) {
        return {
          success: false,
          error: `参数验证失败: ${validation.errors.join(', ')}`
        };
      }
      
      // 检查必要参数
      if (!params.postId && !params.postUrl) {
        return {
          success: false,
          error: 'postId或postUrl参数必须提供至少一个'
        };
      }
      
      // 执行评论
      const result = await interactionManager.commentPost({
        accountId: params.accountId,
        postId: params.postId,
        postUrl: params.postUrl,
        content: params.content,
        replyToCommentId: params.replyToCommentId
      });
      
      return {
        success: true,
        data: result,
        message: result.message || '评论操作完成'
      };
    } catch (error) {
      logger.error('评论操作失败:', error);
      return {
        success: false,
        error: error.message || '评论操作失败'
      };
    }
  },
  
  /**
   * 关注用户
   * 参数: accountId, userId/userUrl
   * 返回: 关注结果
   */
  'xiaohongshu.interaction.follow': async (params) => {
    try {
      logger.info('执行关注操作:', params);
      
      // 参数验证
      const schema = {
        accountId: { type: 'number', required: true, min: 1 },
        userId: { type: 'string', required: false },
        userUrl: { type: 'string', required: false }
      };
      
      const validation = validateParams(params, schema);
      if (!validation.valid) {
        return {
          success: false,
          error: `参数验证失败: ${validation.errors.join(', ')}`
        };
      }
      
      // 检查必要参数
      if (!params.userId && !params.userUrl) {
        return {
          success: false,
          error: 'userId或userUrl参数必须提供至少一个'
        };
      }
      
      // 执行关注
      const result = await interactionManager.followUser({
        accountId: params.accountId,
        userId: params.userId,
        userUrl: params.userUrl
      });
      
      return {
        success: true,
        data: result,
        message: result.message || '关注操作完成'
      };
    } catch (error) {
      logger.error('关注操作失败:', error);
      return {
        success: false,
        error: error.message || '关注操作失败'
      };
    }
  },
  
  /**
   * 批量点赞
   * 参数: accountId, postIds/postUrls, delay(可选)
   * 返回: 批量点赞结果
   */
  'xiaohongshu.interaction.batchLike': async (params) => {
    try {
      logger.info('执行批量点赞操作:', params);
      
      // 参数验证
      const schema = {
        accountId: { type: 'number', required: true, min: 1 },
        postIds: { type: 'array', required: false },
        postUrls: { type: 'array', required: false },
        delay: { type: 'number', required: false, min: 1000, max: 10000 }
      };
      
      const validation = validateParams(params, schema);
      if (!validation.valid) {
        return {
          success: false,
          error: `参数验证失败: ${validation.errors.join(', ')}`
        };
      }
      
      // 检查必要参数
      if ((!params.postIds || params.postIds.length === 0) && 
          (!params.postUrls || params.postUrls.length === 0)) {
        return {
          success: false,
          error: 'postIds或postUrls参数必须提供至少一个'
        };
      }
      
      // 执行批量点赞
      const result = await interactionManager.batchLikePosts({
        accountId: params.accountId,
        postIds: params.postIds,
        postUrls: params.postUrls,
        delay: params.delay || 2000
      });
      
      return {
        success: true,
        data: result,
        message: `批量点赞完成: 成功 ${result.successCount}/${result.total} 个`
      };
    } catch (error) {
      logger.error('批量点赞操作失败:', error);
      return {
        success: false,
        error: error.message || '批量点赞操作失败'
      };
    }
  },
  
  /**
   * 获取互动历史
   * 参数: accountId(可选), interactionType(可选), targetId(可选), page(可选), pageSize(可选)
   * 返回: 互动历史记录
   */
  'xiaohongshu.interaction.getHistory': async (params) => {
    try {
      logger.info('获取互动历史:', params);
      
      // 参数验证
      const schema = {
        accountId: { type: 'number', required: false, min: 1 },
        interactionType: { type: 'string', required: false, enum: ['like', 'comment', 'follow'] },
        targetId: { type: 'string', required: false },
        page: { type: 'number', required: false, min: 1 },
        pageSize: { type: 'number', required: false, min: 1, max: 100 }
      };
      
      const validation = validateParams(params, schema);
      if (!validation.valid) {
        return {
          success: false,
          error: `参数验证失败: ${validation.errors.join(', ')}`
        };
      }
      
      // 获取互动历史
      const result = await interactionManager.getInteractionHistory({
        accountId: params.accountId,
        interactionType: params.interactionType,
        targetId: params.targetId,
        page: params.page || 1,
        pageSize: params.pageSize || 20
      });
      
      return {
        success: true,
        data: result.data,
        pagination: result.pagination,
        message: '获取互动历史成功'
      };
    } catch (error) {
      logger.error('获取互动历史失败:', error);
      return {
        success: false,
        error: error.message || '获取互动历史失败'
      };
    }
  },
  
  /**
   * 获取互动统计
   * 参数: accountId(可选), date(可选)
   * 返回: 互动统计数据
   */
  'xiaohongshu.interaction.getStats': async (params) => {
    try {
      logger.info('获取互动统计:', params);
      
      // 参数验证
      const schema = {
        accountId: { type: 'number', required: false, min: 1 },
        date: { type: 'string', required: false }
      };
      
      const validation = validateParams(params, schema);
      if (!validation.valid) {
        return {
          success: false,
          error: `参数验证失败: ${validation.errors.join(', ')}`
        };
      }
      
      // 构建查询条件
      let whereClause = 'WHERE 1=1';
      const queryParams = [];
      
      if (params.accountId) {
        whereClause += ' AND account_id = ?';
        queryParams.push(params.accountId);
      }
      
      if (params.date) {
        whereClause += ' AND DATE(created_at) = ?';
        queryParams.push(params.date);
      }
      
      // 获取统计数据
      const stats = await query(
        `SELECT 
           interaction_type,
           COUNT(*) as total_count,
           SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
           SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure_count
         FROM idea_xiaohongshu_interactions 
         ${whereClause}
         GROUP BY interaction_type
         ORDER BY interaction_type`
      );
      
      // 获取总统计
      const totalStats = await query(
        `SELECT 
           COUNT(*) as total_count,
           SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
           SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure_count
         FROM idea_xiaohongshu_interactions 
         ${whereClause}`
      );
      
      return {
        success: true,
        data: {
          byType: stats,
          total: totalStats[0]
        },
        message: '获取互动统计成功'
      };
    } catch (error) {
      logger.error('获取互动统计失败:', error);
      return {
        success: false,
        error: error.message || '获取互动统计失败'
      };
    }
  }
};