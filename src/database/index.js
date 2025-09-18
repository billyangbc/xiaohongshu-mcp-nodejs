/**
 * 数据库连接池管理
 * MySQL数据库连接和查询封装
 */

import mysql from 'mysql2/promise';
import { logger } from '../utils/logger.js';
import { configManager } from '../config/config-manager.js';

/**
 * 数据库连接池配置
 */
const poolConfig = {
  host: configManager.get('DB_HOST', 'localhost'),
  port: configManager.get('DB_PORT', 3306),
  user: configManager.get('DB_USER', 'root'),
  password: configManager.get('DB_PASSWORD', ''),
  database: configManager.get('DB_NAME', 'xiaohongshu_mcp'),
  charset: 'utf8mb4',
  timezone: '+00:00',
  
  // 连接池配置
  connectionLimit: configManager.get('DB_CONNECTION_LIMIT', 10),
  acquireTimeout: configManager.get('DB_ACQUIRE_TIMEOUT', 60000),
  timeout: configManager.get('DB_TIMEOUT', 60000),
  reconnect: true,
  
  // 性能优化配置
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  
  // 调试配置
  debug: configManager.get('DB_DEBUG', false),
  trace: configManager.get('DB_TRACE', false)
};

/**
 * 数据库连接池
 */
class DatabasePool {
  constructor() {
    this.pool = null;
    this.isInitialized = false;
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      queuedQueries: 0,
      errorCount: 0
    };
  }
  
  /**
   * 初始化连接池
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    
    try {
      logger.info('正在初始化数据库连接池...', {
        host: poolConfig.host,
        port: poolConfig.port,
        database: poolConfig.database,
        connectionLimit: poolConfig.connectionLimit
      });
      
      this.pool = mysql.createPool(poolConfig);
      
      // 测试连接
      await this.testConnection();
      
      // 启动连接池监控
      this.startPoolMonitoring();
      
      this.isInitialized = true;
      logger.info('数据库连接池初始化成功');
    } catch (error) {
      logger.error('数据库连接池初始化失败:', error);
      throw error;
    }
  }
  
  /**
   * 测试数据库连接
   */
  async testConnection() {
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      logger.info('数据库连接测试成功');
    } catch (error) {
      logger.error('数据库连接测试失败:', error);
      throw error;
    }
  }
  
  /**
   * 启动连接池监控
   */
  startPoolMonitoring() {
    // 每30秒更新一次连接池统计信息
    setInterval(() => {
      this.updateConnectionStats();
    }, 30000);
    
    // 监听连接池事件
    this.pool.on('connection', (connection) => {
      logger.debug('新建数据库连接', {
        threadId: connection.threadId,
        connectionId: connection.connectionId
      });
    });
    
    this.pool.on('acquire', (connection) => {
      logger.debug('获取数据库连接', {
        threadId: connection.threadId,
        connectionId: connection.connectionId
      });
    });
    
    this.pool.on('release', (connection) => {
      logger.debug('释放数据库连接', {
        threadId: connection.threadId,
        connectionId: connection.connectionId
      });
    });
    
    this.pool.on('error', (error) => {
      logger.error('数据库连接池错误:', error);
      this.connectionStats.errorCount++;
    });
  }
  
  /**
   * 更新连接池统计信息
   */
  updateConnectionStats() {
    if (!this.pool) return;
    
    try {
      const stats = this.pool._allConnections.length;
      const active = this.pool._acquiringConnections.length;
      const idle = this.pool._freeConnections.length;
      const queued = this.pool._connectionQueue.length;
      
      this.connectionStats = {
        totalConnections: stats,
        activeConnections: active,
        idleConnections: idle,
        queuedQueries: queued,
        errorCount: this.connectionStats.errorCount
      };
      
      logger.debug('数据库连接池统计:', this.connectionStats);
    } catch (error) {
      logger.error('更新连接池统计失败:', error);
    }
  }
  
  /**
   * 执行查询
   * @param {string} sql - SQL语句
   * @param {Array} params - 参数数组
   * @returns {Promise} 查询结果
   */
  async query(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      logger.debug('执行数据库查询:', { sql, params });
      
      const [rows] = await this.pool.execute(sql, params);
      
      const duration = Date.now() - startTime;
      logger.debug(`查询完成 (${duration}ms):`, { 
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        affectedRows: rows.affectedRows,
        changedRows: rows.changedRows,
        insertId: rows.insertId
      });
      
      return rows;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`查询失败 (${duration}ms):`, { sql, params, error: error.message });
      
      // 特殊错误处理
      if (error.code === 'ER_NO_SUCH_TABLE') {
        throw new Error(`数据表不存在: ${error.sqlMessage}`);
      }
      
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error(`数据重复: ${error.sqlMessage}`);
      }
      
      if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        throw new Error(`外键约束错误: ${error.sqlMessage}`);
      }
      
      throw error;
    }
  }
  
  /**
   * 执行事务
   * @param {Function} callback - 事务回调函数
   * @returns {Promise} 事务结果
   */
  async transaction(callback) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const connection = await this.pool.getConnection();
    
    try {
      await connection.beginTransaction();
      logger.debug('开始数据库事务');
      
      const result = await callback(connection);
      
      await connection.commit();
      logger.debug('提交数据库事务');
      
      return result;
    } catch (error) {
      await connection.rollback();
      logger.error('回滚数据库事务:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
  
  /**
   * 批量插入
   * @param {string} table - 表名
   * @param {Array<Object>} data - 数据数组
   * @returns {Promise} 插入结果
   */
  async batchInsert(table, data) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('数据必须是包含对象的数组');
    }
    
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const keys = Object.keys(data[0]);
    const placeholders = keys.map(() => '?').join(',');
    const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;
    
    const values = data.map(item => keys.map(key => item[key]));
    
    try {
      logger.debug(`批量插入 ${data.length} 条记录到 ${table}`);
      
      const [result] = await this.pool.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES ?`, [values]);
      
      logger.debug(`批量插入完成: ${result.affectedRows} 条记录`);
      
      return result;
    } catch (error) {
      logger.error(`批量插入失败:`, error);
      throw error;
    }
  }
  
  /**
   * 获取连接池统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.connectionStats,
      isInitialized: this.isInitialized,
      config: {
        host: poolConfig.host,
        port: poolConfig.port,
        database: poolConfig.database,
        connectionLimit: poolConfig.connectionLimit
      }
    };
  }
  
  /**
   * 关闭连接池
   */
  async close() {
    if (this.pool) {
      try {
        await this.pool.end();
        logger.info('数据库连接池已关闭');
      } catch (error) {
        logger.error('关闭数据库连接池失败:', error);
        throw error;
      } finally {
        this.pool = null;
        this.isInitialized = false;
      }
    }
  }
}

// 创建全局连接池实例
const databasePool = new DatabasePool();

/**
 * 获取数据库连接池
 * @returns {DatabasePool} 连接池实例
 */
export function getDatabasePool() {
  return databasePool;
}

/**
 * 执行查询（快捷函数）
 * @param {string} sql - SQL语句
 * @param {Array} params - 参数数组
 * @returns {Promise} 查询结果
 */
export async function query(sql, params = []) {
  return databasePool.query(sql, params);
}

/**
 * 执行事务（快捷函数）
 * @param {Function} callback - 事务回调函数
 * @returns {Promise} 事务结果
 */
export async function transaction(callback) {
  return databasePool.transaction(callback);
}

/**
 * 初始化数据库
 */
export async function initializeDatabase() {
  await databasePool.initialize();
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase() {
  await databasePool.close();
}

// 导出连接池实例
export const pool = databasePool;