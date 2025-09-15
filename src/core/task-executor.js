/**
 * 任务执行器 - 管理和执行各种小红书相关任务
 * 支持并发执行、重试机制、状态追踪和结果收集
 */

const { EventEmitter } = require('events');
const Bull = require('bull');
const cron = require('node-cron');
const logger = require('../utils/logger');

class TaskExecutor extends EventEmitter {
  constructor(options) {
    super();
    this.dbManager = options.dbManager;
    this.browserManager = options.browserManager;
    this.config = options.config;
    this.logger = logger;
    
    this.queues = new Map();
    this.workers = new Map();
    this.scheduledTasks = new Map();
    
    this.initializeQueues();
  }

  /**
   * 初始化任务队列
   */
  initializeQueues() {
    // 创建不同类型的任务队列
    const queueTypes = [
      'account_login',
      'post_publish',
      'content_search',
      'user_info',
      'post_info',
      'comments_fetch',
      'trending_fetch',
      'data_analysis',
      'account_sync'
    ];

    queueTypes.forEach(type => {
      const queue = new Bull(type, {
        redis: this.config.redis,
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });

      this.queues.set(type, queue);
      this.setupQueueProcessor(type, queue);
    });

    this.logger.info('任务队列初始化完成', { types: queueTypes });
  }

  /**
   * 设置队列处理器
   */
  setupQueueProcessor(type, queue) {
    queue.process(this.config.maxConcurrency, async (job) => {
      const { taskId, accountId, ...data } = job.data;
      
      try {
        // 更新任务状态为运行中
        await this.updateTaskStatus(taskId, 'running');
        
        // 执行任务逻辑
        const result = await this.executeTask(type, { taskId, accountId, ...data });
        
        // 更新任务状态为完成
        await this.updateTaskStatus(taskId, 'completed', result);
        
        return result;
      } catch (error) {
        // 更新任务状态为失败
        await this.updateTaskStatus(taskId, 'failed', null, error.message);
        
        // 记录失败日志
        await this.logTaskError(taskId, error);
        
        throw error;
      }
    });

    // 监听队列事件
    queue.on('completed', (job, result) => {
      this.emit('task:completed', { job, result });
    });

    queue.on('failed', (job, error) => {
      this.emit('task:failed', { job, error });
    });

    queue.on('stalled', (job) => {
      this.logger.warn('任务停滞', { jobId: job.id, taskId: job.data.taskId });
    });
  }

  /**
   * 初始化任务执行器
   */
  async initialize() {
    try {
      this.logger.info('⚙️ 初始化任务执行器...');
      
      // 加载待处理任务
      await this.loadPendingTasks();
      
      // 启动定时任务检查器
      this.startScheduledTaskChecker();
      
      // 启动任务清理器
      this.startTaskCleaner();
      
      this.logger.info('✅ 任务执行器初始化完成');
    } catch (error) {
      this.logger.error('❌ 任务执行器初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 创建任务
   */
  async createTask(taskData) {
    const { type, accountId, priority = 1, scheduledTime, cronExpression, ...data } = taskData;
    
    try {
      // 插入任务到数据库
      const [result] = await this.dbManager.query(
        `INSERT INTO idea_xiaohongshu_tasks 
         (task_type, account_id, task_data, cron_expression, priority, scheduled_time) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [type, accountId, JSON.stringify(data), cronExpression, priority, scheduledTime]
      );

      const taskId = result.insertId;

      // 如果是定时任务
      if (cronExpression) {
        this.scheduleCronTask(taskId, cronExpression, taskData);
      } else if (scheduledTime && new Date(scheduledTime) > new Date()) {
        // 如果是延迟任务
        this.scheduleDelayedTask(taskId, scheduledTime, taskData);
      } else {
        // 立即执行的任务
        await this.enqueueTask(type, { taskId, accountId, ...data }, priority);
      }

      this.emit('task:created', { taskId, type, accountId });
      
      return taskId;
    } catch (error) {
      this.logger.error('创建任务失败', { error: error.message, taskData });
      throw error;
    }
  }

  /**
   * 将任务加入队列
   */
  async enqueueTask(type, data, priority = 1) {
    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`任务类型不支持: ${type}`);
    }

    await queue.add(data, { priority });
  }

  /**
   * 执行任务
   */
  async executeTask(type, taskData) {
    switch (type) {
      case 'account_login':
        return await this.executeAccountLogin(taskData);
      case 'post_publish':
        return await this.executePostPublish(taskData);
      case 'content_search':
        return await this.executeContentSearch(taskData);
      case 'user_info':
        return await this.executeUserInfo(taskData);
      case 'post_info':
        return await this.executePostInfo(taskData);
      case 'comments_fetch':
        return await this.executeCommentsFetch(taskData);
      case 'trending_fetch':
        return await this.executeTrendingFetch(taskData);
      case 'data_analysis':
        return await this.executeDataAnalysis(taskData);
      case 'account_sync':
        return await this.executeAccountSync(taskData);
      default:
        throw new Error(`未知任务类型: ${type}`);
    }
  }

  /**
   * 执行账号登录任务
   */
  async executeAccountLogin({ taskId, accountId, method, credentials }) {
    try {
      // 获取账号信息
      const [accounts] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ?',
        [accountId]
      );

      if (accounts.length === 0) {
        throw new Error('账号不存在');
      }

      const account = accounts[0];
      
      // 获取代理和指纹信息
      const [proxies] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_proxies WHERE id = ?',
        [account.proxy_id]
      );

      const [fingerprints] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_fingerprints WHERE id = ?',
        [account.fingerprint_id]
      );

      const proxy = proxies[0];
      const fingerprint = fingerprints[0];

      // 创建浏览器上下文
      const context = await this.browserManager.createContext({
        proxy,
        fingerprint,
        accountId
      });

      // 执行登录操作
      const loginResult = await this.performLogin(context, account, method, credentials);

      // 更新账号状态
      await this.dbManager.query(
        'UPDATE idea_xiaohongshu_accounts SET login_status = ?, cookies_encrypted = ?, last_login_time = NOW() WHERE id = ?',
        [true, JSON.stringify(loginResult.cookies), accountId]
      );

      return {
        success: true,
        message: '登录成功',
        accountId,
        username: account.username
      };

    } catch (error) {
      this.logger.error('账号登录失败', { error: error.message, accountId });
      throw error;
    }
  }

  /**
   * 执行笔记发布任务
   */
  async executePostPublish({ taskId, accountId, postId, immediate }) {
    try {
      // 获取账号和笔记信息
      const [accounts] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ? AND login_status = TRUE',
        [accountId]
      );

      if (accounts.length === 0) {
        throw new Error('账号不存在或未登录');
      }

      const [posts] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_posts WHERE id = ? AND account_id = ?',
        [postId, accountId]
      );

      if (posts.length === 0) {
        throw new Error('笔记不存在');
      }

      const account = accounts[0];
      const post = posts[0];

      // 获取浏览器上下文
      const context = await this.browserManager.getContext(accountId);

      // 执行发布操作
      const publishResult = await this.performPublish(context, post);

      // 更新笔记状态
      await this.dbManager.query(
        'UPDATE idea_xiaohongshu_posts SET status = "published", post_id = ?, published_time = NOW() WHERE id = ?',
        [publishResult.postId, postId]
      );

      return {
        success: true,
        message: '发布成功',
        postId: publishResult.postId,
        url: publishResult.url
      };

    } catch (error) {
      // 更新笔记状态为失败
      await this.dbManager.query(
        'UPDATE idea_xiaohongshu_posts SET status = "failed" WHERE id = ?',
        [postId]
      );
      
      this.logger.error('笔记发布失败', { error: error.message, postId });
      throw error;
    }
  }

  /**
   * 执行内容搜索任务
   */
  async executeContentSearch({ taskId, accountId, keyword, searchType, limit, sort }) {
    try {
      // 获取账号信息
      const [accounts] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ? AND login_status = TRUE',
        [accountId]
      );

      if (accounts.length === 0) {
        throw new Error('账号不存在或未登录');
      }

      // 获取浏览器上下文
      const context = await this.browserManager.getContext(accountId);

      // 执行搜索操作
      const searchResults = await this.performSearch(context, {
        keyword,
        type: searchType,
        limit,
        sort
      });

      // 保存搜索结果
      for (const result of searchResults) {
        await this.saveSearchResult(taskId, result);
      }

      return {
        success: true,
        message: '搜索完成',
        resultsCount: searchResults.length,
        keyword
      };

    } catch (error) {
      this.logger.error('内容搜索失败', { error: error.message, keyword });
      throw error;
    }
  }

  /**
   * 执行用户信息获取任务
   */
  async executeUserInfo({ taskId, accountId, userId }) {
    try {
      // 获取账号信息
      const [accounts] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ? AND login_status = TRUE',
        [accountId]
      );

      if (accounts.length === 0) {
        throw new Error('账号不存在或未登录');
      }

      // 获取浏览器上下文
      const context = await this.browserManager.getContext(accountId);

      // 获取用户信息
      const userInfo = await this.performGetUserInfo(context, userId);

      // 保存用户信息
      await this.saveUserInfo(userInfo);

      return {
        success: true,
        message: '用户信息获取完成',
        userId,
        username: userInfo.nickname
      };

    } catch (error) {
      this.logger.error('获取用户信息失败', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * 执行笔记详情获取任务
   */
  async executePostInfo({ taskId, accountId, postId }) {
    try {
      // 获取账号信息
      const [accounts] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ? AND login_status = TRUE',
        [accountId]
      );

      if (accounts.length === 0) {
        throw new Error('账号不存在或未登录');
      }

      // 获取浏览器上下文
      const context = await this.browserManager.getContext(accountId);

      // 获取笔记详情
      const postInfo = await this.performGetPostInfo(context, postId);

      // 保存笔记信息
      await this.savePostInfo(postInfo);

      return {
        success: true,
        message: '笔记详情获取完成',
        postId,
        title: postInfo.title
      };

    } catch (error) {
      this.logger.error('获取笔记详情失败', { error: error.message, postId });
      throw error;
    }
  }

  /**
   * 执行评论获取任务
   */
  async executeCommentsFetch({ taskId, accountId, postId, limit, offset }) {
    try {
      // 获取账号信息
      const [accounts] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ? AND login_status = TRUE',
        [accountId]
      );

      if (accounts.length === 0) {
        throw new Error('账号不存在或未登录');
      }

      // 获取浏览器上下文
      const context = await this.browserManager.getContext(accountId);

      // 获取评论
      const comments = await this.performGetComments(context, postId, limit, offset);

      // 保存评论信息
      await this.saveComments(taskId, comments);

      return {
        success: true,
        message: '评论获取完成',
        postId,
        commentsCount: comments.length
      };

    } catch (error) {
      this.logger.error('获取评论失败', { error: error.message, postId });
      throw error;
    }
  }

  /**
   * 执行热门内容获取任务
   */
  async executeTrendingFetch({ taskId, accountId, category, limit }) {
    try {
      // 获取账号信息
      const [accounts] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ? AND login_status = TRUE',
        [accountId]
      );

      if (accounts.length === 0) {
        throw new Error('账号不存在或未登录');
      }

      // 获取浏览器上下文
      const context = await this.browserManager.getContext(accountId);

      // 获取热门内容
      const trendingPosts = await this.performGetTrending(context, category, limit);

      // 保存热门内容
      await this.saveTrendingPosts(taskId, trendingPosts);

      return {
        success: true,
        message: '热门内容获取完成',
        category,
        postsCount: trendingPosts.length
      };

    } catch (error) {
      this.logger.error('获取热门内容失败', { error: error.message, category });
      throw error;
    }
  }

  // ===== 辅助方法 =====

  /**
   * 加载待处理任务
   */
  async loadPendingTasks() {
    try {
      const [pendingTasks] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_tasks WHERE status = "pending" AND scheduled_time <= NOW()'
      );

      for (const task of pendingTasks) {
        const taskData = JSON.parse(task.task_data);
        await this.enqueueTask(task.task_type, {
          taskId: task.id,
          accountId: task.account_id,
          ...taskData
        }, task.priority);

        await this.updateTaskStatus(task.id, 'queued');
      }

      this.logger.info('加载待处理任务完成', { count: pendingTasks.length });
    } catch (error) {
      this.logger.error('加载待处理任务失败', { error: error.message });
    }
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId, status, result = null, error = null) {
    try {
      const updates = ['status = ?'];
      const values = [status];

      if (status === 'running') {
        updates.push('started_time = NOW()');
      } else if (status === 'completed' || status === 'failed') {
        updates.push('completed_time = NOW()');
        if (result) {
          updates.push('result_data = ?');
          values.push(JSON.stringify(result));
        }
        if (error) {
          updates.push('error_message = ?');
          values.push(error);
        }
      }

      values.push(taskId);

      await this.dbManager.query(
        `UPDATE idea_xiaohongshu_tasks SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      this.emit('task:statusChanged', { taskId, status, result, error });
    } catch (error) {
      this.logger.error('更新任务状态失败', { error: error.message, taskId, status });
    }
  }

  /**
   * 记录任务错误
   */
  async logTaskError(taskId, error) {
    try {
      await this.dbManager.query(
        'UPDATE idea_xiaohongshu_tasks SET retry_count = retry_count + 1 WHERE id = ?',
        [taskId]
      );
    } catch (updateError) {
      this.logger.error('记录任务错误失败', { error: updateError.message, taskId });
    }
  }

  /**
   * 调度定时任务
   */
  scheduleCronTask(taskId, cronExpression, taskData) {
    const task = cron.schedule(cronExpression, async () => {
      try {
        await this.createTask(taskData);
      } catch (error) {
        this.logger.error('定时任务执行失败', { error: error.message, taskId });
      }
    });

    this.scheduledTasks.set(taskId, task);
  }

  /**
   * 调度延迟任务
   */
  scheduleDelayedTask(taskId, scheduledTime, taskData) {
    const delay = new Date(scheduledTime).getTime() - Date.now();
    
    setTimeout(async () => {
      try {
        await this.createTask(taskData);
      } catch (error) {
        this.logger.error('延迟任务执行失败', { error: error.message, taskId });
      }
    }, delay);
  }

  /**
   * 启动定时任务检查器
   */
  startScheduledTaskChecker() {
    setInterval(async () => {
      try {
        await this.loadPendingTasks();
      } catch (error) {
        this.logger.error('定时任务检查失败', { error: error.message });
      }
    }, 60000); // 每分钟检查一次
  }

  /**
   * 启动任务清理器
   */
  startTaskCleaner() {
    setInterval(async () => {
      try {
        // 清理过期任务（7天前的已完成任务）
        await this.dbManager.query(
          'DELETE FROM idea_xiaohongshu_tasks WHERE status IN ("completed", "failed", "cancelled") AND completed_time < DATE_SUB(NOW(), INTERVAL 7 DAY)'
        );

        this.logger.info('任务清理完成');
      } catch (error) {
        this.logger.error('任务清理失败', { error: error.message });
      }
    }, 3600000); // 每小时清理一次
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId) {
    try {
      // 更新任务状态
      await this.updateTaskStatus(taskId, 'cancelled');
      
      // 取消定时任务
      if (this.scheduledTasks.has(taskId)) {
        this.scheduledTasks.get(taskId).stop();
        this.scheduledTasks.delete(taskId);
      }

      this.logger.info('任务已取消', { taskId });
    } catch (error) {
      this.logger.error('取消任务失败', { error: error.message, taskId });
      throw error;
    }
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId) {
    try {
      const [tasks] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_tasks WHERE id = ?',
        [taskId]
      );

      if (tasks.length === 0) {
        throw new Error('任务不存在');
      }

      const task = tasks[0];
      task.task_data = task.task_data ? JSON.parse(task.task_data) : null;
      task.result_data = task.result_data ? JSON.parse(task.result_data) : null;

      return task;
    } catch (error) {
      this.logger.error('获取任务状态失败', { error: error.message, taskId });
      throw error;
    }
  }

  /**
   * 停止任务执行器
   */
  async stop() {
    this.logger.info('⚙️ 停止任务执行器...');
    
    // 停止所有队列
    for (const [type, queue] of this.queues) {
      await queue.close();
    }

    // 停止所有定时任务
    for (const [taskId, task] of this.scheduledTasks) {
      task.stop();
    }

    this.queues.clear();
    this.workers.clear();
    this.scheduledTasks.clear();
    
    this.logger.info('✅ 任务执行器已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      let status = 'healthy';
      let details = {};

      // 检查队列状态
      for (const [type, queue] of this.queues) {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();

        details[type] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length
        };

        if (failed.length > 100) {
          status = 'warning';
        }
      }

      return {
        status,
        details,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // ===== 模拟执行方法（实际实现时会调用小红书API） =====

  async performLogin(context, account, method, credentials) {
    // 这里实现实际的小红书登录逻辑
    // 返回模拟数据
    return {
      success: true,
      cookies: [
        { name: 'a1', value: 'xxx', domain: '.xiaohongshu.com' },
        { name: 'webId', value: 'xxx', domain: '.xiaohongshu.com' }
      ]
    };
  }

  async performPublish(context, post) {
    // 这里实现实际的小红书发布逻辑
    // 返回模拟数据
    return {
      postId: `post_${Date.now()}`,
      url: `https://www.xiaohongshu.com/explore/post_${Date.now()}`
    };
  }

  async performSearch(context, params) {
    // 这里实现实际的小红书搜索逻辑
    // 返回模拟数据
    return [
      { id: 'note1', title: '搜索结果1', author: 'user1' },
      { id: 'note2', title: '搜索结果2', author: 'user2' }
    ];
  }

  async performGetUserInfo(context, userId) {
    // 这里实现实际的小红书用户信息获取逻辑
    // 返回模拟数据
    return {
      userId,
      nickname: '用户昵称',
      followerCount: 1000,
      followingCount: 500,
      postCount: 50
    };
  }

  async performGetPostInfo(context, postId) {
    // 这里实现实际的小红书笔记详情获取逻辑
    // 返回模拟数据
    return {
      postId,
      title: '笔记标题',
      content: '笔记内容',
      likeCount: 100,
      commentCount: 20,
      shareCount: 5
    };
  }

  async performGetComments(context, postId, limit, offset) {
    // 这里实现实际的小红书评论获取逻辑
    // 返回模拟数据
    return [
      { id: 'comment1', content: '评论1', author: 'user1' },
      { id: 'comment2', content: '评论2', author: 'user2' }
    ];
  }

  async performGetTrending(context, category, limit) {
    // 这里实现实际的小红书热门内容获取逻辑
    // 返回模拟数据
    return [
      { id: 'trending1', title: '热门内容1', category },
      { id: 'trending2', title: '热门内容2', category }
    ];
  }

  // ===== 数据保存方法 =====

  async saveSearchResult(taskId, result) {
    // 保存搜索结果到数据库
    // 实现省略...
  }

  async saveUserInfo(userInfo) {
    // 保存用户信息到数据库
    await this.dbManager.query(
      `INSERT INTO idea_xiaohongshu_users 
       (user_id, nickname, follower_count, following_count, post_count) 
       VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE 
       nickname = VALUES(nickname), follower_count = VALUES(follower_count), 
       following_count = VALUES(following_count), post_count = VALUES(post_count)`,
      [userInfo.userId, userInfo.nickname, userInfo.followerCount, userInfo.followingCount, userInfo.postCount]
    );
  }

  async savePostInfo(postInfo) {
    // 保存笔记信息到数据库
    // 实现省略...
  }

  async saveComments(taskId, comments) {
    // 保存评论信息到数据库
    // 实现省略...
  }

  async saveTrendingPosts(taskId, posts) {
    // 保存热门内容到数据库
    // 实现省略...
  }
}

module.exports = TaskExecutor;