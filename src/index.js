/**
 * 小红书MCP主程序入口
 * 
 * @description 小红书MCP协议实现主程序，提供MCP协议服务、Web管理界面和任务调度功能
 * @author MCP团队
 * @version 1.0.0
 * @since 2024-12-20
 */

import dotenv from 'dotenv';
import { ConfigManager } from './config/config-manager.js';
import { DatabaseManager } from './core/database-manager.js';
import { TaskManager } from './core/task-manager.js';
import { logger } from './utils/logger.js';
import { WebApp } from './web/app.js';

// 加载环境变量
dotenv.config();

class XiaohongshuMCP {
    constructor() {
        this.configManager = null;
        this.databaseManager = null;
        this.taskManager = null;
        this.webApp = null;
        this.isRunning = false;
    }

    async initialize() {
        try {
            logger.info('🚀 启动小红书MCP系统...');
            
            // 加载配置
            this.configManager = new ConfigManager();
            await this.configManager.load();
            
            // 初始化数据库
            this.databaseManager = new DatabaseManager();
            await this.databaseManager.initialize(this.configManager.getDatabaseConfig());
            
            // 初始化任务管理器
            this.taskManager = new TaskManager(this.configManager, this.databaseManager);
            await this.taskManager.initialize();
            
            // 启动Web服务
            this.webApp = new WebApp(this.configManager, this.databaseManager, this.taskManager);
            await this.webApp.start();
            
            this.isRunning = true;
            logger.info('🎉 小红书MCP系统启动成功！');
            
        } catch (error) {
            logger.error('❌ 系统启动失败:', error);
            throw error;
        }
    }
}

// 启动应用
const app = new XiaohongshuMCP();
app.initialize();