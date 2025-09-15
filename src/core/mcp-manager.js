/**
 * MCP管理器
 * 实现MCP协议的核心功能，处理JSON-RPC 2.0通信
 */

const { EventEmitter } = require('events');
const logger = require('../utils/logger');

class MCPManager extends EventEmitter {
  constructor(taskManager, databaseManager) {
    super();
    this.taskManager = taskManager;
    this.db = databaseManager;
    this.methods = new Map();
    this.notifications = new Map();
    this.initializeMethods();
  }

  /**
   * 初始化MCP方法
   */
  initializeMethods() {
    // 账号管理相关方法
    this.registerMethod('accounts.create', this.createAccount.bind(this));
    this.registerMethod('accounts.list', this.listAccounts.bind(this));
    this.registerMethod('accounts.get', this.getAccount.bind(this));
    this.registerMethod('accounts.update', this.updateAccount.bind(this));
    this.registerMethod('accounts.delete', this.deleteAccount.bind(this));
    this.registerMethod('accounts.login', this.loginAccount.bind(this));
    this.registerMethod('accounts.logout', this.logoutAccount.bind(this));

    // 任务管理相关方法
    this.registerMethod('tasks.create', this.createTask.bind(this));
    this.registerMethod('tasks.list', this.listTasks.bind(this));
    this.registerMethod('tasks.get', this.getTask.bind(this));
    this.registerMethod('tasks.cancel', this.cancelTask.bind(this));
    this.registerMethod('tasks.delete', this.deleteTask.bind(this));

    // 内容发布相关方法
    this.registerMethod('posts.create', this.createPost.bind(this));
    this.registerMethod('posts.update', this.updatePost.bind(this));
    this.registerMethod('posts.delete', this.deletePost.bind(this));
    this.registerMethod('posts.list', this.listPosts.bind(this));
    this.registerMethod('posts.get', this.getPost.bind(this));

    // 互动相关方法
    this.registerMethod('comments.create', this.createComment.bind(this));
    this.registerMethod('comments.delete', this.deleteComment.bind(this));
    this.registerMethod('likes.add', this.addLike.bind(this));
    this.registerMethod('likes.remove', this.removeLike.bind(this));
    this.registerMethod('follows.add', this.addFollow.bind(this));
    this.registerMethod('follows.remove', this.removeFollow.bind(this));

    // 数据采集相关方法
    this.registerMethod('data.scrape_user', this.scrapeUser.bind(this));
    this.registerMethod('data.scrape_post', this.scrapePost.bind(this));
    this.registerMethod('data.scrape_comments', this.scrapeComments.bind(this));
    this.registerMethod('data.search_posts', this.searchPosts.bind(this));
    this.registerMethod('data.get_trending', this.getTrending.bind(this));

    // 系统相关方法
    this.registerMethod('system.status', this.getSystemStatus.bind(this));
    this.registerMethod('system.stats', this.getSystemStats.bind(this));
    this.registerMethod('system.config', this.getSystemConfig.bind(this));
  }

  /**
   * 注册MCP方法
   */
  registerMethod(name, handler) {
    this.methods.set(name, handler);
    logger.debug(`注册MCP方法: ${name}`);
  }

  /**
   * 注册通知处理器
   */
  registerNotification(name, handler) {
    this.notifications.set(name, handler);
    logger.debug(`注册MCP通知: ${name}`);
  }

  /**
   * 处理JSON-RPC请求
   */
  async handleRequest(request) {
    try {
      // 验证JSON-RPC格式
      const validation = this.validateRequest(request);
      if (!validation.valid) {
        return this.createErrorResponse(request.id, -32600, validation.error);
      }

      const { id, method, params } = request;

      // 检查方法是否存在
      if (!this.methods.has(method)) {
        return this.createErrorResponse(id, -32601, `Method not found: ${method}`);
      }

      logger.info(`处理MCP请求: ${method} (${id || 'notification'})`);

      // 执行方法
      const handler = this.methods.get(method);
      const result = await handler(params || {});

      // 如果是通知，不返回响应
      if (id === null || id === undefined) {
        return null;
      }

      return this.createSuccessResponse(id, result);
    } catch (error) {
      logger.error(`MCP请求处理失败: ${request.method}`, error);
      return this.createErrorResponse(request.id, -32603, error.message);
    }
  }

  /**
   * 验证JSON-RPC请求格式
   */
  validateRequest(request) {
    if (!request || typeof request !== 'object') {
      return { valid: false, error: 'Invalid request format' };
    }

    if (request.jsonrpc !== '2.0') {
      return { valid: false, error: 'Invalid JSON-RPC version' };
    }

    if (typeof request.method !== 'string') {
      return { valid: false, error: 'Method must be a string' };
    }

    if (request.params && typeof request.params !== 'object' && !Array.isArray(request.params)) {
      return { valid: false, error: 'Params must be an object or array' };
    }

    return { valid: true };
  }

  /**
   * 创建成功响应
   */
  createSuccessResponse(id, result) {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  /**
   * 创建错误响应
   */
  createErrorResponse(id, code, message, data = null) {
    const response = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };

    if (data !== null) {
      response.error.data = data;
    }

    return response;
  }

  // 账号管理方法实现
  async createAccount(params) {
    const { username, password, email, phone, proxyId, fingerprintId } = params;

    if (!username) {
      throw new Error('Username is required');
    }

    const account = await this.db.Account.create({
      username,
      password, // 应该加密存储
      email,
      phone,
      proxy_id: proxyId,
      fingerprint_id: fingerprintId,
      status: 'active'
    });

    return {
      id: account.id,
      username: account.username,
      status: account.status,
      created_at: account.created_at
    };
  }

  async listAccounts(params) {
    const { page = 1, limit = 20, status } = params;
    const offset = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;

    const { count, rows } = await this.db.Account.findAndCountAll({
      where,
      limit,
      offset,
      order: [['created_at', 'DESC']],
      include: [
        { model: this.db.Proxy, attributes: ['host', 'port', 'country'] },
        { model: this.db.Fingerprint, attributes: ['fingerprint_id'] }
      ]
    });

    return {
      accounts: rows.map(account => ({
        id: account.id,
        username: account.username,
        nickname: account.nickname,
        email: account.email,
        phone: account.phone,
        status: account.status,
        login_status: account.login_status,
        last_login_time: account.last_login_time,
        proxy: account.Proxy,
        fingerprint: account.Fingerprint,
        created_at: account.created_at
      })),
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  }

  async getAccount(params) {
    const { id } = params;
    const account = await this.db.Account.findByPk(id, {
      include: [
        { model: this.db.Proxy },
        { model: this.db.Fingerprint }
      ]
    });

    if (!account) {
      throw new Error('Account not found');
    }

    return {
      id: account.id,
      username: account.username,
      nickname: account.nickname,
      email: account.email,
      phone: account.phone,
      status: account.status,
      login_status: account.login_status,
      last_login_time: account.last_login_time,
      proxy: account.Proxy,
      fingerprint: account.Fingerprint,
      created_at: account.created_at,
      updated_at: account.updated_at
    };
  }

  async updateAccount(params) {
    const { id, ...updateData } = params;
    
    const account = await this.db.Account.findByPk(id);
    if (!account) {
      throw new Error('Account not found');
    }

    await account.update(updateData);

    return {
      id: account.id,
      username: account.username,
      status: account.status,
      updated_at: account.updated_at
    };
  }

  async deleteAccount(params) {
    const { id } = params;
    
    const account = await this.db.Account.findByPk(id);
    if (!account) {
      throw new Error('Account not found');
    }

    await account.destroy();

    return { success: true };
  }

  async loginAccount(params) {
    const { id, username, password } = params;

    const account = await this.db.Account.findByPk(id);
    if (!account) {
      throw new Error('Account not found');
    }

    // 创建登录任务
    const task = await this.taskManager.createTask({
      type: 'login',
      accountId: id,
      data: { username: username || account.username, password }
    });

    return {
      task_id: task.id,
      status: 'pending'
    };
  }

  async logoutAccount(params) {
    const { id } = params;

    const account = await this.db.Account.findByPk(id);
    if (!account) {
      throw new Error('Account not found');
    }

    // 清除登录状态
    await account.update({
      login_status: false,
      cookies_encrypted: null
    });

    return { success: true };
  }

  // 任务管理方法实现
  async createTask(params) {
    const { type, accountId, data, cronExpression, priority = 1, scheduledTime } = params;

    if (!type || !accountId) {
      throw new Error('Type and accountId are required');
    }

    const task = await this.taskManager.createTask({
      type,
      accountId,
      data,
      cronExpression,
      priority,
      scheduledTime
    });

    return {
      task_id: task.id,
      status: task.status,
      scheduled_time: task.scheduled_time
    };
  }

  async listTasks(params) {
    return this.taskManager.getTaskList(params);
  }

  async getTask(params) {
    const { id } = params;
    return this.taskManager.getTaskDetails(id);
  }

  async cancelTask(params) {
    const { id } = params;
    await this.taskManager.cancelTask(id);
    return { success: true };
  }

  async deleteTask(params) {
    const { id } = params;
    
    const task = await this.db.Task.findByPk(id);
    if (!task) {
      throw new Error('Task not found');
    }

    await task.destroy();
    return { success: true };
  }

  // 内容发布方法实现
  async createPost(params) {
    const { accountId, title, content, images, tags, topic, scheduledTime } = params;

    if (!accountId || !title) {
      throw new Error('AccountId and title are required');
    }

    const task = await this.taskManager.createTask({
      type: 'create_post',
      accountId,
      data: { title, content, images, tags, topic },
      scheduledTime
    });

    return {
      task_id: task.id,
      status: task.status,
      scheduled_time: task.scheduled_time
    };
  }

  async updatePost(params) {
    const { id, ...updateData } = params;
    
    const post = await this.db.Post.findByPk(id);
    if (!post) {
      throw new Error('Post not found');
    }

    await post.update(updateData);

    return {
      id: post.id,
      title: post.title,
      status: post.status,
      updated_at: post.updated_at
    };
  }

  async deletePost(params) {
    const { id } = params;
    
    const post = await this.db.Post.findByPk(id);
    if (!post) {
      throw new Error('Post not found');
    }

    await post.update({ status: 'deleted' });
    return { success: true };
  }

  async listPosts(params) {
    const { page = 1, limit = 20, accountId, status } = params;
    const offset = (page - 1) * limit;

    const where = {};
    if (accountId) where.account_id = accountId;
    if (status) where.status = status;

    const { count, rows } = await this.db.Post.findAndCountAll({
      where,
      limit,
      offset,
      order: [['created_at', 'DESC']],
      include: [
        { model: this.db.Account, attributes: ['username', 'nickname'] }
      ]
    });

    return {
      posts: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  }

  async getPost(params) {
    const { id } = params;
    
    const post = await this.db.Post.findByPk(id, {
      include: [
        { model: this.db.Account, attributes: ['username', 'nickname'] }
      ]
    });

    if (!post) {
      throw new Error('Post not found');
    }

    return post;
  }

  // 互动方法实现
  async createComment(params) {
    const { accountId, postId, content, parentCommentId } = params;

    if (!accountId || !postId || !content) {
      throw new Error('AccountId, postId and content are required');
    }

    const task = await this.taskManager.createTask({
      type: 'create_comment',
      accountId,
      data: { postId, content, parentCommentId }
    });

    return {
      task_id: task.id,
      status: task.status
    };
  }

  async deleteComment(params) {
    const { id } = params;
    
    const comment = await this.db.Comment.findByPk(id);
    if (!comment) {
      throw new Error('Comment not found');
    }

    await comment.destroy();
    return { success: true };
  }

  async addLike(params) {
    const { accountId, postId } = params;

    if (!accountId || !postId) {
      throw new Error('AccountId and postId are required');
    }

    const task = await this.taskManager.createTask({
      type: 'like_post',
      accountId,
      data: { postId, action: 'like' }
    });

    return {
      task_id: task.id,
      status: task.status
    };
  }

  async removeLike(params) {
    const { accountId, postId } = params;

    if (!accountId || !postId) {
      throw new Error('AccountId and postId are required');
    }

    const task = await this.taskManager.createTask({
      type: 'like_post',
      accountId,
      data: { postId, action: 'unlike' }
    });

    return {
      task_id: task.id,
      status: task.status
    };
  }

  async addFollow(params) {
    const { accountId, userId } = params;

    if (!accountId || !userId) {
      throw new Error('AccountId and userId are required');
    }

    const task = await this.taskManager.createTask({
      type: 'follow_user',
      accountId,
      data: { userId, action: 'follow' }
    });

    return {
      task_id: task.id,
      status: task.status
    };
  }

  async removeFollow(params) {
    const { accountId, userId } = params;

    if (!accountId || !userId) {
      throw new Error('AccountId and userId are required');
    }

    const task = await this.taskManager.createTask({
      type: 'follow_user',
      accountId,
      data: { userId, action: 'unfollow' }
    });

    return {
      task_id: task.id,
      status: task.status
    };
  }

  // 数据采集方法实现
  async scrapeUser(params) {
    const { accountId, userId } = params;

    if (!accountId || !userId) {
      throw new Error('AccountId and userId are required');
    }

    const task = await this.taskManager.createTask({
      type: 'scrape_data',
      accountId,
      data: { type: 'user_info', targetId: userId }
    });

    return {
      task_id: task.id,
      status: task.status
    };
  }

  async scrapePost(params) {
    const { accountId, postId } = params;

    if (!accountId || !postId) {
      throw new Error('AccountId and postId are required');
    }

    const task = await this.taskManager.createTask({
      type: 'scrape_data',
      accountId,
      data: { type: 'post_details', targetId: postId }
    });

    return {
      task_id: task.id,
      status: task.status
    };
  }

  async scrapeComments(params) {
    const { accountId, postId, limit = 50 } = params;

    if (!accountId || !postId) {
      throw new Error('AccountId and postId are required');
    }

    const task = await this.taskManager.createTask({
      type: 'scrape_data',
      accountId,
      data: { type: 'post_comments', targetId: postId, limit }
    });

    return {
      task_id: task.id,
      status: task.status
    };
  }

  async searchPosts(params) {
    const { accountId, keyword, limit = 50 } = params;

    if (!accountId || !keyword) {
      throw new Error('AccountId and keyword are required');
    }

    const task = await this.taskManager.createTask({
      type: 'scrape_data',
      accountId,
      data: { type: 'search_posts', keyword, limit }
    });

    return {
      task_id: task.id,
      status: task.status
    };
  }

  async getTrending(params) {
    const { accountId, category, limit = 50 } = params;

    if (!accountId) {
      throw new Error('AccountId is required');
    }

    const task = await this.taskManager.createTask({
      type: 'scrape_data',
      accountId,
      data: { type: 'trending_posts', category, limit }
    });

    return {
      task_id: task.id,
      status: task.status
    };
  }

  // 系统状态方法
  async getSystemStatus() {
    const taskStats = await this.taskManager.getTaskStats();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      tasks: taskStats,
      version: require('../../package.json').version
    };
  }

  async getSystemStats() {
    const taskStats = await this.taskManager.getTaskStats();
    const accountCount = await this.db.Account.count();
    const postCount = await this.db.Post.count();
    const commentCount = await this.db.Comment.count();

    return {
      accounts: {
        total: accountCount,
        active: await this.db.Account.count({ where: { status: 'active' } }),
        banned: await this.db.Account.count({ where: { status: 'banned' } })
      },
      posts: {
        total: postCount,
        published: await this.db.Post.count({ where: { status: 'published' } }),
        draft: await this.db.Post.count({ where: { status: 'draft' } })
      },
      comments: {
        total: commentCount
      },
      tasks: taskStats,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: require('../../package.json').version
      }
    };
  }

  async getSystemConfig() {
    const config = require('../config/config-manager');
    
    return {
      server: {
        port: config.get('server.port'),
        host: config.get('server.host')
      },
      database: {
        host: config.get('database.host'),
        port: config.get('database.port'),
        database: config.get('database.database')
      },
      browser: {
        headless: config.get('browser.headless'),
        timeout: config.get('browser.timeout')
      },
      features: {
        anti_detection: config.get('features.anti_detection'),
        proxy_rotation: config.get('features.proxy_rotation'),
        fingerprint_randomization: config.get('features.fingerprint_randomization')
      }
    };
  }

  /**
   * 获取可用方法列表
   */
  getMethods() {
    return Array.from(this.methods.keys()).map(method => ({
      name: method,
      description: this.getMethodDescription(method)
    }));
  }

  /**
   * 获取方法描述
   */
  getMethodDescription(method) {
    const descriptions = {
      'accounts.create': '创建新的小红书账号',
      'accounts.list': '获取账号列表',
      'accounts.get': '获取单个账号详情',
      'accounts.update': '更新账号信息',
      'accounts.delete': '删除账号',
      'accounts.login': '登录账号',
      'accounts.logout': '登出账号',
      'tasks.create': '创建新任务',
      'tasks.list': '获取任务列表',
      'tasks.get': '获取任务详情',
      'tasks.cancel': '取消任务',
      'tasks.delete': '删除任务',
      'posts.create': '创建新笔记',
      'posts.update': '更新笔记',
      'posts.delete': '删除笔记',
      'posts.list': '获取笔记列表',
      'posts.get': '获取笔记详情',
      'comments.create': '创建评论',
      'comments.delete': '删除评论',
      'likes.add': '添加点赞',
      'likes.remove': '移除点赞',
      'follows.add': '添加关注',
      'follows.remove': '移除关注',
      'data.scrape_user': '采集用户信息',
      'data.scrape_post': '采集笔记信息',
      'data.scrape_comments': '采集评论信息',
      'data.search_posts': '搜索笔记',
      'data.get_trending': '获取热门笔记',
      'system.status': '获取系统状态',
      'system.stats': '获取系统统计',
      'system.config': '获取系统配置'
    };

    return descriptions[method] || '暂无描述';
  }
}

module.exports = MCPManager;