/**
 * 小红书任务执行器
 * 负责具体任务的执行逻辑和错误处理
 */

const logger = require('../utils/logger');
const XiaohongshuClient = require('./xiaohongshu-client');
const ContentExtractor = require('./content-extractor');

class TaskExecutor {
  constructor(browserManager) {
    this.browserManager = browserManager;
    this.activeExecutions = new Map();
  }

  /**
   * 执行任务
   */
  async execute(task) {
    const executionId = `${task.id}_${Date.now()}`;
    const startTime = Date.now();

    try {
      logger.info(`开始执行任务: ${task.id} (${task.task_type})`);

      // 获取账号信息
      const account = await this.getAccount(task.account_id);
      if (!account) {
        throw new Error(`账号 ${task.account_id} 不存在`);
      }

      // 检查账号状态
      if (account.status !== 'active') {
        throw new Error(`账号 ${account.username} 状态异常: ${account.status}`);
      }

      // 获取浏览器实例
      const browser = await this.browserManager.getBrowser(account);
      const client = new XiaohongshuClient(browser, account);

      // 记录执行状态
      this.activeExecutions.set(executionId, {
        task,
        account,
        startTime,
        status: 'running'
      });

      // 根据任务类型执行
      let result;
      switch (task.task_type) {
        case 'create_post':
          result = await this.executeCreatePost(client, task);
          break;
        case 'create_comment':
          result = await this.executeCreateComment(client, task);
          break;
        case 'like_post':
          result = await this.executeLikePost(client, task);
          break;
        case 'follow_user':
          result = await this.executeFollowUser(client, task);
          break;
        case 'scrape_data':
          result = await this.executeScrapeData(client, task);
          break;
        case 'login':
          result = await this.executeLogin(client, task);
          break;
        case 'upload_image':
          result = await this.executeUploadImage(client, task);
          break;
        case 'upload_video':
          result = await this.executeUploadVideo(client, task);
          break;
        default:
          throw new Error(`未知的任务类型: ${task.task_type}`);
      }

      // 更新执行状态
      this.activeExecutions.set(executionId, {
        ...this.activeExecutions.get(executionId),
        status: 'completed',
        endTime: Date.now()
      });

      const duration = Date.now() - startTime;
      logger.info(`任务执行成功: ${task.id} (耗时 ${duration}ms)`);

      return result;
    } catch (error) {
      this.activeExecutions.set(executionId, {
        ...this.activeExecutions.get(executionId),
        status: 'failed',
        error: error.message,
        endTime: Date.now()
      });

      logger.error(`任务执行失败: ${task.id}`, error);
      throw error;
    } finally {
      // 延迟清理执行记录
      setTimeout(() => {
        this.activeExecutions.delete(executionId);
      }, 60000); // 1分钟后清理
    }
  }

  /**
   * 获取账号信息
   */
  async getAccount(accountId) {
    // 这里应该从数据库获取账号信息
    // 为简化代码，这里返回模拟数据
    return {
      id: accountId,
      username: 'test_user',
      status: 'active',
      cookies: {},
      proxy: null,
      fingerprint: null
    };
  }

  /**
   * 执行发布笔记任务
   */
  async executeCreatePost(client, task) {
    const { title, content, images, tags, topic } = task.task_data;

    try {
      logger.info(`开始发布笔记: ${title}`);

      // 1. 登录检查
      if (!await client.isLoggedIn()) {
        await client.login();
      }

      // 2. 上传图片/视频
      let mediaUrls = [];
      if (images && images.length > 0) {
        mediaUrls = await client.uploadImages(images);
      }

      // 3. 创建笔记
      const postId = await client.createPost({
        title,
        content,
        images: mediaUrls,
        tags,
        topic
      });

      logger.info(`笔记发布成功: ${postId}`);

      return {
        postId,
        title,
        url: `https://www.xiaohongshu.com/explore/${postId}`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('发布笔记失败:', error);
      throw error;
    }
  }

  /**
   * 执行评论任务
   */
  async executeCreateComment(client, task) {
    const { postId, content, parentCommentId } = task.task_data;

    try {
      logger.info(`开始发表评论: ${postId}`);

      // 1. 登录检查
      if (!await client.isLoggedIn()) {
        await client.login();
      }

      // 2. 创建评论
      const commentId = await client.createComment({
        postId,
        content,
        parentCommentId
      });

      logger.info(`评论发表成功: ${commentId}`);

      return {
        commentId,
        postId,
        content,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('发表评论失败:', error);
      throw error;
    }
  }

  /**
   * 执行点赞任务
   */
  async executeLikePost(client, task) {
    const { postId, action = 'like' } = task.task_data;

    try {
      logger.info(`开始${action === 'like' ? '点赞' : '取消点赞'}: ${postId}`);

      // 1. 登录检查
      if (!await client.isLoggedIn()) {
        await client.login();
      }

      // 2. 执行点赞/取消点赞
      const success = await client.likePost(postId, action === 'like');

      if (!success) {
        throw new Error('点赞操作失败');
      }

      logger.info(`${action === 'like' ? '点赞' : '取消点赞'}成功: ${postId}`);

      return {
        postId,
        action,
        success: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('点赞操作失败:', error);
      throw error;
    }
  }

  /**
   * 执行关注任务
   */
  async executeFollowUser(client, task) {
    const { userId, action = 'follow' } = task.task_data;

    try {
      logger.info(`开始${action === 'follow' ? '关注' : '取消关注'}用户: ${userId}`);

      // 1. 登录检查
      if (!await client.isLoggedIn()) {
        await client.login();
      }

      // 2. 执行关注/取消关注
      const success = await client.followUser(userId, action === 'follow');

      if (!success) {
        throw new Error('关注操作失败');
      }

      logger.info(`${action === 'follow' ? '关注' : '取消关注'}用户成功: ${userId}`);

      return {
        userId,
        action,
        success: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('关注操作失败:', error);
      throw error;
    }
  }

  /**
   * 执行数据采集任务
   */
  async executeScrapeData(client, task) {
    const { type, targetId, limit = 50, filters = {} } = task.task_data;

    try {
      logger.info(`开始数据采集: ${type} - ${targetId}`);

      // 1. 登录检查
      if (!await client.isLoggedIn()) {
        await client.login();
      }

      let data;

      switch (type) {
        case 'user_info':
          data = await client.getUserInfo(targetId);
          break;
        case 'user_posts':
          data = await client.getUserPosts(targetId, limit);
          break;
        case 'post_details':
          data = await client.getPostDetails(targetId);
          break;
        case 'post_comments':
          data = await client.getPostComments(targetId, limit);
          break;
        case 'trending_posts':
          data = await client.getTrendingPosts(filters.category, limit);
          break;
        case 'search_posts':
          data = await client.searchPosts(filters.keyword, limit);
          break;
        default:
          throw new Error(`未知的数据采集类型: ${type}`);
      }

      logger.info(`数据采集完成: ${type} - ${targetId}, 共 ${data.length || 1} 条数据`);

      return {
        type,
        targetId,
        data,
        count: data.length || 1,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('数据采集失败:', error);
      throw error;
    }
  }

  /**
   * 执行登录任务
   */
  async executeLogin(client, task) {
    const { username, password, verificationCode } = task.task_data;

    try {
      logger.info(`开始登录: ${username}`);

      const success = await client.login(username, password, verificationCode);

      if (!success) {
        throw new Error('登录失败');
      }

      logger.info(`登录成功: ${username}`);

      return {
        username,
        success: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('登录失败:', error);
      throw error;
    }
  }

  /**
   * 执行图片上传任务
   */
  async executeUploadImage(client, task) {
    const { imagePath, description } = task.task_data;

    try {
      logger.info(`开始上传图片: ${imagePath}`);

      // 1. 登录检查
      if (!await client.isLoggedIn()) {
        await client.login();
      }

      // 2. 上传图片
      const imageUrl = await client.uploadImage(imagePath, description);

      logger.info(`图片上传成功: ${imageUrl}`);

      return {
        imageUrl,
        description,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('图片上传失败:', error);
      throw error;
    }
  }

  /**
   * 执行视频上传任务
   */
  async executeUploadVideo(client, task) {
    const { videoPath, title, description, tags } = task.task_data;

    try {
      logger.info(`开始上传视频: ${videoPath}`);

      // 1. 登录检查
      if (!await client.isLoggedIn()) {
        await client.login();
      }

      // 2. 上传视频
      const videoUrl = await client.uploadVideo(videoPath, {
        title,
        description,
        tags
      });

      logger.info(`视频上传成功: ${videoUrl}`);

      return {
        videoUrl,
        title,
        description,
        tags,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('视频上传失败:', error);
      throw error;
    }
  }

  /**
   * 取消任务执行
   */
  async cancel(taskId) {
    for (const [executionId, execution] of this.activeExecutions) {
      if (execution.task.id === taskId) {
        execution.status = 'cancelled';
        logger.info(`任务已取消: ${taskId}`);
        return true;
      }
    }
    return false;
  }

  /**
   * 获取活动执行状态
   */
  getActiveExecutions() {
    return Array.from(this.activeExecutions.values()).map(execution => ({
      taskId: execution.task.id,
      taskType: execution.task.task_type,
      accountId: execution.account.id,
      status: execution.status,
      startTime: execution.startTime,
      duration: Date.now() - execution.startTime
    }));
  }
}

module.exports = TaskExecutor;