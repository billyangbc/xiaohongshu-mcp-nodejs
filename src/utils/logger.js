/**
 * 日志工具模块
 * 提供结构化日志记录功能
 */

import { createWriteStream } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 日志级别枚举
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

/**
 * 日志级别名称映射
 */
const LogLevelNames = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL'
};

/**
 * 日志配置
 */
class LoggerConfig {
  constructor() {
    this.level = LogLevel.INFO;
    this.enableConsole = true;
    this.enableFile = true;
    this.logDir = join(__dirname, '../../logs');
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.maxFiles = 10;
    this.enableColors = true;
  }
}

/**
 * 日志记录器
 */
export class Logger {
  constructor(name = 'default', config = new LoggerConfig()) {
    this.name = name;
    this.config = config;
    this.fileStream = null;
    this.currentLogFile = null;
    this.logCount = 0;
    this.startTime = Date.now();
    
    if (this.config.enableFile) {
      this._initializeFileStream();
    }
  }
  
  /**
   * 初始化文件流
   * @private
   */
  _initializeFileStream() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = join(this.config.logDir, `${this.name}-${timestamp}.log`);
      
      this.currentLogFile = logFile;
      this.fileStream = createWriteStream(logFile, { flags: 'a' });
      
      // 监听错误事件
      this.fileStream.on('error', (error) => {
        console.error(`日志文件写入错误: ${error.message}`);
      });
      
      // 定期清理旧日志文件
      this._cleanupOldLogs();
      
    } catch (error) {
      console.error(`初始化日志文件失败: ${error.message}`);
      this.config.enableFile = false;
    }
  }
  
  /**
   * 清理旧日志文件
   * @private
   */
  async _cleanupOldLogs() {
    try {
      const { readdir, unlink, stat } = await import('fs/promises');
      const files = await readdir(this.config.logDir);
      
      const logFiles = [];
      for (const file of files) {
        if (file.startsWith(this.name) && file.endsWith('.log')) {
          const filePath = join(this.config.logDir, file);
          const stats = await stat(filePath);
          logFiles.push({
            path: filePath,
            size: stats.size,
            mtime: stats.mtime
          });
        }
      }
      
      // 按修改时间排序
      logFiles.sort((a, b) => b.mtime - a.mtime);
      
      // 删除超过最大文件数的旧文件
      if (logFiles.length > this.config.maxFiles) {
        const filesToDelete = logFiles.slice(this.config.maxFiles);
        for (const file of filesToDelete) {
          try {
            await unlink(file.path);
          } catch (error) {
            console.error(`删除旧日志文件失败: ${error.message}`);
          }
        }
      }
      
    } catch (error) {
      console.error(`清理旧日志文件失败: ${error.message}`);
    }
  }
  
  /**
   * 格式化日志消息
   * @param {number} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} meta - 元数据
   * @returns {string} 格式化后的日志
   */
  _formatLog(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const levelName = LogLevelNames[level] || 'UNKNOWN';
    const uptime = Date.now() - this.startTime;
    
    const logEntry = {
      timestamp,
      level: levelName,
      logger: this.name,
      uptime,
      message,
      meta,
      pid: process.pid,
      hostname: require('os').hostname()
    };
    
    return JSON.stringify(logEntry);
  }
  
  /**
   * 控制台颜色格式化
   * @param {string} text - 文本
   * @param {string} color - 颜色代码
   * @returns {string} 格式化后的文本
   */
  _colorize(text, color) {
    if (!this.config.enableColors) return text;
    
    const colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m'
    };
    
    return `${colors[color] || ''}${text}${colors.reset}`;
  }
  
  /**
   * 写入控制台
   * @param {number} level - 日志级别
   * @param {string} formattedLog - 格式化后的日志
   */
  _writeToConsole(level, formattedLog) {
    if (!this.config.enableConsole) return;
    
    try {
      const logData = JSON.parse(formattedLog);
      const timestamp = new Date(logData.timestamp).toLocaleString();
      const levelName = logData.level;
      
      let color = 'reset';
      switch (level) {
        case LogLevel.DEBUG:
          color = 'cyan';
          break;
        case LogLevel.INFO:
          color = 'green';
          break;
        case LogLevel.WARN:
          color = 'yellow';
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          color = 'red';
          break;
      }
      
      const consoleMessage = `${this._colorize(`[${timestamp}]`, 'bright')} ${this._colorize(`[${levelName}]`, color)} ${this._colorize(`[${this.name}]`, 'blue')} ${logData.message}`;
      
      if (level >= LogLevel.ERROR) {
        console.error(consoleMessage);
      } else {
        console.log(consoleMessage);
      }
      
      // 如果有元数据，也打印出来
      if (logData.meta && Object.keys(logData.meta).length > 0) {
        console.log('  Meta:', JSON.stringify(logData.meta, null, 2));
      }
      
    } catch (error) {
      console.error('控制台日志写入错误:', error);
    }
  }
  
  /**
   * 写入文件
   * @param {string} formattedLog - 格式化后的日志
   */
  _writeToFile(formattedLog) {
    if (!this.config.enableFile || !this.fileStream) return;
    
    try {
      this.fileStream.write(formattedLog + '\n');
      this.logCount++;
      
      // 检查文件大小，如果超过限制则创建新文件
      if (this.logCount % 100 === 0) {
        this._checkFileSize();
      }
      
    } catch (error) {
      console.error('文件日志写入错误:', error);
    }
  }
  
  /**
   * 检查文件大小
   * @private
   */
  async _checkFileSize() {
    try {
      const { stat } = await import('fs/promises');
      const stats = await stat(this.currentLogFile);
      
      if (stats.size > this.config.maxFileSize) {
        // 关闭当前文件流
        if (this.fileStream) {
          this.fileStream.end();
        }
        
        // 初始化新的文件流
        this._initializeFileStream();
      }
      
    } catch (error) {
      console.error(`检查日志文件大小失败: ${error.message}`);
    }
  }
  
  /**
   * 记录日志
   * @param {number} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} meta - 元数据
   */
  log(level, message, meta = {}) {
    if (level < this.config.level) return;
    
    const formattedLog = this._formatLog(level, message, meta);
    
    this._writeToConsole(level, formattedLog);
    this._writeToFile(formattedLog);
  }
  
  /**
   * 调试日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 元数据
   */
  debug(message, meta = {}) {
    this.log(LogLevel.DEBUG, message, meta);
  }
  
  /**
   * 信息日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 元数据
   */
  info(message, meta = {}) {
    this.log(LogLevel.INFO, message, meta);
  }
  
  /**
   * 警告日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 元数据
   */
  warn(message, meta = {}) {
    this.log(LogLevel.WARN, message, meta);
  }
  
  /**
   * 错误日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 元数据
   */
  error(message, meta = {}) {
    this.log(LogLevel.ERROR, message, meta);
  }
  
  /**
   * 致命错误日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 元数据
   */
  fatal(message, meta = {}) {
    this.log(LogLevel.FATAL, message, meta);
  }
  
  /**
   * 关闭日志记录器
   */
  close() {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }
}

/**
 * 全局日志记录器实例
 */
let globalLogger = null;

/**
 * 获取全局日志记录器
 * @param {string} name - 日志记录器名称
 * @returns {Logger} 日志记录器实例
 */
export function getLogger(name = 'global') {
  if (!globalLogger) {
    globalLogger = new Logger(name);
  }
  return globalLogger;
}

/**
 * 设置全局日志级别
 * @param {number} level - 日志级别
 */
export function setLogLevel(level) {
  if (globalLogger) {
    globalLogger.config.level = level;
  }
}

/**
 * 创建新的日志记录器
 * @param {string} name - 日志记录器名称
 * @param {LoggerConfig} config - 配置对象
 * @returns {Logger} 日志记录器实例
 */
export function createLogger(name, config) {
  return new Logger(name, config);
}

/**
 * 关闭所有日志记录器
 */
export function closeAllLoggers() {
  if (globalLogger) {
    globalLogger.close();
    globalLogger = null;
  }
}

// 导出默认的日志记录器
export const logger = getLogger();