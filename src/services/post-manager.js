/**
 * 内容发布管理器
 * 管理小红书内容的发布、搜索、推荐等功能
 */

import { logger } from '../utils/logger.js';
import { query, transaction } from '../database/index.js';
import { BrowserManager } from '../browser/browser-manager.js';
import { AccountManager } from './account-manager.js';
import { TaskManager } from './task-manager.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 内容发布管理器类
 */
export class PostManager {
  constructor() {
    this.browserManager = new BrowserManager();
    this.accountManager = new AccountManager();
    this.taskManager = new TaskManager();
    this.postingQueue = new Map(); // 发布队列
  }
  
  /**
   * 搜索笔记
   * @param {Object} searchParams - 搜索参数
   * @returns {Promise<Object>} 搜索结果
   */
  async searchPosts(searchParams) {
    const { 
      keyword, 
      category = 'all', 
      sort = 'relevance', 
      page = 1, 
      pageSize = 20,
      accountId 
    } = searchParams;
    
    try {
      // 验证参数
      if (!keyword || keyword.trim().length === 0) {
        throw new Error('搜索关键词不能为空');
      }
      
      // 获取账号会话
      let page;
      if (accountId) {
        const session = this.accountManager.getLoginSession(accountId);
        if (!session) {
          throw new Error('账号未登录');
        }
        
        page = await this.browserManager.getPage({
          accountId,
          cookies: session.cookies
        });
      } else {
        // 使用匿名浏览器
        page = await this.browserManager.getPage();
      }
      
      // 导航到搜索页面
      const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&type=${category}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle' });
      
      // 等待搜索结果加载
      await page.waitForSelector('.search-result-container, .feeds-container, [data-testid="search-results"]', { 
        timeout: 10000 
      });
      
      // 获取搜索结果
      const posts = await page.evaluate((sortType) => {
        const results = [];
        
        // 查找笔记元素
        const postElements = document.querySelectorAll(
          '.note-item, .feed-item, [data-testid="note-card"], .search-item'
        );
        
        postElements.forEach((element, index) => {
          try {
            // 提取笔记信息
            const titleElement = element.querySelector('.title, .note-title, [data-testid="title"]');
            const descElement = element.querySelector('.desc, .description, [data-testid="description"]');
            const authorElement = element.querySelector('.author, .user-name, [data-testid="author"]');
            const likeElement = element.querySelector('.like-count, .likes, [data-testid="likes"]');
            const collectElement = element.querySelector('.collect-count, .collects, [data-testid="collects"]');
            const commentElement = element.querySelector('.comment-count, .comments, [data-testid="comments"]');
            const imageElement = element.querySelector('img, .cover-image, [data-testid="cover"]');
            const linkElement = element.querySelector('a, [data-testid="link"]');
            
            const post = {
              id: element.getAttribute('data-note-id') || `search_${index}`,
              title: titleElement ? titleElement.textContent.trim() : '',
              description: descElement ? descElement.textContent.trim() : '',
              author: authorElement ? authorElement.textContent.trim() : '',
              likes: likeElement ? parseInt(likeElement.textContent.trim()) || 0 : 0,
              collects: collectElement ? parseInt(collectElement.textContent.trim()) || 0 : 0,
              comments: commentElement ? parseInt(commentElement.textContent.trim()) || 0 : 0,
              imageUrl: imageElement ? imageElement.src : '',
              postUrl: linkElement ? linkElement.href : '',
              tags: [],
              createdTime: new Date().toISOString()
            };
            
            // 提取标签
            const tagElements = element.querySelectorAll('.tag, [data-testid="tag"]');
            post.tags = Array.from(tagElements).map(tag => tag.textContent.trim());
            
            results.push(post);
          } catch (error) {
            console.error('解析笔记失败:', error);
          }
        });
        
        // 根据排序类型排序
        if (sortType === 'likes') {
          results.sort((a, b) => b.likes - a.likes);
        } else if (sortType === 'comments') {
          results.sort((a, b) => b.comments - a.comments);
        } else if (sortType === 'time') {
          // 按时间排序（这里假设时间信息可用）
        }
        
        return results;
      }, sort);
      
      // 保存搜索记录
      await this.saveSearchHistory({
        keyword,
        category,
        accountId,
        resultCount: posts.length
      });
      
      // 分页处理
      const total = posts.length;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedPosts = posts.slice(startIndex, endIndex);
      
      logger.info(`搜索笔记成功: ${keyword}, 找到 ${total} 条结果`);
      
      return {
        data: paginatedPosts,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        },
        searchInfo: {
          keyword,
          category,
          sort,
          searchTime: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('搜索笔记失败:', error);
      throw new Error('搜索笔记失败: ' + error.message);
    }
  }
  
  /**
   * 获取推荐内容
   * @param {Object} params - 参数
   * @returns {Promise<Object>} 推荐内容
   */
  async getRecommendations(params) {
    const { category = 'all', accountId, page = 1, pageSize = 20 } = params;
    
    try {
      // 获取账号会话
      let page;
      if (accountId) {
        const session = this.accountManager.getLoginSession(accountId);
        if (!session) {
          throw new Error('账号未登录');
        }
        
        page = await this.browserManager.getPage({
          accountId,
          cookies: session.cookies
        });
      } else {
        // 使用匿名浏览器
        page = await this.browserManager.getPage();
      }
      
      // 导航到首页
      await page.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle' });
      
      // 等待推荐内容加载
      await page.waitForSelector('.recommend-container, .feeds-container, [data-testid="recommendations"]', { 
        timeout: 10000 
      });
      
      // 获取推荐内容
      const recommendations = await page.evaluate((categoryType) => {
        const results = [];
        
        // 查找推荐内容元素
        const feedElements = document.querySelectorAll(
          '.feed-item, .recommend-item, [data-testid="feed-card"], .note-card'
        );
        
        feedElements.forEach((element, index) => {
          try {
            // 提取内容信息
            const titleElement = element.querySelector('.title, .feed-title, [data-testid="title"]');
            const descElement = element.querySelector('.desc, .feed-desc, [data-testid="description"]');
            const authorElement = element.querySelector('.author, .user-name, [data-testid="author"]');
            const likeElement = element.querySelector('.like-count, .likes, [data-testid="likes"]');
            const collectElement = element.querySelector('.collect-count, .collects, [data-testid="collects"]');
            const commentElement = element.querySelector('.comment-count, .comments, [data-testid="comments"]');
            const imageElement = element.querySelector('img, .cover-image, [data-testid="cover"]');
            const linkElement = element.querySelector('a, [data-testid="link"]');
            const categoryElement = element.querySelector('.category, [data-testid="category"]');
            
            // 过滤指定分类
            if (categoryType !== 'all' && categoryElement) {
              const contentCategory = categoryElement.textContent.trim();
              if (contentCategory !== categoryType) {
                return;
              }
            }
            
            const post = {
              id: element.getAttribute('data-note-id') || `recommend_${index}`,
              title: titleElement ? titleElement.textContent.trim() : '',
              description: descElement ? descElement.textContent.trim() : '',
              author: authorElement ? authorElement.textContent.trim() : '',
              likes: likeElement ? parseInt(likeElement.textContent.trim()) || 0 : 0,
              collects: collectElement ? parseInt(collectElement.textContent.trim()) || 0 : 0,
              comments: commentElement ? parseInt(commentElement.textContent.trim()) || 0 : 0,
              imageUrl: imageElement ? imageElement.src : '',
              postUrl: linkElement ? linkElement.href : '',
              category: categoryElement ? categoryElement.textContent.trim() : '',
              tags: [],
              isRecommended: true,
              createdTime: new Date().toISOString()
            };
            
            // 提取标签
            const tagElements = element.querySelectorAll('.tag, [data-testid="tag"]');
            post.tags = Array.from(tagElements).map(tag => tag.textContent.trim());
            
            results.push(post);
          } catch (error) {
            console.error('解析推荐内容失败:', error);
          }
        });
        
        return results;
      }, category);
      
      // 分页处理
      const total = recommendations.length;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedRecommendations = recommendations.slice(startIndex, endIndex);
      
      logger.info(`获取推荐内容成功: 找到 ${total} 条推荐`);
      
      return {
        data: paginatedRecommendations,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        },
        category,
        recommendTime: new Date().toISOString()
      };
    } catch (error) {
      logger.error('获取推荐内容失败:', error);
      throw new Error('获取推荐内容失败: ' + error.message);
    }
  }
  
  /**
   * 发布笔记
   * @param {Object} postData - 发布数据
   * @returns {Promise<Object>} 发布结果
   */
  async createPost(postData) {
    const {
      accountId,
      title,
      content,
      images,
      video,
      tags = [],
      topic,
      type = 'image',
      scheduledTime,
      publishNow = false
    } = postData;
    
    try {
      // 验证参数
      if (!accountId) {
        throw new Error('账号ID不能为空');
      }
      
      if (!title || title.trim().length === 0) {
        throw new Error('标题不能为空');
      }
      
      if (type === 'image' && (!images || images.length === 0)) {
        throw new Error('图片笔记至少需要一张图片');
      }
      
      if (type === 'video' && !video) {
        throw new Error('视频笔记需要视频文件');
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
      
      // 内容审核
      const auditResult = await this.contentAudit({
        title,
        content,
        tags,
        topic
      });
      
      if (!auditResult.passed) {
        throw new Error(`内容审核未通过: ${auditResult.reason}`);
      }
      
      // 创建发布任务
      const taskId = uuidv4();
      const postId = uuidv4();
      
      // 保存到数据库
      const result = await query(
        `INSERT INTO idea_xiaohongshu_posts 
         (id, account_id, title, content, type, status, images_data, video_data, tags, topic, scheduled_time) 
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
        [postId, accountId, title, content, type, JSON.stringify(images), JSON.stringify(video), JSON.stringify(tags), topic, scheduledTime]
      );
      
      if (publishNow || !scheduledTime) {
        // 立即发布
        const publishResult = await this.publishPost(postId);
        return publishResult;
      } else {
        // 添加到任务队列
        await this.taskManager.createTask({
          taskType: 'publish_post',
          accountId,
          taskData: {
            postId,
            title,
            content,
            images,
            video,
            tags,
            topic,
            type
          },
          scheduledTime,
          priority: 1
        });
        
        logger.info(`创建发布任务成功: ${title} (ID: ${postId})`);
        
        return {
          success: true,
          postId,
          status: 'scheduled',
          scheduledTime,
          message: '发布任务已创建，将在指定时间发布'
        };
      }
    } catch (error) {
      logger.error('创建发布任务失败:', error);
      throw error;
    }
  }
  
  /**
   * 发布笔记到小红书
   * @param {string} postId - 笔记ID
   * @returns {Promise<Object>} 发布结果
   */
  async publishPost(postId) {
    try {
      // 获取笔记信息
      const post = await query(
        'SELECT * FROM idea_xiaohongshu_posts WHERE id = ?',
        [postId]
      );
      
      if (post.length === 0) {
        throw new Error('笔记不存在');
      }
      
      const postData = post[0];
      
      // 检查账号状态
      const account = await query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ? AND status = "active"',
        [postData.account_id]
      );
      
      if (account.length === 0) {
        throw new Error('账号不存在或不可用');
      }
      
      const accountData = account[0];
      
      // 检查是否已登录
      const session = this.accountManager.getLoginSession(postData.account_id);
      if (!session) {
        throw new Error('账号未登录');
      }
      
      // 获取浏览器页面
      const page = await this.browserManager.getPage({
        accountId: postData.account_id,
        cookies: session.cookies
      });
      
      // 导航到发布页面
      await page.goto('https://www.xiaohongshu.com/publish', { waitUntil: 'networkidle' });
      
      // 等待发布页面加载
      await page.waitForSelector('.publish-container, .upload-container, [data-testid="publish-form"]', { 
        timeout: 10000 
      });
      
      // 发布内容
      let publishResult;
      if (postData.type === 'image') {
        publishResult = await this.publishImagePost(page, postData);
      } else if (postData.type === 'video') {
        publishResult = await this.publishVideoPost(page, postData);
      } else {
        throw new Error('不支持的笔记类型');
      }
      
      if (publishResult.success) {
        // 更新笔记状态
        await query(
          `UPDATE idea_xiaohongshu_posts 
           SET status = 'published', post_id = ?, published_time = NOW() 
           WHERE id = ?`,
          [publishResult.postId, postId]
        );
        
        logger.info(`发布笔记成功: ${postData.title} (ID: ${postId})`);
        
        return {
          success: true,
          postId,
          xiaohongshuPostId: publishResult.postId,
          publishedTime: new Date().toISOString(),
          message: '发布成功'
        };
      } else {
        // 更新失败状态
        await query(
          'UPDATE idea_xiaohongshu_posts SET status = "failed" WHERE id = ?',
          [postId]
        );
        
        throw new Error(`发布失败: ${publishResult.error}`);
      }
    } catch (error) {
      logger.error('发布笔记失败:', error);
      
      // 更新失败状态
      await query(
        'UPDATE idea_xiaohongshu_posts SET status = "failed" WHERE id = ?',
        [postId]
      );
      
      throw error;
    }
  }
  
  /**
   * 发布图文笔记
   * @param {Object} page - 浏览器页面
   * @param {Object} postData - 笔记数据
   * @returns {Promise<Object>} 发布结果
   */
  async publishImagePost(page, postData) {
    try {
      const { title, content, images, tags, topic } = postData;
      
      // 上传图片
      const imagesData = JSON.parse(images);
      if (imagesData && imagesData.length > 0) {
        const fileInput = await page.$('input[type="file"], [data-testid="image-upload"]');
        if (fileInput) {
          // 处理图片上传逻辑
          // 这里需要根据实际的文件路径或URL来处理
          logger.info(`准备上传 ${imagesData.length} 张图片`);
        }
      }
      
      // 填写标题
      const titleInput = await page.$('input[placeholder*="标题"], textarea[placeholder*="标题"], [data-testid="title-input"]');
      if (titleInput) {
        await titleInput.fill(title);
      }
      
      // 填写内容
      const contentInput = await page.$('textarea[placeholder*="内容"], [data-testid="content-input"]');
      if (contentInput) {
        await contentInput.fill(content);
      }
      
      // 添加标签
      if (tags && tags.length > 0) {
        const tagInput = await page.$('input[placeholder*="标签"], [data-testid="tag-input"]');
        if (tagInput) {
          for (const tag of tags) {
            await tagInput.fill(tag);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500); // 等待标签添加
          }
        }
      }
      
      // 添加话题
      if (topic) {
        const topicInput = await page.$('input[placeholder*="话题"], [data-testid="topic-input"]');
        if (topicInput) {
          await topicInput.fill(topic);
        }
      }
      
      // 点击发布按钮
      const publishButton = await page.$('button[type="submit"], .publish-btn, [data-testid="publish-btn"]');
      if (publishButton) {
        await publishButton.click();
        
        // 等待发布完成
        try {
          await page.waitForSelector('.publish-success, .success-message, [data-testid="publish-success"]', { 
            timeout: 30000 
          });
          
          // 获取发布后的笔记ID
          const postId = await page.evaluate(() => {
            const url = window.location.href;
            const match = url.match(/\/discovery\/item\/([a-zA-Z0-9]+)/);
            return match ? match[1] : null;
          });
          
          return {
            success: true,
            postId
          };
        } catch (timeoutError) {
          // 检查是否有错误信息
          const errorElement = await page.$('.error-message, .publish-error, [data-testid="error-message"]');
          if (errorElement) {
            const errorText = await errorElement.textContent();
            return {
              success: false,
              error: errorText
            };
          }
          
          throw new Error('发布超时');
        }
      } else {
        throw new Error('未找到发布按钮');
      }
    } catch (error) {
      logger.error('发布图文笔记失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 发布视频笔记
   * @param {Object} page - 浏览器页面
   * @param {Object} postData - 笔记数据
   * @returns {Promise<Object>} 发布结果
   */
  async publishVideoPost(page, postData) {
    try {
      const { title, content, video, tags, topic } = postData;
      
      // 切换到视频发布模式
      const videoTab = await page.$('.video-tab, [data-testid="video-tab"]');
      if (videoTab) {
        await videoTab.click();
        await page.waitForTimeout(1000); // 等待切换
      }
      
      // 上传视频
      const videoData = JSON.parse(video);
      if (videoData) {
        const fileInput = await page.$('input[type="file"], [data-testid="video-upload"]');
        if (fileInput) {
          // 处理视频上传逻辑
          logger.info('准备上传视频');
        }
      }
      
      // 填写标题
      const titleInput = await page.$('input[placeholder*="标题"], textarea[placeholder*="标题"], [data-testid="title-input"]');
      if (titleInput) {
        await titleInput.fill(title);
      }
      
      // 填写内容
      const contentInput = await page.$('textarea[placeholder*="内容"], [data-testid="content-input"]');
      if (contentInput) {
        await contentInput.fill(content);
      }
      
      // 添加标签
      if (tags && tags.length > 0) {
        const tagInput = await page.$('input[placeholder*="标签"], [data-testid="tag-input"]');
        if (tagInput) {
          for (const tag of tags) {
            await tagInput.fill(tag);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);
          }
        }
      }
      
      // 添加话题
      if (topic) {
        const topicInput = await page.$('input[placeholder*="话题"], [data-testid="topic-input"]');
        if (topicInput) {
          await topicInput.fill(topic);
        }
      }
      
      // 点击发布按钮
      const publishButton = await page.$('button[type="submit"], .publish-btn, [data-testid="publish-btn"]');
      if (publishButton) {
        await publishButton.click();
        
        // 等待发布完成
        try {
          await page.waitForSelector('.publish-success, .success-message, [data-testid="publish-success"]', { 
            timeout: 60000 // 视频发布可能需要更长时间
          });
          
          // 获取发布后的笔记ID
          const postId = await page.evaluate(() => {
            const url = window.location.href;
            const match = url.match(/\/discovery\/item\/([a-zA-Z0-9]+)/);
            return match ? match[1] : null;
          });
          
          return {
            success: true,
            postId
          };
        } catch (timeoutError) {
          const errorElement = await page.$('.error-message, .publish-error, [data-testid="error-message"]');
          if (errorElement) {
            const errorText = await errorElement.textContent();
            return {
              success: false,
              error: errorText
            };
          }
          
          throw new Error('发布超时');
        }
      } else {
        throw new Error('未找到发布按钮');
      }
    } catch (error) {
      logger.error('发布视频笔记失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 内容审核
   * @param {Object} content - 内容数据
   * @returns {Promise<Object>} 审核结果
   */
  async contentAudit(content) {
    const { title, content: text, tags, topic } = content;
    
    try {
      // 敏感词检测
      const sensitiveWords = [
        '赌博', '色情', '毒品', '暴力', '恐怖主义',
        '政治敏感', '违法', '犯罪', '诈骗', '传销'
      ];
      
      const fullText = `${title} ${text} ${tags.join(' ')} ${topic || ''}`.toLowerCase();
      
      for (const word of sensitiveWords) {
        if (fullText.includes(word)) {
          return {
            passed: false,
            reason: `内容包含敏感词: ${word}`
          };
        }
      }
      
      // 内容长度检查
      if (title.length > 100) {
        return {
          passed: false,
          reason: '标题长度超过限制(100字符)'
        };
      }
      
      if (text.length > 5000) {
        return {
          passed: false,
          reason: '内容长度超过限制(5000字符)'
        };
      }
      
      if (tags.length > 10) {
        return {
          passed: false,
          reason: '标签数量超过限制(10个)'
        };
      }
      
      return {
        passed: true,
        reason: ''
      };
    } catch (error) {
      logger.error('内容审核失败:', error);
      return {
        passed: false,
        reason: '审核过程出错'
      };
    }
  }
  
  /**
   * 保存搜索历史
   * @param {Object} searchData - 搜索数据
   */
  async saveSearchHistory(searchData) {
    const { keyword, category, accountId, resultCount } = searchData;
    
    try {
      // 这里可以实现搜索历史的保存逻辑
      // 例如保存到数据库或缓存中
      logger.debug(`保存搜索历史: ${keyword} (${resultCount} 结果)`);
    } catch (error) {
      logger.error('保存搜索历史失败:', error);
    }
  }
  
  /**
   * 获取发布队列状态
   * @returns {Object} 队列状态
   */
  getQueueStatus() {
    return {
      total: this.postingQueue.size,
      queues: Array.from(this.postingQueue.entries()).map(([key, item]) => ({
        key,
        accountId: item.accountId,
        title: item.title,
        status: item.status,
        createdAt: item.createdAt
      }))
    };
  }
}