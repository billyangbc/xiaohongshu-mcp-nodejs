/**
 * 数据库管理器
 * 提供统一的数据库访问接口，支持MySQL连接池和查询封装
 */

const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

class DatabaseManager {
  constructor(config) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 3306,
      user: config.user || 'root',
      password: config.password || '',
      database: config.database || 'xiaohongshu_mcp',
      charset: 'utf8mb4',
      connectionLimit: config.connectionLimit || 10,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true,
      ...config
    };
    
    this.pool = null;
    this.isConnected = false;
  }

  /**
   * 初始化数据库连接池
   */
  async initialize() {
    try {
      this.pool = mysql.createPool(this.config);
      
      // 测试连接
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      
      this.isConnected = true;
      logger.info('数据库连接池初始化成功', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        connectionLimit: this.config.connectionLimit
      });
      
      return true;
    } catch (error) {
      logger.error('数据库连接失败', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 执行查询
   */
  async query(sql, params = []) {
    if (!this.isConnected) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();
    let connection;

    try {
      connection = await this.pool.getConnection();
      const [rows] = await connection.execute(sql, params);
      
      const duration = Date.now() - startTime;
      logger.debug('查询执行成功', {
        sql: sql.substring(0, 200),
        params,
        duration: `${duration}ms`,
        affectedRows: rows?.affectedRows || rows?.length
      });

      return rows;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('查询执行失败', {
        sql: sql.substring(0, 200),
        params,
        duration: `${duration}ms`,
        error: error.message
      });
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * 执行事务
   */
  async transaction(queries) {
    if (!this.isConnected) {
      throw new Error('数据库未连接');
    }

    const connection = await this.pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const results = [];
      for (const { sql, params } of queries) {
        const [result] = await connection.execute(sql, params);
        results.push(result);
      }
      
      await connection.commit();
      logger.info('事务执行成功', { queriesCount: queries.length });
      
      return results;
    } catch (error) {
      await connection.rollback();
      logger.error('事务执行失败', { error: error.message });
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 插入数据
   */
  async insert(table, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');
    
    const sql = `INSERT INTO \`${table}\` (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${placeholders})`;
    const result = await this.query(sql, values);
    
    return {
      id: result.insertId,
      affectedRows: result.affectedRows
    };
  }

  /**
   * 批量插入数据
   */
  async batchInsert(table, dataArray) {
    if (!dataArray || dataArray.length === 0) {
      return { affectedRows: 0, ids: [] };
    }

    const keys = Object.keys(dataArray[0]);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO \`${table}\` (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${placeholders})`;
    
    const values = dataArray.map(data => keys.map(key => data[key]));
    
    const connection = await this.pool.getConnection();
    try {
      const [result] = await connection.query(sql, [values]);
      
      const ids = [];
      for (let i = 0; i < result.affectedRows; i++) {
        ids.push(result.insertId + i);
      }
      
      return {
        affectedRows: result.affectedRows,
        ids
      };
    } finally {
      connection.release();
    }
  }

  /**
   * 更新数据
   */
  async update(table, data, where) {
    const setClause = Object.keys(data).map(key => `\`${key}\` = ?`).join(', ');
    const whereClause = Object.keys(where).map(key => `\`${key}\` = ?`).join(' AND ');
    
    const sql = `UPDATE \`${table}\` SET ${setClause} WHERE ${whereClause}`;
    const values = [...Object.values(data), ...Object.values(where)];
    
    const result = await this.query(sql, values);
    
    return {
      affectedRows: result.affectedRows,
      changedRows: result.changedRows
    };
  }

  /**
   * 删除数据
   */
  async delete(table, where) {
    const whereClause = Object.keys(where).map(key => `\`${key}\` = ?`).join(' AND ');
    const sql = `DELETE FROM \`${table}\` WHERE ${whereClause}`;
    
    const result = await this.query(sql, Object.values(where));
    
    return {
      affectedRows: result.affectedRows
    };
  }

  /**
   * 查询单条记录
   */
  async findOne(table, where) {
    const whereClause = Object.keys(where).map(key => `\`${key}\` = ?`).join(' AND ');
    const sql = `SELECT * FROM \`${table}\` WHERE ${whereClause} LIMIT 1`;
    
    const rows = await this.query(sql, Object.values(where));
    return rows[0] || null;
  }

  /**
   * 查询多条记录
   */
  async find(table, where = {}, options = {}) {
    let sql = `SELECT * FROM \`${table}\``;
    let values = [];

    if (Object.keys(where).length > 0) {
      const whereClause = Object.keys(where).map(key => `\`${key}\` = ?`).join(' AND ');
      sql += ` WHERE ${whereClause}`;
      values = Object.values(where);
    }

    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }

    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }

    if (options.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    return await this.query(sql, values);
  }

  /**
   * 分页查询
   */
  async paginate(table, where = {}, options = {}) {
    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 10;
    const offset = (page - 1) * limit;

    // 查询总数
    let countSql = `SELECT COUNT(*) as total FROM \`${table}\``;
    let countValues = [];

    if (Object.keys(where).length > 0) {
      const whereClause = Object.keys(where).map(key => `\`${key}\` = ?`).join(' AND ');
      countSql += ` WHERE ${whereClause}`;
      countValues = Object.values(where);
    }

    const [countResult] = await this.query(countSql, countValues);
    const total = countResult.total;

    // 查询数据
    let dataSql = `SELECT * FROM \`${table}\``;
    let dataValues = [];

    if (Object.keys(where).length > 0) {
      const whereClause = Object.keys(where).map(key => `\`${key}\` = ?`).join(' AND ');
      dataSql += ` WHERE ${whereClause}`;
      dataValues = Object.values(where);
    }

    if (options.orderBy) {
      dataSql += ` ORDER BY ${options.orderBy}`;
    }

    dataSql += ` LIMIT ? OFFSET ?`;
    dataValues.push(limit, offset);

    const data = await this.query(dataSql, dataValues);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * 执行原始SQL查询
   */
  async raw(sql, params = []) {
    return await this.query(sql, params);
  }

  /**
   * 获取数据库状态
   */
  async getStatus() {
    try {
      const [result] = await this.query('SELECT 1 as test');
      
      return {
        connected: true,
        pool: {
          totalConnections: this.pool.config.connectionLimit,
          idleConnections: this.pool._allConnections.length,
          activeConnections: this.pool._allConnections.length - this.pool._freeConnections.length
        },
        uptime: process.uptime()
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * 关闭数据库连接
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      logger.info('数据库连接已关闭');
    }
  }

  /**
   * 初始化数据库表结构
   */
  async initializeTables() {
    const tables = [
      // 账号管理表
      `CREATE TABLE IF NOT EXISTS idea_xiaohongshu_accounts (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL COMMENT '小红书用户名',
        phone VARCHAR(20) COMMENT '绑定手机号',
        email VARCHAR(100) COMMENT '绑定邮箱',
        nickname VARCHAR(100) COMMENT '昵称',
        avatar_url TEXT COMMENT '头像URL',
        proxy_id BIGINT COMMENT '关联代理ID',
        fingerprint_id BIGINT COMMENT '关联指纹ID',
        status ENUM('active', 'banned', 'suspended', 'login_required') DEFAULT 'active',
        login_status BOOLEAN DEFAULT FALSE COMMENT '登录状态',
        last_login_time DATETIME COMMENT '最后登录时间',
        cookies_encrypted TEXT COMMENT '加密存储的Cookies',
        user_agent TEXT COMMENT '用户代理字符串',
        session_data JSON COMMENT '会话数据',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_status (status)
      ) COMMENT='小红书账号管理表'`,

      // 代理IP管理表
      `CREATE TABLE IF NOT EXISTS idea_xiaohongshu_proxies (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        type ENUM('http', 'socks5') NOT NULL COMMENT '代理类型',
        host VARCHAR(255) NOT NULL COMMENT '代理服务器地址',
        port INT NOT NULL COMMENT '代理端口',
        username VARCHAR(100) COMMENT '代理用户名',
        password VARCHAR(255) COMMENT '代理密码',
        country VARCHAR(10) COMMENT '代理所在国家',
        region VARCHAR(50) COMMENT '代理所在地区',
        city VARCHAR(50) COMMENT '代理所在城市',
        isp VARCHAR(100) COMMENT 'ISP供应商',
        status ENUM('active', 'inactive', 'banned') DEFAULT 'active',
        success_rate DECIMAL(5,2) DEFAULT 100.00 COMMENT '成功率',
        avg_response_time INT DEFAULT 0 COMMENT '平均响应时间(ms)',
        last_checked DATETIME COMMENT '最后检查时间',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_country_city (country, city),
        INDEX idx_status (status)
      ) COMMENT='代理IP管理表'`,

      // 浏览器指纹表
      `CREATE TABLE IF NOT EXISTS idea_xiaohongshu_fingerprints (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        fingerprint_id VARCHAR(32) UNIQUE NOT NULL COMMENT '指纹唯一标识',
        user_agent TEXT NOT NULL COMMENT '用户代理字符串',
        viewport_width INT NOT NULL COMMENT '视口宽度',
        viewport_height INT NOT NULL COMMENT '视口高度',
        screen_width INT NOT NULL COMMENT '屏幕宽度',
        screen_height INT NOT NULL COMMENT '屏幕高度',
        device_memory INT COMMENT '设备内存GB',
        hardware_concurrency INT COMMENT 'CPU核心数',
        timezone VARCHAR(50) COMMENT '时区',
        language VARCHAR(10) COMMENT '语言',
        platform VARCHAR(20) COMMENT '平台',
        webgl_vendor VARCHAR(100) COMMENT 'WebGL厂商',
        webgl_renderer VARCHAR(200) COMMENT 'WebGL渲染器',
        canvas_fingerprint VARCHAR(64) COMMENT 'Canvas指纹',
        audio_fingerprint VARCHAR(64) COMMENT 'Audio指纹',
        fonts_list JSON COMMENT '字体列表',
        plugins_list JSON COMMENT '插件列表',
        webrtc_ip VARCHAR(45) COMMENT 'WebRTC本地IP',
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) COMMENT='浏览器指纹表'`,

      // 笔记/帖子表
      `CREATE TABLE IF NOT EXISTS idea_xiaohongshu_posts (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        account_id BIGINT NOT NULL COMMENT '发布账号ID',
        post_id VARCHAR(50) COMMENT '小红书笔记ID',
        title VARCHAR(200) NOT NULL COMMENT '笔记标题',
        content TEXT COMMENT '笔记内容',
        type ENUM('image', 'video', 'text') DEFAULT 'image' COMMENT '笔记类型',
        status ENUM('draft', 'published', 'failed', 'deleted') DEFAULT 'draft',
        images_data JSON COMMENT '图片信息',
        video_data JSON COMMENT '视频信息',
        tags JSON COMMENT '标签列表',
        topic VARCHAR(100) COMMENT '话题',
        scheduled_time DATETIME COMMENT '计划发布时间',
        published_time DATETIME COMMENT '实际发布时间',
        view_count INT DEFAULT 0 COMMENT '浏览量',
        like_count INT DEFAULT 0 COMMENT '点赞数',
        comment_count INT DEFAULT 0 COMMENT '评论数',
        collect_count INT DEFAULT 0 COMMENT '收藏数',
        share_count INT DEFAULT 0 COMMENT '分享数',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_account_id (account_id),
        INDEX idx_post_id (post_id),
        INDEX idx_status (status)
      ) COMMENT='笔记/帖子表'`,

      // 用户信息表
      `CREATE TABLE IF NOT EXISTS idea_xiaohongshu_users (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id VARCHAR(50) UNIQUE NOT NULL COMMENT '小红书用户ID',
        nickname VARCHAR(100) COMMENT '用户昵称',
        avatar_url TEXT COMMENT '头像URL',
        description TEXT COMMENT '个人简介',
        follower_count INT DEFAULT 0 COMMENT '粉丝数',
        following_count INT DEFAULT 0 COMMENT '关注数',
        post_count INT DEFAULT 0 COMMENT '笔记数',
        like_count INT DEFAULT 0 COMMENT '获赞数',
        is_verified BOOLEAN DEFAULT FALSE COMMENT '是否认证',
        verification_type VARCHAR(20) COMMENT '认证类型',
        location VARCHAR(100) COMMENT '所在地区',
        gender ENUM('male', 'female', 'unknown') DEFAULT 'unknown',
        age_range VARCHAR(20) COMMENT '年龄段',
        last_active DATETIME COMMENT '最后活跃时间',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_nickname (nickname)
      ) COMMENT='用户信息表'`,

      // 任务调度表
      `CREATE TABLE IF NOT EXISTS idea_xiaohongshu_tasks (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        task_type VARCHAR(50) NOT NULL COMMENT '任务类型',
        account_id BIGINT COMMENT '关联账号ID',
        task_data JSON COMMENT '任务数据',
        cron_expression VARCHAR(100) COMMENT 'Cron表达式',
        status ENUM('pending', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
        priority INT DEFAULT 1 COMMENT '优先级',
        retry_count INT DEFAULT 0 COMMENT '重试次数',
        max_retries INT DEFAULT 3 COMMENT '最大重试次数',
        scheduled_time DATETIME COMMENT '计划执行时间',
        started_time DATETIME COMMENT '开始执行时间',
        completed_time DATETIME COMMENT '完成时间',
        error_message TEXT COMMENT '错误信息',
        result_data JSON COMMENT '执行结果',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_task_type (task_type),
        INDEX idx_account_id (account_id),
        INDEX idx_status (status)
      ) COMMENT='任务调度表'`,

      // 数据分析表
      `CREATE TABLE IF NOT EXISTS idea_xiaohongshu_analytics (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        account_id BIGINT NOT NULL COMMENT '账号ID',
        date DATE NOT NULL COMMENT '统计日期',
        metric_type VARCHAR(50) NOT NULL COMMENT '指标类型',
        metric_value DECIMAL(15,2) DEFAULT 0 COMMENT '指标值',
        additional_data JSON COMMENT '附加数据',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_account_date_metric (account_id, date, metric_type),
        INDEX idx_account_id (account_id),
        INDEX idx_date (date)
      ) COMMENT='数据分析表'`
    ];

    for (const sql of tables) {
      await this.query(sql);
    }
    
    logger.info('数据库表结构初始化完成');
  }
}

module.exports = DatabaseManager;