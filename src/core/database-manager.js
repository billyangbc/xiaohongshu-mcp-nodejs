/**
 * 数据库管理器
 * 
 * @description 管理数据库连接和模型，基于Sequelize的ORM实现
 * @author MCP团队
 * @since 2024-12-20
 */

import { Sequelize } from 'sequelize';
import { logger } from '../utils/logger.js';

export class DatabaseManager {
    constructor() {
        this.sequelize = null;
        this.models = {};
        this.isConnected = false;
    }

    async initialize(config) {
        try {
            logger.info('🔌 初始化数据库连接...');
            
            this.sequelize = new Sequelize(
                config.database,
                config.username,
                config.password,
                {
                    host: config.host,
                    port: config.port,
                    dialect: config.dialect,
                    pool: config.pool,
                    logging: process.env.NODE_ENV === 'development' ? logger.debug.bind(logger) : false,
                    define: {
                        timestamps: true,
                        underscored: true,
                        freezeTableName: true,
                        tableName: `idea_xiaohongshu_${this.constructor.name.toLowerCase()}`
                    }
                }
            );

            // 测试连接
            await this.sequelize.authenticate();
            
            // 初始化模型
            await this._initModels();
            
            // 同步数据库结构（仅在开发环境）
            if (process.env.NODE_ENV === 'development') {
                await this.sequelize.sync({ alter: true });
                logger.info('📊 数据库结构已同步');
            }
            
            this.isConnected = true;
            logger.info('✅ 数据库连接成功');
            
        } catch (error) {
            logger.error('❌ 数据库连接失败:', error);
            throw error;
        }
    }

    async _initModels() {
        // 账号模型
        this.models.Account = this.sequelize.define('Account', {
            id: {
                type: Sequelize.BIGINT,
                primaryKey: true,
                autoIncrement: true
            },
            username: {
                type: Sequelize.STRING(50),
                unique: true,
                allowNull: false
            },
            phone: Sequelize.STRING(20),
            email: Sequelize.STRING(100),
            nickname: Sequelize.STRING(100),
            avatar_url: Sequelize.TEXT,
            proxy_id: Sequelize.BIGINT,
            fingerprint_id: Sequelize.BIGINT,
            status: {
                type: Sequelize.ENUM('active', 'banned', 'suspended', 'login_required'),
                defaultValue: 'active'
            },
            login_status: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            last_login_time: Sequelize.DATE,
            cookies_encrypted: Sequelize.TEXT,
            user_agent: Sequelize.TEXT,
            session_data: Sequelize.JSON
        }, {
            tableName: 'idea_xiaohongshu_accounts'
        });

        // 代理模型
        this.models.Proxy = this.sequelize.define('Proxy', {
            id: {
                type: Sequelize.BIGINT,
                primaryKey: true,
                autoIncrement: true
            },
            type: {
                type: Sequelize.ENUM('http', 'socks5'),
                allowNull: false
            },
            host: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            port: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            username: Sequelize.STRING(100),
            password: Sequelize.STRING(255),
            country: Sequelize.STRING(10),
            region: Sequelize.STRING(50),
            city: Sequelize.STRING(50),
            isp: Sequelize.STRING(100),
            status: {
                type: Sequelize.ENUM('active', 'inactive', 'banned'),
                defaultValue: 'active'
            },
            success_rate: {
                type: Sequelize.DECIMAL(5, 2),
                defaultValue: 100.00
            },
            avg_response_time: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            last_checked: Sequelize.DATE
        }, {
            tableName: 'idea_xiaohongshu_proxies'
        });

        // 指纹模型
        this.models.Fingerprint = this.sequelize.define('Fingerprint', {
            id: {
                type: Sequelize.BIGINT,
                primaryKey: true,
                autoIncrement: true
            },
            fingerprint_id: {
                type: Sequelize.STRING(32),
                unique: true,
                allowNull: false
            },
            user_agent: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            viewport_width: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            viewport_height: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            screen_width: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            screen_height: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            device_memory: Sequelize.INTEGER,
            hardware_concurrency: Sequelize.INTEGER,
            timezone: Sequelize.STRING(50),
            language: Sequelize.STRING(10),
            platform: Sequelize.STRING(20),
            webgl_vendor: Sequelize.STRING(100),
            webgl_renderer: Sequelize.STRING(200),
            canvas_fingerprint: Sequelize.STRING(64),
            audio_fingerprint: Sequelize.STRING(64),
            fonts_list: Sequelize.JSON,
            plugins_list: Sequelize.JSON,
            webrtc_ip: Sequelize.STRING(45),
            status: {
                type: Sequelize.ENUM('active', 'inactive'),
                defaultValue: 'active'
            }
        }, {
            tableName: 'idea_xiaohongshu_fingerprints'
        });

        // 帖子模型
        this.models.Post = this.sequelize.define('Post', {
            id: {
                type: Sequelize.BIGINT,
                primaryKey: true,
                autoIncrement: true
            },
            account_id: {
                type: Sequelize.BIGINT,
                allowNull: false
            },
            post_id: Sequelize.STRING(50),
            title: {
                type: Sequelize.STRING(200),
                allowNull: false
            },
            content: Sequelize.TEXT,
            type: {
                type: Sequelize.ENUM('image', 'video', 'text'),
                defaultValue: 'image'
            },
            status: {
                type: Sequelize.ENUM('draft', 'published', 'failed', 'deleted'),
                defaultValue: 'draft'
            },
            images_data: Sequelize.JSON,
            video_data: Sequelize.JSON,
            tags: Sequelize.JSON,
            topic: Sequelize.STRING(100),
            scheduled_time: Sequelize.DATE,
            published_time: Sequelize.DATE,
            view_count: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            like_count: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            comment_count: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            collect_count: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            share_count: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            }
        }, {
            tableName: 'idea_xiaohongshu_posts'
        });

        // 用户模型
        this.models.User = this.sequelize.define('User', {
            id: {
                type: Sequelize.BIGINT,
                primaryKey: true,
                autoIncrement: true
            },
            user_id: {
                type: Sequelize.STRING(50),
                unique: true,
                allowNull: false
            },
            nickname: Sequelize.STRING(100),
            avatar_url: Sequelize.TEXT,
            description: Sequelize.TEXT,
            follower_count: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            following_count: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            post_count: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            like_count: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            is_verified: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            verification_type: Sequelize.STRING(20),
            location: Sequelize.STRING(100),
            gender: {
                type: Sequelize.ENUM('male', 'female', 'unknown'),
                defaultValue: 'unknown'
            },
            age_range: Sequelize.STRING(20),
            last_active: Sequelize.DATE
        }, {
            tableName: 'idea_xiaohongshu_users'
        });

        // 任务模型
        this.models.Task = this.sequelize.define('Task', {
            id: {
                type: Sequelize.BIGINT,
                primaryKey: true,
                autoIncrement: true
            },
            task_type: {
                type: Sequelize.STRING(50),
                allowNull: false
            },
            account_id: Sequelize.BIGINT,
            task_data: Sequelize.JSON,
            cron_expression: Sequelize.STRING(100),
            status: {
                type: Sequelize.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
                defaultValue: 'pending'
            },
            priority: {
                type: Sequelize.INTEGER,
                defaultValue: 1
            },
            retry_count: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            max_retries: {
                type: Sequelize.INTEGER,
                defaultValue: 3
            },
            scheduled_time: Sequelize.DATE,
            started_time: Sequelize.DATE,
            completed_time: Sequelize.DATE,
            error_message: Sequelize.TEXT,
            result_data: Sequelize.JSON
        }, {
            tableName: 'idea_xiaohongshu_tasks'
        });

        // 建立关联关系
        this._setupAssociations();
    }

    _setupAssociations() {
        // Account 关联
        this.models.Account.hasMany(this.models.Post, { foreignKey: 'account_id' });
        this.models.Post.belongsTo(this.models.Account, { foreignKey: 'account_id' });

        this.models.Account.hasMany(this.models.Task, { foreignKey: 'account_id' });
        this.models.Task.belongsTo(this.models.Account, { foreignKey: 'account_id' });
    }

    async close() {
        if (this.sequelize) {
            await this.sequelize.close();
            this.isConnected = false;
            logger.info('🔌 数据库连接已关闭');
        }
    }

    getModel(name) {
        return this.models[name];
    }

    getSequelize() {
        return this.sequelize;
    }
}