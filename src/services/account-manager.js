/**
 * 账号管理服务
 * 管理小红书账号的登录、状态检测、信息维护等功能
 */

import { logger } from '../utils/logger.js';
import { query, transaction } from '../database/index.js';
import { BrowserManager } from '../browser/browser-manager.js';
import { ProxyManager } from '../proxy/proxy-manager.js';
import { FingerprintManager } from '../fingerprint/fingerprint-manager.js';
import { encrypt, decrypt } from '../utils/crypto.js';

/**
 * 账号管理器类
 */
export class AccountManager {
  constructor() {
    this.browserManager = new BrowserManager();
    this.proxyManager = new ProxyManager();
    this.fingerprintManager = new FingerprintManager();
    this.loginSessions = new Map(); // 登录会话缓存
  }
  
  /**
   * 获取账号列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 账号列表
   */
  async getAccountList(params = {}) {
    const { page = 1, pageSize = 20, status, search } = params;
    const offset = (page - 1) * pageSize;
    
    try {
      // 构建查询条件
      let whereConditions = [];
      let queryParams = [];
      
      if (status) {
        whereConditions.push('status = ?');
        queryParams.push(status);
      }
      
      if (search) {
        whereConditions.push('(username LIKE ? OR nickname LIKE ? OR phone LIKE ?)');
        queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      
      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      
      // 查询总数
      const countQuery = `
        SELECT COUNT(*) as total
        FROM idea_xiaohongshu_accounts
        ${whereClause}
      `;
      
      const [countResult] = await query(countQuery, queryParams);
      const total = countResult.total;
      
      // 查询列表
      const listQuery = `
        SELECT 
          a.*,
          p.host as proxy_host,
          p.port as proxy_port,
          p.country as proxy_country,
          f.fingerprint_id,
          f.user_agent
        FROM idea_xiaohongshu_accounts a
        LEFT JOIN idea_xiaohongshu_proxies p ON a.proxy_id = p.id
        LEFT JOIN idea_xiaohongshu_fingerprints f ON a.fingerprint_id = f.id
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
      `;
      
      queryParams.push(pageSize, offset);
      const accounts = await query(listQuery, queryParams);
      
      // 处理敏感信息
      const processedAccounts = accounts.map(account => ({
        id: account.id,
        username: account.username,
        phone: account.phone ? this.maskPhone(account.phone) : null,
        email: account.email ? this.maskEmail(account.email) : null,
        nickname: account.nickname,
        avatarUrl: account.avatar_url,
        status: account.status,
        loginStatus: account.login_status,
        lastLoginTime: account.last_login_time,
        proxy: account.proxy_host ? {
          host: account.proxy_host,
          port: account.proxy_port,
          country: account.proxy_country
        } : null,
        fingerprint: account.fingerprint_id ? {
          id: account.fingerprint_id,
          userAgent: account.user_agent
        } : null,
        createdAt: account.created_at,
        updatedAt: account.updated_at
      }));
      
      return {
        data: processedAccounts,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      };
    } catch (error) {
      logger.error('获取账号列表失败:', error);
      throw new Error('获取账号列表失败: ' + error.message);
    }
  }
  
  /**
   * 添加账号
   * @param {Object} accountData - 账号数据
   * @returns {Promise<Object>} 添加结果
   */
  async addAccount(accountData) {
    const { username, phone, email, nickname, proxyId, fingerprintId } = accountData;
    
    try {
      // 检查用户名是否已存在
      const existingAccount = await query(
        'SELECT id FROM idea_xiaohongshu_accounts WHERE username = ?',
        [username]
      );
      
      if (existingAccount.length > 0) {
        throw new Error('用户名已存在');
      }
      
      // 验证代理和指纹是否存在
      if (proxyId) {
        const proxy = await query(
          'SELECT id FROM idea_xiaohongshu_proxies WHERE id = ? AND status = "active"',
          [proxyId]
        );
        
        if (proxy.length === 0) {
          throw new Error('代理不存在或不可用');
        }
      }
      
      if (fingerprintId) {
        const fingerprint = await query(
          'SELECT id FROM idea_xiaohongshu_fingerprints WHERE id = ? AND status = "active"',
          [fingerprintId]
        );
        
        if (fingerprint.length === 0) {
          throw new Error('指纹不存在或不可用');
        }
      }
      
      // 插入新账号
      const result = await query(
        `INSERT INTO idea_xiaohongshu_accounts 
         (username, phone, email, nickname, proxy_id, fingerprint_id, status, login_status) 
         VALUES (?, ?, ?, ?, ?, ?, 'active', false)`,
        [username, phone, email, nickname, proxyId, fingerprintId]
      );
      
      const accountId = result.insertId;
      
      logger.info(`添加账号成功: ${username} (ID: ${accountId})`);
      
      return {
        id: accountId,
        username,
        status: 'active',
        loginStatus: false,
        createdAt: new Date()
      };
    } catch (error) {
      logger.error('添加账号失败:', error);
      throw error;
    }
  }
  
  /**
   * 删除账号
   * @param {number} accountId - 账号ID
   * @returns {Promise<Object>} 删除结果
   */
  async removeAccount(accountId) {
    try {
      // 检查账号是否存在
      const account = await query(
        'SELECT id, username FROM idea_xiaohongshu_accounts WHERE id = ?',
        [accountId]
      );
      
      if (account.length === 0) {
        throw new Error('账号不存在');
      }
      
      const username = account[0].username;
      
      // 如果账号已登录，先登出
      if (this.loginSessions.has(accountId)) {
        await this.logoutAccount(accountId);
      }
      
      // 删除账号
      await query('DELETE FROM idea_xiaohongshu_accounts WHERE id = ?', [accountId]);
      
      logger.info(`删除账号成功: ${username} (ID: ${accountId})`);
      
      return {
        id: accountId,
        username,
        deleted: true
      };
    } catch (error) {
      logger.error('删除账号失败:', error);
      throw error;
    }
  }
  
  /**
   * 登录账号
   * @param {Object} loginData - 登录数据
   * @returns {Promise<Object>} 登录结果
   */
  async loginAccount(loginData) {
    const { username, password, verificationCode, proxyId, fingerprintId } = loginData;
    
    try {
      // 获取账号信息
      const account = await query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE username = ?',
        [username]
      );
      
      if (account.length === 0) {
        throw new Error('账号不存在');
      }
      
      const accountData = account[0];
      const accountId = accountData.id;
      
      // 检查是否已登录
      if (this.loginSessions.has(accountId)) {
        const session = this.loginSessions.get(accountId);
        if (session.isValid()) {
          return {
            success: true,
            accountId,
            message: '账号已登录'
          };
        } else {
          // 会话过期，移除旧会话
          this.loginSessions.delete(accountId);
        }
      }
      
      // 获取代理配置
      let proxyConfig = null;
      if (proxyId || accountData.proxy_id) {
        const proxyManager = new ProxyManager();
        proxyConfig = await proxyManager.getProxy(proxyId || accountData.proxy_id);
      }
      
      // 获取指纹配置
      let fingerprintConfig = null;
      if (fingerprintId || accountData.fingerprint_id) {
        const fingerprintManager = new FingerprintManager();
        fingerprintConfig = await fingerprintManager.getFingerprint(fingerprintId || accountData.fingerprint_id);
      }
      
      // 使用浏览器进行登录
      const browserManager = new BrowserManager();
      const loginResult = await browserManager.loginXiaohongshu({
        username,
        password,
        verificationCode,
        proxy: proxyConfig,
        fingerprint: fingerprintConfig
      });
      
      if (loginResult.success) {
        // 更新账号状态
        await query(
          `UPDATE idea_xiaohongshu_accounts 
           SET login_status = true, last_login_time = NOW(), cookies_encrypted = ?, user_agent = ?
           WHERE id = ?`,
          [encrypt(JSON.stringify(loginResult.cookies)), loginResult.userAgent, accountId]
        );
        
        // 保存登录会话
        this.loginSessions.set(accountId, new LoginSession({
          accountId,
          username,
          cookies: loginResult.cookies,
          userAgent: loginResult.userAgent,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24小时
        }));
        
        logger.info(`账号登录成功: ${username} (ID: ${accountId})`);
        
        return {
          success: true,
          accountId,
          message: '登录成功'
        };
      } else {
        throw new Error(loginResult.error || '登录失败');
      }
    } catch (error) {
      logger.error('账号登录失败:', error);
      
      if (error.message.includes('验证码')) {
        throw new Error('需要验证码，请检查手机或邮箱');
      }
      
      if (error.message.includes('密码错误')) {
        throw new Error('用户名或密码错误');
      }
      
      if (error.message.includes('账号被封')) {
        // 更新账号状态
        await query(
          'UPDATE idea_xiaohongshu_accounts SET status = "banned" WHERE username = ?',
          [username]
        );
        throw new Error('该账号已被封禁');
      }
      
      throw error;
    }
  }
  
  /**
   * 登出账号
   * @param {number} accountId - 账号ID
   * @returns {Promise<Object>} 登出结果
   */
  async logoutAccount(accountId) {
    try {
      // 检查账号是否存在
      const account = await query(
        'SELECT id, username FROM idea_xiaohongshu_accounts WHERE id = ?',
        [accountId]
      );
      
      if (account.length === 0) {
        throw new Error('账号不存在');
      }
      
      const username = account[0].username;
      
      // 移除登录会话
      if (this.loginSessions.has(accountId)) {
        const session = this.loginSessions.get(accountId);
        
        // 使用浏览器登出
        if (session.cookies) {
          try {
            const browserManager = new BrowserManager();
            await browserManager.logoutXiaohongshu(session.cookies);
          } catch (error) {
            logger.warn('浏览器登出失败:', error);
          }
        }
        
        this.loginSessions.delete(accountId);
      }
      
      // 更新账号状态
      await query(
        'UPDATE idea_xiaohongshu_accounts SET login_status = false WHERE id = ?',
        [accountId]
      );
      
      logger.info(`账号登出成功: ${username} (ID: ${accountId})`);
      
      return {
        success: true,
        accountId,
        message: '登出成功'
      };
    } catch (error) {
      logger.error('账号登出失败:', error);
      throw error;
    }
  }
  
  /**
   * 检测账号状态
   * @param {number} accountId - 账号ID
   * @returns {Promise<Object>} 状态信息
   */
  async checkAccountStatus(accountId) {
    try {
      // 获取账号信息
      const account = await query(
        'SELECT * FROM idea_xiaohongshu_accounts WHERE id = ?',
        [accountId]
      );
      
      if (account.length === 0) {
        throw new Error('账号不存在');
      }
      
      const accountData = account[0];
      
      // 检查登录会话
      let isLoggedIn = false;
      let sessionInfo = null;
      
      if (this.loginSessions.has(accountId)) {
        const session = this.loginSessions.get(accountId);
        if (session.isValid()) {
          isLoggedIn = true;
          sessionInfo = {
            loginTime: session.loginTime,
            expiresAt: session.expiresAt
          };
        } else {
          // 会话过期，移除旧会话
          this.loginSessions.delete(accountId);
          
          // 更新数据库状态
          await query(
            'UPDATE idea_xiaohongshu_accounts SET login_status = false WHERE id = ?',
            [accountId]
          );
        }
      }
      
      // 如果数据库显示已登录但会话不存在，更新数据库
      if (accountData.login_status && !isLoggedIn) {
        await query(
          'UPDATE idea_xiaohongshu_accounts SET login_status = false WHERE id = ?',
          [accountId]
        );
      }
      
      return {
        accountId,
        username: accountData.username,
        status: accountData.status,
        isLoggedIn,
        lastLoginTime: accountData.last_login_time,
        sessionInfo,
        proxy: accountData.proxy_id ? {
          id: accountData.proxy_id
        } : null,
        fingerprint: accountData.fingerprint_id ? {
          id: accountData.fingerprint_id
        } : null
      };
    } catch (error) {
      logger.error('检测账号状态失败:', error);
      throw error;
    }
  }
  
  /**
   * 更新账号状态
   * @param {number} accountId - 账号ID
   * @param {string} status - 状态
   * @param {string} reason - 原因
   */
  async updateAccountStatus(accountId, status, reason = '') {
    try {
      await query(
        'UPDATE idea_xiaohongshu_accounts SET status = ? WHERE id = ?',
        [status, accountId]
      );
      
      logger.info(`更新账号状态: ${accountId} -> ${status}`, { reason });
    } catch (error) {
      logger.error('更新账号状态失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取登录会话
   * @param {number} accountId - 账号ID
   * @returns {Object} 会话信息
   */
  getLoginSession(accountId) {
    return this.loginSessions.get(accountId);
  }
  
  /**
   * 手机号脱敏
   * @param {string} phone - 手机号
   * @returns {string} 脱敏后的手机号
   */
  maskPhone(phone) {
    if (!phone || phone.length < 7) {
      return phone;
    }
    return phone.substring(0, 3) + '****' + phone.substring(7);
  }
  
  /**
   * 邮箱脱敏
   * @param {string} email - 邮箱
   * @returns {string} 脱敏后的邮箱
   */
  maskEmail(email) {
    if (!email || !email.includes('@')) {
      return email;
    }
    
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 3) {
      return localPart + '@' + domain;
    }
    
    return localPart.substring(0, 3) + '***@' + domain;
  }
}

/**
 * 登录会话类
 */
class LoginSession {
  constructor({ accountId, username, cookies, userAgent, expiresAt }) {
    this.accountId = accountId;
    this.username = username;
    this.cookies = cookies;
    this.userAgent = userAgent;
    this.loginTime = Date.now();
    this.expiresAt = expiresAt;
  }
  
  /**
   * 检查会话是否有效
   * @returns {boolean} 是否有效
   */
  isValid() {
    return Date.now() < this.expiresAt;
  }
  
  /**
   * 刷新会话
   */
  refresh() {
    this.expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 延长24小时
  }
}