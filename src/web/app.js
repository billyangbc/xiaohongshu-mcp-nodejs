/**
 * Web应用主文件
 * Express + Socket.IO服务器，提供MCP API和管理界面
 */

import express from 'express';
import http from 'http';
import { Server as socketIo } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from '../utils/logger.js';
import MCPManager from '../core/mcp-manager.js';
import TaskManager from '../core/task-manager.js';
import DatabaseManager from '../database/database-manager.js';
import { getConfig } from '../config/config-manager.js';

class WebApplication {
  constructor(options = {}) {
    console.log('WebApplication constructor called');
    this.options = options;
    this.app = express();

    try {
      this.server = http.createServer(this.app);
      console.log('HTTP server created successfully');
    } catch (error) {
      console.error('Error creating HTTP server:', error);
      throw error;
    }

    // Temporarily disable Socket.IO to isolate the issue
    this.io = null;
    console.log('Socket.IO disabled for testing');

    // Use provided managers or create new ones
    this.db = options.dbManager || new DatabaseManager(getConfig('database'));
    this.taskManager = options.taskExecutor || new TaskManager(this.db);
    this.mcpManager = options.mcpManager || new MCPManager(this.taskManager, this.db);

    this.setupMiddleware();
    // this.setupSocketHandlers(); // Disabled for now
    this.setupErrorHandling();
  }

  /**
   * 设置中间件
   */
  setupMiddleware() {
    // 安全中间件
    this.app.use(helmet());
    this.app.use(compression());
    this.app.use(cors(getConfig('server.cors')));
    
    // 限流（暂时禁用，因为express-rate-limit包不存在）
    // 如果需要限流功能，请安装express-rate-limit包
    
    // 请求解析
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // 请求日志
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  /**
   * 设置路由
   */
  async setupRoutes() {
    console.log('开始设置路由...');

    // 健康检查
    this.app.get('/health', async (req, res) => {
      console.log('健康检查端点被调用');
      const packageJson = await import('../../package.json', { with: { type: 'json' } });
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: packageJson.default.version
      });
    });

    // MCP API路由 - 动态导入
    console.log('导入路由模块...');
    const mcpRoutes = (await import('./routes/mcp.js')).default;
    const adminRoutes = (await import('./routes/admin.js')).default;
    const apiRoutes = (await import('./routes/api.js')).default;
    console.log('路由模块导入完成');

    this.app.use('/api/mcp', mcpRoutes(this.mcpManager));
    this.app.use('/api/admin', adminRoutes(this.db, this.taskManager));
    this.app.use('/api/dashboard', apiRoutes(this.db, this.taskManager));
    console.log('API路由设置完成');

    // 静态文件服务
    console.log('设置静态文件服务...');
    this.app.use(express.static('public'));
    console.log('静态文件服务设置完成');

    // 管理界面
    this.app.get('/', (req, res) => {
      console.log('根路径被访问');
      res.sendFile('index.html', { root: 'public' });
    });

    // API文档
    this.app.get('/docs', (req, res) => {
      console.log('API文档端点被访问');
      res.json(this.mcpManager.getMethods());
    });

    console.log('所有路由设置完成');
  }

  /**
   * 设置Socket.IO处理器
   */
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`客户端连接: ${socket.id}`);

      // 订阅任务状态更新
      socket.on('subscribe_tasks', (accountId) => {
        socket.join(`tasks_${accountId}`);
        logger.info(`客户端 ${socket.id} 订阅任务: ${accountId}`);
      });

      // 订阅系统状态
      socket.on('subscribe_system', () => {
        socket.join('system');
        logger.info(`客户端 ${socket.id} 订阅系统状态`);
      });

      // 断开连接
      socket.on('disconnect', () => {
        logger.info(`客户端断开连接: ${socket.id}`);
      });
    });

    // 任务状态广播
    this.taskManager.on('task_update', (data) => {
      this.io.to(`tasks_${data.accountId}`).emit('task_update', data);
    });

    // 系统状态广播
    setInterval(async () => {
      try {
        const status = await this.mcpManager.handleRequest({
          jsonrpc: '2.0',
          method: 'system.status',
          id: null
        });
        
        this.io.to('system').emit('system_status', status);
      } catch (error) {
        logger.error('系统状态广播失败', error);
      }
    }, 5000);
  }

  /**
   * 设置错误处理
   */
  setupErrorHandling() {
    // 404处理
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found'
      });
    });

    // 错误处理中间件
    this.app.use((error, req, res, next) => {
      logger.error('Web应用错误', error);
      
      const status = error.status || 500;
      res.status(status).json({
        error: error.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    });

    // 进程错误处理
    process.on('uncaughtException', (error) => {
      logger.error('未捕获的异常', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未处理的Promise拒绝', { reason, promise });
    });
  }

  /**
   * 启动服务器
   */
  async start() {
    try {
      // 初始化数据库
      await this.db.initialize();
      logger.info('数据库初始化完成');

      // 初始化任务管理器
      await this.taskManager.initialize();
      logger.info('任务管理器初始化完成');

      // 设置路由（需要异步导入）
      await this.setupRoutes();
      logger.info('路由设置完成');

      // 启动服务器
      const port = this.options?.config?.app?.port || getConfig('server.port');
      const host = this.options?.config?.app?.host || getConfig('server.host');

      this.server.listen(port, host, () => {
        logger.info(`服务器启动成功`, {
          host,
          port,
          url: `http://${host}:${port}`
        });
      });

      // 优雅关闭
      process.on('SIGTERM', () => this.gracefulShutdown());
      process.on('SIGINT', () => this.gracefulShutdown());

    } catch (error) {
      logger.error('服务器启动失败', error);
      process.exit(1);
    }
  }

  /**
   * 优雅关闭
   */
  async gracefulShutdown() {
    logger.info('开始优雅关闭...');
    
    try {
      // 关闭服务器
      this.server.close(() => {
        logger.info('HTTP服务器已关闭');
      });

      // 停止任务管理器
      await this.taskManager.stop();
      logger.info('任务管理器已停止');

      // 关闭数据库连接
      await this.db.close();
      logger.info('数据库连接已关闭');

      process.exit(0);
    } catch (error) {
      logger.error('优雅关闭失败', error);
      process.exit(1);
    }
  }
}

// 启动应用
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = new WebApplication();
  app.start();
}

export default WebApplication;