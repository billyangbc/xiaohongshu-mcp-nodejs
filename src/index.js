/**
 * 小红书MCP项目主入口文件
 * 启动和管理整个MCP服务器系统
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

import { logger } from './utils/logger.js';
import config from './config/config.js';
import DatabaseManager from './database/database-manager.js';
import MCPManager from './core/mcp-manager.js';
import WebApplication from './web/app.js';
import TaskExecutor from './core/task-executor.js';
import BrowserManager from './core/browser-manager.js';

class XiaohongshuMCPServer {
  constructor() {
    this.dbManager = null;
    this.mcpManager = null;
    this.webApp = null;
    this.taskExecutor = null;
    this.browserManager = null;
    this.isRunning = false;
    this.shutdownInProgress = false;
  }

  /**
   * 初始化系统
   */
  async initialize() {
    try {
      logger.info('🚀 启动小红书MCP服务器...');
      logger.info(`环境: ${config.app.env}`);
      logger.info(`版本: ${config.app.version}`);

      // 验证配置
      const configErrors = config.validate(config);
      if (configErrors.length > 0) {
        logger.warn('配置验证警告:', configErrors);
      }

      // 初始化数据库
      await this.initializeDatabase();

      // 初始化浏览器管理器
      await this.initializeBrowserManager();

      // 初始化任务执行器
      await this.initializeTaskExecutor();

      // 初始化MCP管理器
      await this.initializeMCPManager();

      // 初始化Web应用
      await this.initializeWebApp();

      logger.info('✅ 系统初始化完成');
      this.isRunning = true;

    } catch (error) {
      logger.error('❌ 系统初始化失败', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * 初始化数据库
   */
  async initializeDatabase() {
    try {
      logger.info('📊 初始化数据库管理器...');
      this.dbManager = new DatabaseManager(config.database);
      await this.dbManager.initialize();
      logger.info('✅ 数据库管理器初始化完成');
    } catch (error) {
      logger.error('❌ 数据库初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 初始化浏览器管理器
   */
  async initializeBrowserManager() {
    try {
      logger.info('🌐 初始化浏览器管理器...');
      this.browserManager = new BrowserManager({
        browser: config.browser,
        antiBot: config.antiBot,
        proxy: config.proxy,
        logger
      });
      await this.browserManager.initialize();
      logger.info('✅ 浏览器管理器初始化完成');
    } catch (error) {
      logger.error('❌ 浏览器管理器初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 初始化任务执行器
   */
  async initializeTaskExecutor() {
    try {
      logger.info('⚙️ 初始化任务执行器...');
      this.taskExecutor = new TaskExecutor({
        dbManager: this.dbManager,
        browserManager: this.browserManager,
        config: config.task,
        logger
      });
      await this.taskExecutor.initialize();
      logger.info('✅ 任务执行器初始化完成');
    } catch (error) {
      logger.error('❌ 任务执行器初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 初始化MCP管理器
   */
  async initializeMCPManager() {
    try {
      logger.info('🔧 初始化MCP管理器...');
      this.mcpManager = new MCPManager({
        dbManager: this.dbManager,
        taskExecutor: this.taskExecutor,
        browserManager: this.browserManager,
        config: config.mcp,
        logger
      });
      await this.mcpManager.initialize();
      logger.info('✅ MCP管理器初始化完成');
    } catch (error) {
      logger.error('❌ MCP管理器初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 初始化Web应用
   */
  async initializeWebApp() {
    try {
      logger.info('🌐 初始化Web应用...');
      this.webApp = new WebApplication({
        mcpManager: this.mcpManager,
        dbManager: this.dbManager,
        taskExecutor: this.taskExecutor,
        config: {
          app: config.app,
          security: config.security,
          cors: config.security.cors
        },
        logger
      });
      await this.webApp.start();
      logger.info(`✅ Web应用启动完成，监听: ${config.app.host}:${config.app.port}`);
    } catch (error) {
      logger.error('❌ Web应用启动失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 启动系统监控
   */
  startMonitoring() {
    if (!config.monitoring.enabled) {
      logger.info('📊 系统监控已禁用');
      return;
    }

    logger.info('📊 启动系统监控...');
    
    // 内存监控
    if (config.monitoring.metrics.memory) {
      setInterval(() => {
        const memUsage = process.memoryUsage();
        const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        
        if (memPercent > 80) {
          logger.warn('⚠️ 内存使用率过高', {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
            percent: Math.round(memPercent) + '%'
          });
        }
      }, config.monitoring.interval);
    }

    // CPU监控
    if (config.monitoring.metrics.cpu) {
      const startUsage = process.cpuUsage();
      setInterval(() => {
        const currentUsage = process.cpuUsage(startUsage);
        const cpuPercent = ((currentUsage.user + currentUsage.system) / 1000000) * 100;
        
        if (cpuPercent > 80) {
          logger.warn('⚠️ CPU使用率过高', { percent: Math.round(cpuPercent) + '%' });
        }
      }, config.monitoring.interval);
    }

    logger.info('✅ 系统监控启动完成');
  }

  /**
   * 获取系统状态
   */
  async getSystemStatus() {
    const status = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      components: {
        database: this.dbManager ? await this.dbManager.healthCheck() : { status: 'not_initialized' },
        browser: this.browserManager ? await this.browserManager.healthCheck() : { status: 'not_initialized' },
        webApp: this.webApp ? await this.webApp.healthCheck() : { status: 'not_initialized' },
        taskExecutor: this.taskExecutor ? await this.taskExecutor.healthCheck() : { status: 'not_initialized' },
        mcpManager: this.mcpManager ? await this.mcpManager.healthCheck() : { status: 'not_initialized' }
      }
    };

    return status;
  }

  /**
   * 优雅关闭系统
   */
  async shutdown() {
    if (this.shutdownInProgress) {
      logger.warn('🔄 关闭已在进行中...');
      return;
    }

    this.shutdownInProgress = true;
    logger.info('🛑 开始优雅关闭系统...');

    try {
      // 停止Web应用
      if (this.webApp) {
        logger.info('🌐 停止Web应用...');
        await this.webApp.stop();
        logger.info('✅ Web应用已停止');
      }

      // 停止任务执行器
      if (this.taskExecutor) {
        logger.info('⚙️ 停止任务执行器...');
        await this.taskExecutor.stop();
        logger.info('✅ 任务执行器已停止');
      }

      // 停止MCP管理器
      if (this.mcpManager) {
        logger.info('🔧 停止MCP管理器...');
        await this.mcpManager.stop();
        logger.info('✅ MCP管理器已停止');
      }

      // 停止浏览器管理器
      if (this.browserManager) {
        logger.info('🌐 停止浏览器管理器...');
        await this.browserManager.cleanup();
        logger.info('✅ 浏览器管理器已停止');
      }

      // 关闭数据库连接
      if (this.dbManager) {
        logger.info('📊 关闭数据库连接...');
        await this.dbManager.close();
        logger.info('✅ 数据库连接已关闭');
      }

      logger.info('✅ 系统已完全关闭');
      this.isRunning = false;
      process.exit(0);

    } catch (error) {
      logger.error('❌ 关闭系统时发生错误', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * 启动系统
   */
  async start() {
    try {
      await this.initialize();
      this.startMonitoring();

      // 注册优雅关闭处理
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
      process.on('uncaughtException', (error) => {
        logger.error('未捕获的异常', { error: error.message, stack: error.stack });
        this.shutdown();
      });
      process.on('unhandledRejection', (reason, promise) => {
        logger.error('未处理的Promise拒绝', { reason, promise });
        this.shutdown();
      });

      logger.info('🎉 小红书MCP服务器启动成功！');
      logger.info(`🌐 Web管理界面: http://localhost:${config.app.port}`);
      logger.info(`📊 API文档: http://localhost:${config.app.port}/api/docs`);
      logger.info(`🔧 MCP端点: http://localhost:${config.app.port}/api/mcp`);

    } catch (error) {
      logger.error('❌ 启动失败', { error: error.message });
      await this.shutdown();
    }
  }
}

// 如果直接运行此文件
const server = new XiaohongshuMCPServer();
server.start().catch(error => {
  logger.error('❌ 启动失败', { error: error.message });
  process.exit(1);
});

export default XiaohongshuMCPServer;