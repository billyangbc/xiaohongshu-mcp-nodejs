/**
 * 日志工具模块
 * 提供统一的日志记录接口，支持多种日志级别和输出格式
 */

const fs = require('fs');
const path = require('path');

// 日志级别定义
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

class Logger {
  constructor(options = {}) {
    this.level = LOG_LEVELS[options.level?.toUpperCase()] || LOG_LEVELS.INFO;
    this.logDir = options.logDir || path.join(process.cwd(), 'logs');
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    
    this.logFile = null;
    this.errorFile = null;
    
    if (this.enableFile) {
      this.initializeLogFiles();
    }
  }

  /**
   * 初始化日志文件
   */
  initializeLogFiles() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    const date = new Date().toISOString().split('T')[0];
    this.logFile = path.join(this.logDir, `app-${date}.log`);
    this.errorFile = path.join(this.logDir, `error-${date}.log`);
  }

  /**
   * 格式化日志消息
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const levelStr = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);
    
    const logEntry = {
      timestamp,
      level: levelStr,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      meta,
      pid: process.pid
    };

    return JSON.stringify(logEntry);
  }

  /**
   * 写入日志文件
   */
  writeToFile(level, message, meta = {}) {
    if (!this.enableFile) return;

    try {
      const logMessage = this.formatMessage(level, message, meta);
      const file = level === LOG_LEVELS.ERROR ? this.errorFile : this.logFile;
      
      // 检查文件大小，需要轮换时创建新文件
      this.rotateLogFile(file);
      
      fs.appendFileSync(file, logMessage + '\n');
    } catch (error) {
      console.error('写入日志文件失败:', error);
    }
  }

  /**
   * 日志文件轮换
   */
  rotateLogFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > this.maxFileSize) {
          const dir = path.dirname(filePath);
          const basename = path.basename(filePath, '.log');
          const ext = path.extname(filePath);
          
          // 重命名现有文件
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const newName = path.join(dir, `${basename}-${timestamp}${ext}`);
          fs.renameSync(filePath, newName);
          
          // 清理旧文件
          this.cleanupOldFiles(dir, basename);
        }
      }
    } catch (error) {
      console.error('日志文件轮换失败:', error);
    }
  }

  /**
   * 清理旧日志文件
   */
  cleanupOldFiles(dir, basename) {
    try {
      const files = fs.readdirSync(dir)
        .filter(file => file.startsWith(basename))
        .map(file => ({
          name: file,
          path: path.join(dir, file),
          mtime: fs.statSync(path.join(dir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);

      // 保留最新的maxFiles个文件
      const filesToDelete = files.slice(this.maxFiles);
      filesToDelete.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (error) {
          console.error('删除旧日志文件失败:', error);
        }
      });
    } catch (error) {
      console.error('清理旧日志文件失败:', error);
    }
  }

  /**
   * 控制台输出
   */
  consoleOutput(level, message, meta = {}) {
    if (!this.enableConsole) return;

    const colors = {
      ERROR: '\x1b[31m',   // 红色
      WARN: '\x1b[33m',    // 黄色
      INFO: '\x1b[36m',    // 青色
      DEBUG: '\x1b[35m',   // 紫色
      TRACE: '\x1b[90m'    // 灰色
    };

    const reset = '\x1b[0m';
    const levelStr = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);
    const color = colors[levelStr] || '';
    
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    
    console.log(`${color}[${timestamp}] ${levelStr}:${reset} ${message}${metaStr}`);
  }

  /**
   * 记录日志
   */
  log(level, message, meta = {}) {
    if (level > this.level) return;

    this.consoleOutput(level, message, meta);
    this.writeToFile(level, message, meta);
  }

  /**
   * 错误日志
   */
  error(message, meta = {}) {
    this.log(LOG_LEVELS.ERROR, message, meta);
  }

  /**
   * 警告日志
   */
  warn(message, meta = {}) {
    this.log(LOG_LEVELS.WARN, message, meta);
  }

  /**
   * 信息日志
   */
  info(message, meta = {}) {
    this.log(LOG_LEVELS.INFO, message, meta);
  }

  /**
   * 调试日志
   */
  debug(message, meta = {}) {
    this.log(LOG_LEVELS.DEBUG, message, meta);
  }

  /**
   * 跟踪日志
   */
  trace(message, meta = {}) {
    this.log(LOG_LEVELS.TRACE, message, meta);
  }

  /**
   * 获取日志统计
   */
  getStats() {
    try {
      const stats = {
        logDir: this.logDir,
        level: Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === this.level),
        enableConsole: this.enableConsole,
        enableFile: this.enableFile,
        files: []
      };

      if (this.enableFile && fs.existsSync(this.logDir)) {
        const files = fs.readdirSync(this.logDir);
        stats.files = files.map(file => {
          const filePath = path.join(this.logDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            size: stats.size,
            mtime: stats.mtime
          };
        });
      }

      return stats;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 清理所有日志文件
   */
  cleanup() {
    try {
      if (fs.existsSync(this.logDir)) {
        const files = fs.readdirSync(this.logDir);
        files.forEach(file => {
          try {
            fs.unlinkSync(path.join(this.logDir, file));
          } catch (error) {
            console.error('清理日志文件失败:', error);
          }
        });
        logger.info('日志文件清理完成');
      }
    } catch (error) {
      console.error('清理日志目录失败:', error);
    }
  }
}

// 创建全局日志实例
const logger = new Logger({
  level: process.env.LOG_LEVEL || 'INFO',
  logDir: path.join(process.cwd(), 'logs'),
  enableConsole: process.env.NODE_ENV !== 'production',
  enableFile: true,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝', { reason, promise });
});

// 导出日志实例和类
module.exports = logger;
module.exports.Logger = Logger;
module.exports.LOG_LEVELS = LOG_LEVELS;