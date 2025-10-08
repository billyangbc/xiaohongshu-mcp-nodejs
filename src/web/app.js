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
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger.js';
import MCPManager from '../core/mcp-manager.js';
import TaskManager from '../core/task-manager.js';
import DatabaseManager from '../core/database-manager.js';
import config from '../config/config-manager.js';

class WebApplication {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: config.get('server.cors.origin'),
        methods: ['GET', 'POST']
      }
    });
    
    this.db = new DatabaseManager();
    this.taskManager = new TaskManager(this.db);
    this.mcpManager = new MCPManager(this.taskManager, this.db);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
    this.setupErrorHandling();
  }

  /**
   * 设置中间件
   */
  setupMiddleware() {
    // 安全中间件
    this.app.use(helmet());
    this.app.use(compression());
    this.app.use(cors(config.get('server.cors')));
    
    // 限流
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15分钟
      max: 1000, // 限制每个IP 1000次请求
      message: 'Too many requests from this IP'
    });
    this.app.use(limiter);
    
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
  setupRoutes() {
    // 健康检查
    this.app.get('/health', async (req, res) => {
      const packageJson = await import('../../package.json', { with: { type: 'json' } });
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: packageJson.default.version
      });
    });

    // MCP API路由
    this.app.use('/api/mcp', (await import('./routes/mcp.js')).default(this.mcpManager));
    this.app.use('/api/admin', (await import('./routes/admin.js')).default(this.db, this.taskManager));
    this.app.use('/api/dashboard', (await import('./routes/api.js')).default(this.db, this.taskManager));

    // 静态文件服务
    this.app.use(express.static('public'));
    
    // 管理界面
    this.app.get('/', (req, res) => {
      res.sendFile('index.html', { root: 'public' });
    });

    // API文档
    this.app.get('/docs', (req, res) => {
      res.json(this.mcpManager.getMethods());
    });
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

      // 启动服务器
      const port = config.get('server.port');
      const host = config.get('server.host');
      
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