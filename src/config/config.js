/**
 * 配置文件管理模块
 * 集中管理所有配置参数，支持环境变量覆盖
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 基础配置
const baseConfig = {
  // 应用配置
  app: {
    name: 'xiaohongshu-mcp',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0'
  },

  // 数据库配置
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'xiaohongshu_mcp',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
    timeout: parseInt(process.env.DB_TIMEOUT) || 60000,
    charset: 'utf8mb4',
    timezone: '+08:00'
  },

  // Redis配置（可选，用于缓存和会话）
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'xiaohongshu:'
  },

  // 日志配置
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || join(process.cwd(), 'logs'),
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
    maxSize: parseInt(process.env.LOG_MAX_SIZE) || 10 * 1024 * 1024 // 10MB
  },

  // 浏览器配置
  browser: {
    headless: process.env.BROWSER_HEADLESS !== 'false',
    timeout: parseInt(process.env.BROWSER_TIMEOUT) || 30000,
    slowMo: parseInt(process.env.BROWSER_SLOW_MO) || 100,
    viewport: {
      width: parseInt(process.env.BROWSER_VIEWPORT_WIDTH) || 1920,
      height: parseInt(process.env.BROWSER_VIEWPORT_HEIGHT) || 1080
    },
    userDataDir: process.env.BROWSER_USER_DATA_DIR || join(process.cwd(), 'user_data'),
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  },

  // 反风控配置
  antiBot: {
    // 指纹配置
    fingerprint: {
      enabled: process.env.FINGERPRINT_ENABLED !== 'false',
      randomize: process.env.FINGERPRINT_RANDOMIZE !== 'false',
      userAgent: process.env.FINGERPRINT_USER_AGENT || null,
      viewport: {
        minWidth: parseInt(process.env.FINGERPRINT_MIN_WIDTH) || 1024,
        maxWidth: parseInt(process.env.FINGERPRINT_MAX_WIDTH) || 1920,
        minHeight: parseInt(process.env.FINGERPRINT_MIN_HEIGHT) || 768,
        maxHeight: parseInt(process.env.FINGERPRINT_MAX_HEIGHT) || 1080
      }
    },

    // 行为模拟
    behavior: {
      mouse: {
        enabled: process.env.MOUSE_SIMULATION !== 'false',
        speed: parseInt(process.env.MOUSE_SPEED) || 50,
        randomness: parseInt(process.env.MOUSE_RANDOMNESS) || 20
      },
      keyboard: {
        enabled: process.env.KEYBOARD_SIMULATION !== 'false',
        speed: parseInt(process.env.KEYBOARD_SPEED) || 100,
        randomness: parseInt(process.env.KEYBOARD_RANDOMNESS) || 50
      },
      scroll: {
        enabled: process.env.SCROLL_SIMULATION !== 'false',
        speed: parseInt(process.env.SCROLL_SPEED) || 30,
        randomness: parseInt(process.env.SCROLL_RANDOMNESS) || 10
      }
    },

    // 延迟配置
    delays: {
      pageLoad: parseInt(process.env.DELAY_PAGE_LOAD) || 2000,
      action: parseInt(process.env.DELAY_ACTION) || 1000,
      typing: parseInt(process.env.DELAY_TYPING) || 100,
      scroll: parseInt(process.env.DELAY_SCROLL) || 500,
      random: {
        min: parseInt(process.env.DELAY_RANDOM_MIN) || 500,
        max: parseInt(process.env.DELAY_RANDOM_MAX) || 2000
      }
    }
  },

  // 代理配置
  proxy: {
    enabled: process.env.PROXY_ENABLED === 'true',
    rotation: process.env.PROXY_ROTATION === 'true',
    type: process.env.PROXY_TYPE || 'http',
    timeout: parseInt(process.env.PROXY_TIMEOUT) || 10000,
    maxRetries: parseInt(process.env.PROXY_MAX_RETRIES) || 3,
    healthCheck: {
      enabled: process.env.PROXY_HEALTH_CHECK !== 'false',
      interval: parseInt(process.env.PROXY_HEALTH_INTERVAL) || 300000, // 5分钟
      timeout: parseInt(process.env.PROXY_HEALTH_TIMEOUT) || 5000
    }
  },

  // MCP配置
  mcp: {
    version: '2.0',
    name: 'xiaohongshu-mcp',
    description: '小红书多账号管理MCP服务器',
    capabilities: {
      tools: true,
      resources: true,
      prompts: true
    },
    auth: {
      enabled: process.env.MCP_AUTH_ENABLED === 'true',
      secret: process.env.MCP_AUTH_SECRET || 'your-secret-key',
      tokenExpiry: parseInt(process.env.MCP_TOKEN_EXPIRY) || 3600 // 1小时
    }
  },

  // 任务配置
  task: {
    maxConcurrent: parseInt(process.env.TASK_MAX_CONCURRENT) || 5,
    maxRetries: parseInt(process.env.TASK_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.TASK_RETRY_DELAY) || 5000,
    timeout: parseInt(process.env.TASK_TIMEOUT) || 300000, // 5分钟
    cleanupInterval: parseInt(process.env.TASK_CLEANUP_INTERVAL) || 3600000, // 1小时
    maxHistory: parseInt(process.env.TASK_MAX_HISTORY) || 1000
  },

  // 监控配置
  monitoring: {
    enabled: process.env.MONITORING_ENABLED !== 'false',
    interval: parseInt(process.env.MONITORING_INTERVAL) || 60000, // 1分钟
    metrics: {
      memory: process.env.MONITOR_MEMORY !== 'false',
      cpu: process.env.MONITOR_CPU !== 'false',
      network: process.env.MONITOR_NETWORK !== 'false',
      browser: process.env.MONITOR_BROWSER !== 'false'
    },
    alerts: {
      enabled: process.env.ALERTS_ENABLED === 'true',
      webhook: process.env.ALERT_WEBHOOK || null,
      email: process.env.ALERT_EMAIL || null
    }
  },

  // 数据收集配置
  collection: {
    batchSize: parseInt(process.env.COLLECTION_BATCH_SIZE) || 50,
    maxDepth: parseInt(process.env.COLLECTION_MAX_DEPTH) || 3,
    rateLimit: {
      requests: parseInt(process.env.RATE_LIMIT_REQUESTS) || 100,
      window: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000 // 1分钟
    },
    filters: {
      minFollowers: parseInt(process.env.FILTER_MIN_FOLLOWERS) || 100,
      maxFollowers: parseInt(process.env.FILTER_MAX_FOLLOWERS) || 1000000,
      keywords: process.env.FILTER_KEYWORDS ? process.env.FILTER_KEYWORDS.split(',') : [],
      excludeKeywords: process.env.FILTER_EXCLUDE_KEYWORDS ? process.env.FILTER_EXCLUDE_KEYWORDS.split(',') : []
    }
  },

  // 安全配置
  security: {
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15分钟
      max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
      message: '请求过于频繁，请稍后再试'
    },
    cors: {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
      credentials: process.env.CORS_CREDENTIALS !== 'false'
    },
    helmet: {
      enabled: process.env.HELMET_ENABLED !== 'false'
    }
  },

  // 缓存配置
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.CACHE_TTL) || 3600, // 1小时
    maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1000,
    strategy: process.env.CACHE_STRATEGY || 'lru' // lru, fifo, lfu
  },

  // 文件存储配置
  storage: {
    type: process.env.STORAGE_TYPE || 'local', // local, s3, oss
    local: {
      path: process.env.STORAGE_LOCAL_PATH || join(process.cwd(), 'uploads')
    },
    s3: {
      region: process.env.S3_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET || '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ''
    },
    oss: {
      region: process.env.OSS_REGION || 'oss-cn-hangzhou',
      bucket: process.env.OSS_BUCKET || '',
      accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.OSS_SECRET_ACCESS_KEY || ''
    }
  },

  // 通知配置
  notification: {
    email: {
      enabled: process.env.EMAIL_ENABLED === 'true',
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER || '',
        pass: process.env.EMAIL_PASS || ''
      },
      from: process.env.EMAIL_FROM || ''
    },
    webhook: {
      enabled: process.env.WEBHOOK_ENABLED === 'true',
      url: process.env.WEBHOOK_URL || '',
      secret: process.env.WEBHOOK_SECRET || ''
    }
  }
};

// 环境特定配置
const envConfig = {
  development: {
    app: {
      debug: true
    },
    browser: {
      headless: false,
      slowMo: 100
    },
    logger: {
      level: 'debug',
      enableConsole: true
    }
  },

  production: {
    app: {
      debug: false
    },
    browser: {
      headless: true,
      slowMo: 0
    },
    logger: {
      level: 'info',
      enableConsole: false
    },
    security: {
      helmet: {
        enabled: true
      }
    }
  },

  test: {
    app: {
      port: 3001
    },
    database: {
      database: 'xiaohongshu_mcp_test'
    },
    browser: {
      headless: true,
      timeout: 10000
    },
    logger: {
      level: 'error',
      enableFile: false
    }
  }
};

/**
 * 合并配置对象
 */
function mergeConfig(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeConfig(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

/**
 * 获取当前环境的配置
 */
function getConfig() {
  const env = process.env.NODE_ENV || 'development';
  const envSpecific = envConfig[env] || {};
  
  return mergeConfig(baseConfig, envSpecific);
}

// 配置验证
function validateConfig(config) {
  const errors = [];

  // 验证数据库配置
  if (!config.database.user) {
    errors.push('数据库用户名未配置 (DB_USER)');
  }
  if (!config.database.password) {
    errors.push('数据库密码未配置 (DB_PASSWORD)');
  }

  // 验证存储配置
  if (config.storage.type === 's3' && (!config.storage.s3.bucket || !config.storage.s3.accessKeyId)) {
    errors.push('S3存储配置不完整');
  }

  // 验证通知配置
  if (config.notification.email.enabled && (!config.notification.email.auth.user || !config.notification.email.auth.pass)) {
    errors.push('邮件通知配置不完整');
  }

  return errors;
}

// 导出配置
const config = getConfig();
const validationErrors = validateConfig(config);

if (validationErrors.length > 0) {
  console.warn('配置验证警告:');
  validationErrors.forEach(error => console.warn(`  - ${error}`));
}

export default {
  ...config,
  validate: validateConfig,
  reload: getConfig
};