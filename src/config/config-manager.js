/**
 * 配置管理器
 * 
 * @description 统一管理所有配置，支持环境变量、配置文件和默认值
 * @author MCP团队
 * @since 2024-12-20
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Joi from 'joi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ConfigManager {
    constructor() {
        this.config = {};
        this.schema = this._createSchema();
    }

    _createSchema() {
        return Joi.object({
            server: Joi.object({
                port: Joi.number().default(3000),
                host: Joi.string().default('0.0.0.0'),
                cors: Joi.object({
                    origin: Joi.array().items(Joi.string()).default(['http://localhost:3000']),
                    credentials: Joi.boolean().default(true)
                }),
                rateLimit: Joi.object({
                    windowMs: Joi.number().default(15 * 60 * 1000),
                    max: Joi.number().default(100)
                })
            }),
            database: Joi.object({
                host: Joi.string().default('localhost'),
                port: Joi.number().default(3306),
                username: Joi.string().required(),
                password: Joi.string().required(),
                database: Joi.string().required(),
                dialect: Joi.string().default('mysql'),
                pool: Joi.object({
                    max: Joi.number().default(5),
                    min: Joi.number().default(0),
                    acquire: Joi.number().default(30000),
                    idle: Joi.number().default(10000)
                })
            }),
            redis: Joi.object({
                host: Joi.string().default('localhost'),
                port: Joi.number().default(6379),
                password: Joi.string().allow(''),
                db: Joi.number().default(0)
            }),
            playwright: Joi.object({
                headless: Joi.boolean().default(false),
                timeout: Joi.number().default(30000),
                viewport: Joi.object({
                    width: Joi.number().default(1920),
                    height: Joi.number().default(1080)
                }),
                userDataDir: Joi.string().default('./browser-data'),
                downloadsPath: Joi.string().default('./downloads')
            }),
            xiaohongshu: Joi.object({
                baseUrl: Joi.string().default('https://www.xiaohongshu.com'),
                loginTimeout: Joi.number().default(60000),
                maxRetries: Joi.number().default(3),
                retryDelay: Joi.number().default(2000),
                antiDetect: Joi.object({
                    enabled: Joi.boolean().default(true),
                    stealth: Joi.boolean().default(true),
                    ghostCursor: Joi.boolean().default(true),
                    fingerprint: Joi.boolean().default(true)
                })
            }),
            logging: Joi.object({
                level: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
                file: Joi.string().default('./logs/app.log'),
                maxSize: Joi.string().default('10m'),
                maxFiles: Joi.number().default(5)
            })
        });
    }

    async load() {
        try {
            const configPath = path.join(process.cwd(), 'config.json');
            let fileConfig = {};

            if (fs.existsSync(configPath)) {
                const configContent = fs.readFileSync(configPath, 'utf8');
                fileConfig = JSON.parse(configContent);
            }

            // 合并环境变量、配置文件和默认值
            this.config = {
                server: {
                    port: process.env.PORT || fileConfig.server?.port || 3000,
                    host: process.env.HOST || fileConfig.server?.host || '0.0.0.0',
                    cors: {
                        origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : 
                               fileConfig.server?.cors?.origin || ['http://localhost:3000'],
                        credentials: process.env.CORS_CREDENTIALS === 'true' || 
                                   fileConfig.server?.cors?.credentials || true
                    },
                    rateLimit: {
                        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 
                                 fileConfig.server?.rateLimit?.windowMs || 15 * 60 * 1000,
                        max: parseInt(process.env.RATE_LIMIT_MAX) || 
                             fileConfig.server?.rateLimit?.max || 100
                    }
                },
                database: {
                    host: process.env.DB_HOST || fileConfig.database?.host || 'localhost',
                    port: parseInt(process.env.DB_PORT) || fileConfig.database?.port || 3306,
                    username: process.env.DB_USERNAME || fileConfig.database?.username,
                    password: process.env.DB_PASSWORD || fileConfig.database?.password,
                    database: process.env.DB_NAME || fileConfig.database?.database,
                    dialect: process.env.DB_DIALECT || fileConfig.database?.dialect || 'mysql',
                    pool: {
                        max: parseInt(process.env.DB_POOL_MAX) || fileConfig.database?.pool?.max || 5,
                        min: parseInt(process.env.DB_POOL_MIN) || fileConfig.database?.pool?.min || 0,
                        acquire: parseInt(process.env.DB_POOL_ACQUIRE) || fileConfig.database?.pool?.acquire || 30000,
                        idle: parseInt(process.env.DB_POOL_IDLE) || fileConfig.database?.pool?.idle || 10000
                    }
                },
                redis: {
                    host: process.env.REDIS_HOST || fileConfig.redis?.host || 'localhost',
                    port: parseInt(process.env.REDIS_PORT) || fileConfig.redis?.port || 6379,
                    password: process.env.REDIS_PASSWORD || fileConfig.redis?.password || '',
                    db: parseInt(process.env.REDIS_DB) || fileConfig.redis?.db || 0
                },
                playwright: {
                    headless: process.env.PLAYWRIGHT_HEADLESS === 'true' || 
                             fileConfig.playwright?.headless || false,
                    timeout: parseInt(process.env.PLAYWRIGHT_TIMEOUT) || 
                             fileConfig.playwright?.timeout || 30000,
                    viewport: {
                        width: parseInt(process.env.PLAYWRIGHT_VIEWPORT_WIDTH) || 
                               fileConfig.playwright?.viewport?.width || 1920,
                        height: parseInt(process.env.PLAYWRIGHT_VIEWPORT_HEIGHT) || 
                                fileConfig.playwright?.viewport?.height || 1080
                    },
                    userDataDir: process.env.PLAYWRIGHT_USER_DATA_DIR || 
                               fileConfig.playwright?.userDataDir || './browser-data',
                    downloadsPath: process.env.PLAYWRIGHT_DOWNLOADS_PATH || 
                                 fileConfig.playwright?.downloadsPath || './downloads'
                },
                xiaohongshu: {
                    baseUrl: process.env.XHS_BASE_URL || fileConfig.xiaohongshu?.baseUrl || 'https://www.xiaohongshu.com',
                    loginTimeout: parseInt(process.env.XHS_LOGIN_TIMEOUT) || 
                                 fileConfig.xiaohongshu?.loginTimeout || 60000,
                    maxRetries: parseInt(process.env.XHS_MAX_RETRIES) || 
                               fileConfig.xiaohongshu?.maxRetries || 3,
                    retryDelay: parseInt(process.env.XHS_RETRY_DELAY) || 
                               fileConfig.xiaohongshu?.retryDelay || 2000,
                    antiDetect: {
                        enabled: process.env.XHS_ANTI_DETECT_ENABLED !== 'false',
                        stealth: process.env.XHS_STEALTH_ENABLED !== 'false',
                        ghostCursor: process.env.XHS_GHOST_CURSOR_ENABLED !== 'false',
                        fingerprint: process.env.XHS_FINGERPRINT_ENABLED !== 'false'
                    }
                },
                logging: {
                    level: process.env.LOG_LEVEL || fileConfig.logging?.level || 'info',
                    file: process.env.LOG_FILE || fileConfig.logging?.file || './logs/app.log',
                    maxSize: process.env.LOG_MAX_SIZE || fileConfig.logging?.maxSize || '10m',
                    maxFiles: parseInt(process.env.LOG_MAX_FILES) || fileConfig.logging?.maxFiles || 5
                }
            };

            // 验证配置
            const { error } = this.schema.validate(this.config);
            if (error) {
                throw new Error(`配置验证失败: ${error.details[0].message}`);
            }

            return this.config;
        } catch (error) {
            throw new Error(`加载配置失败: ${error.message}`);
        }
    }

    get(key) {
        return key ? this.config[key] : this.config;
    }

    getDatabaseConfig() {
        return this.config.database;
    }

    getRedisConfig() {
        return this.config.redis;
    }

    getServerConfig() {
        return this.config.server;
    }

    getPlaywrightConfig() {
        return this.config.playwright;
    }

    getXiaohongshuConfig() {
        return this.config.xiaohongshu;
    }

    getLoggingConfig() {
        return this.config.logging;
    }
}