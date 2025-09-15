/**
 * MCP管理器 - 处理MCP协议的核心逻辑
 * 实现JSON-RPC 2.0协议，提供小红书操作的标准MCP接口
 */

const { EventEmitter } = require('events');
const logger = require('../utils/logger');

class MCPManager extends EventEmitter {
  constructor(options) {
    super();
    this.dbManager = options.dbManager;
    this.taskExecutor = options.taskExecutor;
    this.browserManager = options.browserManager;
    this.config = options.config;
    this.logger = logger;
    
    this.methods = new Map();
    this.sessions = new Map();
    this.subscriptions = new Map();
    
    this.initializeMethods();
  }

  /**
   * 初始化MCP方法映射
   */
  initializeMethods() {
    // 账号管理相关方法
    this.methods.set('xiaohongshu.account.list', this.listAccounts.bind(this));
    this.methods.set('xiaohongshu.account.create', this.createAccount.bind(this));
    this.methods.set('xiaohongshu.account.update', this.updateAccount.bind(this));
    this.methods.set('xiaohongshu.account.delete', this.deleteAccount.bind(this));
    this.methods.set('xiaohongshu.account.login', this.loginAccount.bind(this));
    this.methods.set('xiaohongshu.account.logout', this.logoutAccount.bind(this));
    this.methods.set('xiaohongshu.account.status', this.getAccountStatus.bind(this));

    // 内容发布相关方法
    this.methods.set('xiaohongshu.post.create', this.createPost.bind(this));
    this.methods.set('xiaohongshu.post.publish', this.publishPost.bind(this));
    this.methods.set('xiaohongshu.post.list', this.listPosts.bind(this));
    this.methods.set('xiaohongshu.post.delete', this.deletePost.bind(this));
    this.methods.set('xiaohongshu.post.update', this.updatePost.bind(this));

    // 数据采集相关方法
    this.methods.set('xiaohongshu.data.search', this.searchContent.bind(this));
    this.methods.set('xiaohongshu.data.user', this.getUserInfo.bind(this));
    this.methods.set('xiaohongshu.data.post', this.getPostInfo.bind(this));
    this.methods.set('xiaohongshu.data.comments', this.getComments.bind(this));
    this.methods.set('xiaohongshu.data.trending', this.getTrending.bind(this));

    // 任务管理相关方法
    this.methods.set('xiaohongshu.task.create', this.createTask.bind(this));
    this.methods.set('xiaohongshu.task.list', this.listTasks.bind(this));
    this.methods.set('xiaohongshu.task.cancel', this.cancelTask.bind(this));
    this.methods.set('xiaohongshu.task.status', this.getTaskStatus.bind(this));

    // 系统管理相关方法
    this.methods.set('xiaohongshu.system.status', this.getSystemStatus.bind(this));
    this.methods.set('xiaohongshu.system.config', this.getSystemConfig.bind(this));
    this.methods.set('xiaohongshu.system.stats', this.getSystemStats.bind(this));
  }

  /**
   * 初始化MCP管理器
   */
  async initialize() {
    try {
      this.logger.info('🔧 初始化MCP管理器...');
      
      // 清理过期会话
      this.startSessionCleanup();
      
      this.logger.info('✅ MCP管理器初始化完成');
    } catch (error) {
      this.logger.error('❌ MCP管理器初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 处理MCP请求
   */
  async handleRequest(request) {
    try {
      // 验证请求格式
      if (!this.validateRequest(request)) {
        return this.createErrorResponse(-32600, 'Invalid Request');
      }

      const { id, method, params } = request;

      // 检查方法是否存在
      if (!this.methods.has(method)) {
        return this.createErrorResponse(-32601, 'Method not found', id);
      }

      // 执行方法
      const methodFunc = this.methods.get(method);
      const result = await methodFunc(params);

      return this.createSuccessResponse(result, id);

    } catch (error) {
      this.logger.error('MCP请求处理失败', { error: error.message, request });
      return this.createErrorResponse(-32603, 'Internal error', request.id);
    }
  }

  /**
   * 验证请求格式
   */
  validateRequest(request) {
    return (
      typeof request === 'object' &&
      request !== null &&
      typeof request.jsonrpc === 'string' &&
      request.jsonrpc === '2.0' &&
      typeof request.method === 'string' &&
      (request.params === undefined || typeof request.params === 'object')
    );
  }

  /**
   * 创建成功响应
   */
  createSuccessResponse(result, id) {
    return {
      jsonrpc: '2.0',
      result,
      id
    };
  }

  /**
   * 创建错误响应
   */
  createErrorResponse(code, message, id = null) {
    return {
      jsonrpc: '2.0',
      error: { code, message },
      id
    };
  }

  // ===== 账号管理方法 =====

  /**
   * 获取账号列表
   */
  async listAccounts(params = {}) {
    const { page = 1, limit = 20, status, search } = params;
    
    try {
      const offset = (page - 1) * limit;
      let whereClause = '1=1';
      const values = [];

      if (status) {
        whereClause += ' AND status = ?';
        values.push(status);
      }

      if (search) {
        whereClause += ' AND (username LIKE ? OR nickname LIKE ?)';
        values.push(`%${search}%`, `%${search}%`);
      }

      const [accounts] = await this.dbManager.query(
        `SELECT a.*, p.host as proxy_host, p.port as proxy_port, f.fingerprint_id 
         FROM idea_xiaohongshu_accounts a 
         LEFT JOIN idea_xiaohongshu_proxies p ON a.proxy_id = p.id 
         LEFT JOIN idea_xiaohongshu_fingerprints f ON a.fingerprint_id = f.id 
         WHERE ${whereClause} 
         ORDER BY a.created_at DESC 
         LIMIT ? OFFSET ?`,
        [...values, limit, offset]
      );

      const [totalResult] = await this.dbManager.query(
        `SELECT COUNT(*) as total FROM idea_xiaohongshu_accounts a WHERE ${whereClause}`,
        values
      );

      return {
        accounts,
        pagination: {
          page,
          limit,
          total: totalResult[0].total,
          pages: Math.ceil(totalResult[0].total / limit)
        }
      };

    } catch (error) {
      this.logger.error('获取账号列表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 创建账号
   */
  async createAccount(params) {
    const { username, phone, email, nickname, proxyId, fingerprintId } = params;
    
    try {
      const [result] = await this.dbManager.query(
        `INSERT INTO idea_xiaohongshu_accounts (username, phone, email, nickname, proxy_id, fingerprint_id) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [username, phone, email, nickname, proxyId, fingerprintId]
      );

      return {
        accountId: result.insertId,
        message: '账号创建成功'
      };

    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('用户名已存在');
      }
      this.logger.error('创建账号失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 更新账号
   */
  async updateAccount(params) {
    const { id, ...updateData } = params;
    
    try {
      const fields = Object.keys(updateData);
      const values = Object.values(updateData);
      
      if (fields.length === 0) {
        throw new Error('没有要更新的字段');
      }

      const setClause = fields.map(field => `${field} = ?`).join(', ');
      
      await this.dbManager.query(
        `UPDATE idea_xiaohongshu_accounts SET ${setClause}, updated_at = NOW() WHERE id = ?`,
        [...values, id]
      );

      return { message: '账号更新成功' };

    } catch (error) {
      this.logger.error('更新账号失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 删除账号
   */
  async deleteAccount(params) {
    const { id } = params;
    
    try {
      await this.dbManager.query(
        'DELETE FROM idea_xiaohongshu_accounts WHERE id = ?',
        [id]
      );

      return { message: '账号删除成功' };

    } catch (error) {
      this.logger.error('删除账号失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 账号登录
   */
  async loginAccount(params) {
    const { id, method = 'manual', credentials } = params;
    
    try {
      // 获取账号信息
      const [accounts] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ?',
        [id]
      );

      if (accounts.length === 0) {
        throw new Error('账号不存在');
      }

      const account = accounts[0];
      
      // 创建登录任务
      const taskId = await this.taskExecutor.createTask({
        type: 'account_login',
        accountId: id,
        method,
        credentials,
        priority: 1
      });

      return {
        taskId,
        message: '登录任务已创建'
      };

    } catch (error) {
      this.logger.error('账号登录失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 账号登出
   */
  async logoutAccount(params) {
    const { id } = params;
    
    try {
      await this.dbManager.query(
        'UPDATE idea_xiaohongshu_accounts SET login_status = FALSE, cookies_encrypted = NULL WHERE id = ?',
        [id]
      );

      return { message: '账号已登出' };

    } catch (error) {
      this.logger.error('账号登出失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取账号状态
   */
  async getAccountStatus(params) {
    const { id } = params;
    
    try {
      const [accounts] = await this.dbManager.query(
        'SELECT id, username, status, login_status, last_login_time FROM idea_xiaohongshu_accounts WHERE id = ?',
        [id]
      );

      if (accounts.length === 0) {
        throw new Error('账号不存在');
      }

      return accounts[0];

    } catch (error) {
      this.logger.error('获取账号状态失败', { error: error.message });
      throw error;
    }
  }

  // ===== 内容发布方法 =====

  /**
   * 创建笔记
   */
  async createPost(params) {
    const { accountId, title, content, type = 'image', images = [], video = null, tags = [], topic = null, scheduledTime = null } = params;
    
    try {
      const [result] = await this.dbManager.query(
        `INSERT INTO idea_xiaohongshu_posts (account_id, title, content, type, images_data, video_data, tags, topic, scheduled_time) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [accountId, title, content, type, JSON.stringify(images), JSON.stringify(video), JSON.stringify(tags), topic, scheduledTime]
      );

      return {
        postId: result.insertId,
        message: '笔记创建成功'
      };

    } catch (error) {
      this.logger.error('创建笔记失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 发布笔记
   */
  async publishPost(params) {
    const { postId, immediate = true } = params;
    
    try {
      // 获取笔记信息
      const [posts] = await this.dbManager.query(
        'SELECT * FROM idea_xiaohongshu_posts WHERE id = ?',
        [postId]
      );

      if (posts.length === 0) {
        throw new Error('笔记不存在');
      }

      const post = posts[0];
      
      // 创建发布任务
      const taskId = await this.taskExecutor.createTask({
        type: 'post_publish',
        accountId: post.account_id,
        postId,
        immediate,
        priority: 2
      });

      return {
        taskId,
        message: '发布任务已创建'
      };

    } catch (error) {
      this.logger.error('发布笔记失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取笔记列表
   */
  async listPosts(params) {
    const { accountId, page = 1, limit = 20, status, type } = params;
    
    try {
      const offset = (page - 1) * limit;
      let whereClause = '1=1';
      const values = [];

      if (accountId) {
        whereClause += ' AND account_id = ?';
        values.push(accountId);
      }

      if (status) {
        whereClause += ' AND status = ?';
        values.push(status);
      }

      if (type) {
        whereClause += ' AND type = ?';
        values.push(type);
      }

      const [posts] = await this.dbManager.query(
        `SELECT p.*, a.username 
         FROM idea_xiaohongshu_posts p 
         JOIN idea_xiaohongshu_accounts a ON p.account_id = a.id 
         WHERE ${whereClause} 
         ORDER BY p.created_at DESC 
         LIMIT ? OFFSET ?`,
        [...values, limit, offset]
      );

      const [totalResult] = await this.dbManager.query(
        `SELECT COUNT(*) as total FROM idea_xiaohongshu_posts p WHERE ${whereClause}`,
        values
      );

      return {
        posts,
        pagination: {
          page,
          limit,
          total: totalResult[0].total,
          pages: Math.ceil(totalResult[0].total / limit)
        }
      };

    } catch (error) {
      this.logger.error('获取笔记列表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 删除笔记
   */
  async deletePost(params) {
    const { postId } = params;
    
    try {
      await this.dbManager.query(
        'UPDATE idea_xiaohongshu_posts SET status = "deleted" WHERE id = ?',
        [postId]
      );

      return { message: '笔记已删除' };

    } catch (error) {
      this.logger.error('删除笔记失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 更新笔记
   */
  async updatePost(params) {
    const { postId, ...updateData } = params;
    
    try {
      const fields = Object.keys(updateData);
      const values = Object.values(updateData);
      
      if (fields.length === 0) {
        throw new Error('没有要更新的字段');
      }

      const setClause = fields.map(field => `${field} = ?`).join(', ');
      
      await this.dbManager.query(
        `UPDATE idea_xiaohongshu_posts SET ${setClause}, updated_at = NOW() WHERE id = ?`,
        [...values, postId]
      );

      return { message: '笔记更新成功' };

    } catch (error) {
      this.logger.error('更新笔记失败', { error: error.message });
      throw error;
    }
  }

  // ===== 数据采集方法 =====

  /**
   * 搜索内容
   */
  async searchContent(params) {
    const { keyword, type = 'all', limit = 20, sort = 'relevant', accountId } = params;
    
    try {
      // 创建搜索任务
      const taskId = await this.taskExecutor.createTask({
        type: 'content_search',
        accountId,
        keyword,
        searchType: type,
        limit,
        sort,
        priority: 3
      });

      return {
        taskId,
        message: '搜索任务已创建'
      };

    } catch (error) {
      this.logger.error('搜索内容失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(params) {
    const { userId, accountId } = params;
    
    try {
      // 创建获取用户信息任务
      const taskId = await this.taskExecutor.createTask({
        type: 'user_info',
        accountId,
        userId,
        priority: 3
      });

      return {
        taskId,
        message: '获取用户信息任务已创建'
      };

    } catch (error) {
      this.logger.error('获取用户信息失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取笔记详情
   */
  async getPostInfo(params) {
    const { postId, accountId } = params;
    
    try {
      // 创建获取笔记详情任务
      const taskId = await this.taskExecutor.createTask({
        type: 'post_info',
        accountId,
        postId,
        priority: 3
      });

      return {
        taskId,
        message: '获取笔记详情任务已创建'
      };

    } catch (error) {
      this.logger.error('获取笔记详情失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取评论
   */
  async getComments(params) {
    const { postId, accountId, limit = 50, offset = 0 } = params;
    
    try {
      // 创建获取评论任务
      const taskId = await this.taskExecutor.createTask({
        type: 'comments_fetch',
        accountId,
        postId,
        limit,
        offset,
        priority: 3
      });

      return {
        taskId,
        message: '获取评论任务已创建'
      };

    } catch (error) {
      this.logger.error('获取评论失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取热门内容
   */
  async getTrending(params) {
    const { category = 'all', limit = 20, accountId } = params;
    
    try {
      // 创建获取热门内容任务
      const taskId = await this.taskExecutor.createTask({
        type: 'trending_fetch',
        accountId,
        category,
        limit,
        priority: 3
      });

      return {
        taskId,
        message: '获取热门内容任务已创建'
      };

    } catch (error) {
      this.logger.error('获取热门内容失败', { error: error.message });
      throw error;
    }
  }

  // ===== 任务管理方法 =====

  /**
   * 创建任务
   */
  async createTask(params) {
    const { type, accountId, taskData, cronExpression, priority = 1 } = params;
    
    try {
      const [result] = await this.dbManager.query(
        `INSERT INTO idea_xiaohongshu_tasks (task_type, account_id, task_data, cron_expression, priority) 
         VALUES (?, ?, ?, ?, ?)`,
        [type, accountId, JSON.stringify(taskData), cronExpression, priority]
      );

      return {
        taskId: result.insertId,
        message: '任务创建成功'
      };

    } catch (error) {
      this.logger.error('创建任务失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取任务列表
   */
  async listTasks(params) {
    const { accountId, type, status, page = 1, limit = 20 } = params;
    
    try {
      const offset = (page - 1) * limit;
      let whereClause = '1=1';
      const values = [];

      if (accountId) {
        whereClause += ' AND account_id = ?';
        values.push(accountId);
      }

      if (type) {
        whereClause += ' AND task_type = ?';
        values.push(type);
      }

      if (status) {
        whereClause += ' AND status = ?';
        values.push(status);
      }

      const [tasks] = await this.dbManager.query(
        `SELECT t.*, a.username 
         FROM idea_xiaohongshu_tasks t 
         JOIN idea_xiaohongshu_accounts a ON t.account_id = a.id 
         WHERE ${whereClause} 
         ORDER BY t.created_at DESC 
         LIMIT ? OFFSET ?`,
        [...values, limit, offset]
      );

      const [totalResult] = await this.dbManager.query(
        `SELECT COUNT(*) as total FROM idea_xiaohongshu_tasks t WHERE ${whereClause}`,
        values
      );

      return {
        tasks,
        pagination: {
          page,
          limit,
          total: totalResult[0].total,
          pages: Math.ceil(totalResult[0].total / limit)
        }
      };

    } catch (error) {
      this.logger.error('获取任务列表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 取消任务
   */
  async cancelTask(params) {
    const { taskId } = params;
    
    try {
      await this.dbManager.query(
        'UPDATE idea_xiaohongshu_tasks SET status = "cancelled" WHERE id = ?',
        [taskId]
      );

      return { message: '任务已取消' };

    } catch (error) {
      this.logger.error('取消任务失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(params) {
    const { taskId } = params;
    
    try {
      const [tasks] = await this.dbManager.query(
        'SELECT id, task_type, status, started_time, completed_time, error_message, result_data FROM idea_xiaohongshu_tasks WHERE id = ?',
        [taskId]
      );

      if (tasks.length === 0) {
        throw new Error('任务不存在');
      }

      const task = tasks[0];
      task.result_data = task.result_data ? JSON.parse(task.result_data) : null;

      return task;

    } catch (error) {
      this.logger.error('获取任务状态失败', { error: error.message });
      throw error;
    }
  }

  // ===== 系统管理方法 =====

  /**
   * 获取系统状态
   */
  async getSystemStatus() {
    try {
      const [accountStats] = await this.dbManager.query(
        'SELECT status, COUNT(*) as count FROM idea_xiaohongshu_accounts GROUP BY status'
      );

      const [taskStats] = await this.dbManager.query(
        'SELECT status, COUNT(*) as count FROM idea_xiaohongshu_tasks GROUP BY status'
      );

      const [postStats] = await this.dbManager.query(
        'SELECT status, COUNT(*) as count FROM idea_xiaohongshu_posts GROUP BY status'
      );

      return {
        accounts: accountStats,
        tasks: taskStats,
        posts: postStats,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('获取系统状态失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取系统配置
   */
  async getSystemConfig() {
    return {
      version: require('../../package.json').version,
      features: {
        accountManagement: true,
        contentPublishing: true,
        dataCollection: true,
        taskScheduling: true,
        monitoring: true
      },
      limits: {
        maxAccounts: 1000,
        maxTasks: 10000,
        maxPosts: 50000
      }
    };
  }

  /**
   * 获取系统统计
   */
  async getSystemStats() {
    try {
      const [totalAccounts] = await this.dbManager.query('SELECT COUNT(*) as total FROM idea_xiaohongshu_accounts');
      const [activeAccounts] = await this.dbManager.query('SELECT COUNT(*) as total FROM idea_xiaohongshu_accounts WHERE status = "active"');
      const [totalPosts] = await this.dbManager.query('SELECT COUNT(*) as total FROM idea_xiaohongshu_posts');
      const [publishedPosts] = await this.dbManager.query('SELECT COUNT(*) as total FROM idea_xiaohongshu_posts WHERE status = "published"');
      const [totalTasks] = await this.dbManager.query('SELECT COUNT(*) as total FROM idea_xiaohongshu_tasks');
      const [completedTasks] = await this.dbManager.query('SELECT COUNT(*) as total FROM idea_xiaohongshu_tasks WHERE status = "completed"');

      return {
        accounts: {
          total: totalAccounts[0].total,
          active: activeAccounts[0].total
        },
        posts: {
          total: totalPosts[0].total,
          published: publishedPosts[0].total
        },
        tasks: {
          total: totalTasks[0].total,
          completed: completedTasks[0].total
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('获取系统统计失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 启动会话清理
   */
  startSessionCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [sessionId, session] of this.sessions) {
        if (now - session.lastActivity > 30 * 60 * 1000) { // 30分钟无活动
          this.sessions.delete(sessionId);
        }
      }
    }, 5 * 60 * 1000); // 每5分钟检查一次
  }

  /**
   * 停止MCP管理器
   */
  async stop() {
    this.logger.info('🔧 停止MCP管理器...');
    this.sessions.clear();
    this.subscriptions.clear();
    this.logger.info('✅ MCP管理器已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      await this.dbManager.query('SELECT 1');
      return {
        status: 'healthy',
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
}

module.exports = MCPManager;