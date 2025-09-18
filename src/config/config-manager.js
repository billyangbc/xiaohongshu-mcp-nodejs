/**
 * 配置管理器
 * 统一管理所有配置项，支持环境变量、配置文件和默认值
 */

import { logger } from '../utils/logger.js';

/**
 * 配置管理器类
 */
class ConfigManager {
  constructor() {
    this.configs = new Map();
    this.initialized = false;
    
    // 默认配置
    this.defaultConfigs = {
      // 服务器配置
      NODE_ENV: 'development',
      SERVER_HOST: '0.0.0.0',
      SERVER_PORT: 3000,
      WEBSOCKET_PORT: 3001,
      
      // 数据库配置
      DB_HOST: 'localhost',
      DB_PORT: 3306,
      DB_USER: 'root',
      DB_PASSWORD: '',
      DB_NAME: 'xiaohongshu_mcp',
      DB_CONNECTION_LIMIT: 10,
      DB_ACQUIRE_TIMEOUT: 60000,
      DB_TIMEOUT: 60000,
      DB_DEBUG: false,
      DB_TRACE: false,
      
      // Redis配置
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_PASSWORD: '',
      REDIS_DB: 0,
      
      // 浏览器配置
      BROWSER_HEADLESS: true,
      BROWSER_TIMEOUT: 30000,
      BROWSER_MAX_CONCURRENCY: 5,
      BROWSER_USER_DATA_DIR: './data/browser',
      
      // 代理配置
      PROXY_ENABLED: true,
      PROXY_CHECK_INTERVAL: 300000,
      PROXY_TIMEOUT: 10000,
      PROXY_MAX_FAILURES: 3,
      
      // 指纹配置
      FINGERPRINT_ENABLED: true,
      FINGERPRINT_CACHE_SIZE: 1000,
      FINGERPRINT_UPDATE_INTERVAL: 86400000,
      
      // MCP配置
      MCP_SERVER_HOST: '0.0.0.0',
      MCP_SERVER_PORT: 3000,
      MCP_WEBSOCKET_PORT: 3001,
      MCP_MAX_REQUEST_SIZE: 10485760, // 10MB
      MCP_REQUEST_TIMEOUT: 30000,
      
      // 任务配置
      TASK_MAX_CONCURRENCY: 10,
      TASK_RETRY_ATTEMPTS: 3,
      TASK_RETRY_DELAY: 2000,
      TASK_TIMEOUT: 300000,
      
      // 日志配置
      LOG_LEVEL: 'info',
      LOG_FILE_ENABLED: true,
      LOG_FILE_PATH: './logs',
      LOG_MAX_SIZE: 10485760, // 10MB
      LOG_MAX_FILES: 10,
      
      // 安全配置
      JWT_SECRET: 'your-secret-key-change-this',
      JWT_EXPIRES_IN: '24h',
      API_RATE_LIMIT: 100,
      API_RATE_LIMIT_WINDOW: 900000, // 15分钟
      
      // 文件上传配置
      UPLOAD_MAX_SIZE: 10485760, // 10MB
      UPLOAD_ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
      UPLOAD_PATH: './data/uploads',
      
      // 缓存配置
      CACHE_ENABLED: true,
      CACHE_TTL: 3600,
      CACHE_MAX_SIZE: 1000,
      
      // 监控配置
      MONITORING_ENABLED: true,
      MONITORING_INTERVAL: 60000,
      HEALTH_CHECK_INTERVAL: 30000
    };
  }
  
  /**
   * 初始化配置管理器
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    
    try {
      logger.info('正在初始化配置管理器...');
      
      // 加载环境变量
      this.loadEnvironmentVariables();
      
      // 加载配置文件
      await this.loadConfigFiles();
      
      // 验证必要配置
      this.validateRequiredConfigs();
      
      this.initialized = true;
      logger.info('配置管理器初始化成功');
      
      // 输出当前配置（开发模式）
      if (this.get('NODE_ENV') === 'development') {
        this.printCurrentConfigs();
      }
    } catch (error) {
      logger.error('配置管理器初始化失败:', error);
      throw error;
    }
  }
  
  /**
   * 加载环境变量
   */
  loadEnvironmentVariables() {
    // 从process.env加载配置
    Object.keys(this.defaultConfigs).forEach(key => {
      if (process.env[key] !== undefined) {
        let value = process.env[key];
        
        // 类型转换
        if (typeof this.defaultConfigs[key] === 'boolean') {
          value = value === 'true' || value === '1';
        } else if (typeof this.defaultConfigs[key] === 'number') {
          value = Number(value);
        } else if (Array.isArray(this.defaultConfigs[key])) {
          value = value.split(',').map(item => item.trim());
        }
        
        this.configs.set(key, value);
        logger.debug(`从环境变量加载配置: ${key} = ${value}`);
      }
    });
  }
  
  /**
   * 加载配置文件
   */
  async loadConfigFiles() {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const configFiles = [
      '.env',
      '.env.local',
      '.env.development',
      '.env.production',
      'config.json',
      'config.js'
    ];
    
    for (const configFile of configFiles) {
      const configPath = path.resolve(process.cwd(), configFile);
      
      try {
        const exists = await fs.access(configPath).then(() => true).catch(() => false);
        
        if (exists) {
          if (configFile.endsWith('.json')) {
            const content = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(content);
            
            Object.entries(config).forEach(([key, value]) => {
              if (!this.configs.has(key)) {
                this.configs.set(key, value);
                logger.debug(`从配置文件加载: ${key} = ${value}`);
              }
            });
          } else if (configFile.endsWith('.js')) {
            const config = await import(configPath);
            
            Object.entries(config.default || config).forEach(([key, value]) => {
              if (!this.configs.has(key)) {
                this.configs.set(key, value);
                logger.debug(`从JS配置文件加载: ${key} = ${value}`);
              }
            });
          } else if (configFile.startsWith('.env')) {
            const content = await fs.readFile(configPath, 'utf8');
            const lines = content.split('\n');
            
            lines.forEach(line => {
              line = line.trim();
              if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                const value = valueParts.join('=').trim();
                
                if (key && value && !this.configs.has(key)) {
                  // 类型转换
                  let typedValue = value;
                  const defaultValue = this.defaultConfigs[key];
                  
                  if (typeof defaultValue === 'boolean') {
                    typedValue = value === 'true' || value === '1';
                  } else if (typeof defaultValue === 'number') {
                    typedValue = Number(value);
                  } else if (Array.isArray(defaultValue)) {
                    typedValue = value.split(',').map(item => item.trim());
                  }
                  
                  this.configs.set(key, typedValue);
                  logger.debug(`从.env文件加载: ${key} = ${typedValue}`);
                }
              }
            });
          }
        }
      } catch (error) {
        logger.warn(`加载配置文件 ${configFile} 失败:`, error.message);
      }
    }
  }
  
  /**
   * 验证必要配置
   */
  validateRequiredConfigs() {
    const requiredConfigs = [
      'DB_HOST',
      'DB_PORT',
      'DB_USER',
      'DB_NAME',
      'MCP_SERVER_HOST',
      'MCP_SERVER_PORT'
    ];
    
    const missingConfigs = requiredConfigs.filter(key => {
      const value = this.get(key);
      return value === undefined || value === null || value === '';
    });
    
    if (missingConfigs.length > 0) {
      throw new Error(`缺少必要配置项: ${missingConfigs.join(', ')}`);
    }
  }
  
  /**
   * 获取配置值
   * @param {string} key - 配置键
   * @param {*} defaultValue - 默认值
   * @returns {*} 配置值
   */
  get(key, defaultValue = null) {
    // 优先使用已设置的配置
    if (this.configs.has(key)) {
      return this.configs.get(key);
    }
    
    // 其次使用默认配置
    if (this.defaultConfigs[key] !== undefined) {
      return this.defaultConfigs[key];
    }
    
    // 最后使用传入的默认值
    return defaultValue;
  }
  
  /**
   * 设置配置值
   * @param {string} key - 配置键
   * @param {*} value - 配置值
   */
  set(key, value) {
    this.configs.set(key, value);
    logger.debug(`设置配置: ${key} = ${value}`);
  }
  
  /**
   * 检查配置是否存在
   * @param {string} key - 配置键
   * @returns {boolean} 是否存在
   */
  has(key) {
    return this.configs.has(key) || this.defaultConfigs[key] !== undefined;
  }
  
  /**
   * 删除配置
   * @param {string} key - 配置键
   */
  delete(key) {
    this.configs.delete(key);
    logger.debug(`删除配置: ${key}`);
  }
  
  /**
   * 获取所有配置
   * @returns {Object} 所有配置
   */
  getAll() {
    const allConfigs = { ...this.defaultConfigs };
    
    // 覆盖已设置的配置
    for (const [key, value] of this.configs) {
      allConfigs[key] = value;
    }
    
    return allConfigs;
  }
  
  /**
   * 获取数据库配置
   * @returns {Object} 数据库配置
   */
  getDatabaseConfig() {
    return {
      host: this.get('DB_HOST'),
      port: this.get('DB_PORT'),
      user: this.get('DB_USER'),
      password: this.get('DB_PASSWORD'),
      database: this.get('DB_NAME'),
      connectionLimit: this.get('DB_CONNECTION_LIMIT'),
      acquireTimeout: this.get('DB_ACQUIRE_TIMEOUT'),
      timeout: this.get('DB_TIMEOUT'),
      debug: this.get('DB_DEBUG'),
      trace: this.get('DB_TRACE')
    };
  }
  
  /**
   * 获取MCP服务器配置
   * @returns {Object} MCP服务器配置
   */
  getMCPServerConfig() {
    return {
      host: this.get('MCP_SERVER_HOST'),
      port: this.get('MCP_SERVER_PORT'),
      websocketPort: this.get('MCP_WEBSOCKET_PORT'),
      maxRequestSize: this.get('MCP_MAX_REQUEST_SIZE'),
      requestTimeout: this.get('MCP_REQUEST_TIMEOUT')
    };
  }
  
  /**
   * 获取浏览器配置
   * @returns {Object} 浏览器配置
   */
  getBrowserConfig() {
    return {
      headless: this.get('BROWSER_HEADLESS'),
      timeout: this.get('BROWSER_TIMEOUT'),
      maxConcurrency: this.get('BROWSER_MAX_CONCURRENCY'),
      userDataDir: this.get('BROWSER_USER_DATA_DIR')
    };
  }
  
  /**
   * 获取代理配置
   * @returns {Object} 代理配置
   */
  getProxyConfig() {
    return {
      enabled: this.get('PROXY_ENABLED'),
      checkInterval: this.get('PROXY_CHECK_INTERVAL'),
      timeout: this.get('PROXY_TIMEOUT'),
      maxFailures: this.get('PROXY_MAX_FAILURES')
    };
  }
  
  /**
   * 获取任务配置
   * @returns {Object} 任务配置
   */
  getTaskConfig() {
    return {
      maxConcurrency: this.get('TASK_MAX_CONCURRENCY'),
      retryAttempts: this.get('TASK_RETRY_ATTEMPTS'),
      retryDelay: this.get('TASK_RETRY_DELAY'),
      timeout: this.get('TASK_TIMEOUT')
    };
  }
  
  /**
   * 获取日志配置
   * @returns {Object} 日志配置
   */
  getLoggerConfig() {
    return {
      level: this.get('LOG_LEVEL'),
      fileEnabled: this.get('LOG_FILE_ENABLED'),
      filePath: this.get('LOG_FILE_PATH'),
      maxSize: this.get('LOG_MAX_SIZE'),
      maxFiles: this.get('LOG_MAX_FILES')
    };
  }
  
  /**
   * 输出当前配置（开发模式）
   */
  printCurrentConfigs() {
    const configs = this.getAll();
    
    logger.info('当前配置信息:');
    Object.keys(this.defaultConfigs).forEach(key => {
      const value = configs[key];
      const isDefault = !this.configs.has(key);
      const status = isDefault ? '(默认)' : '(已设置)';
      
      // 隐藏敏感信息
      let displayValue = value;
      if (key.includes('PASSWORD') || key.includes('SECRET')) {
        displayValue = value ? '***' : '未设置';
      }
      
      logger.info(`  ${key}: ${displayValue} ${status}`);
    });
  }
  
  /**
   * 重新加载配置
   */
  async reload() {
    logger.info('重新加载配置...');
    this.configs.clear();
    await this.initialize();
  }
}

// 创建全局配置管理器实例
const configManager = new ConfigManager();

/**
 * 初始化配置管理器
 */
export async function initializeConfig() {
  await configManager.initialize();
}

/**
 * 获取配置管理器实例
 */
export function getConfigManager() {
  return configManager;
}

/**
 * 获取配置值（快捷函数）
 */
export function getConfig(key, defaultValue = null) {
  return configManager.get(key, defaultValue);
}

/**
 * 设置配置值（快捷函数）
 */
export function setConfig(key, value) {
  return configManager.set(key, value);
}

// 导出配置管理器
export { configManager };