/**
 * MCP协议处理器
 * 实现小红书MCP协议的各种功能
 */

import { MCPProtocol, MCP_ERROR_CODES } from './protocol.js';
import { logger } from '../utils/logger.js';
import { AccountManager } from '../services/account-manager.js';
import { PostManager } from '../services/post-manager.js';
import { SearchManager } from '../services/search-manager.js';
import { RecommendationManager } from '../services/recommendation-manager.js';

/**
 * MCP处理器类
 */
export class MCPHandlers extends MCPProtocol {
  constructor() {
    super();
    
    // 初始化服务管理器
    this.accountManager = new AccountManager();
    this.postManager = new PostManager();
    this.searchManager = new SearchManager();
    this.recommendationManager = new RecommendationManager();
    
    // 注册请求处理器
    this.registerRequestHandlers();
    
    // 注册通知处理器
    this.registerNotificationHandlers();
    
    // 添加中间件
    this.registerMiddlewares();
    
    logger.info('MCP处理器初始化完成');
  }
  
  /**
   * 注册请求处理器
   */
  registerRequestHandlers() {
    // 账号管理相关
    this.registerRequestHandler('xiaohongshu.account.list', this.handleAccountList.bind(this));
    this.registerRequestHandler('xiaohongshu.account.add', this.handleAccountAdd.bind(this));
    this.registerRequestHandler('xiaohongshu.account.remove', this.handleAccountRemove.bind(this));
    this.registerRequestHandler('xiaohongshu.account.login', this.handleAccountLogin.bind(this));
    this.registerRequestHandler('xiaohongshu.account.logout', this.handleAccountLogout.bind(this));
    this.registerRequestHandler('xiaohongshu.account.status', this.handleAccountStatus.bind(this));
    
    // 内容发布相关
    this.registerRequestHandler('xiaohongshu.post.create', this.handlePostCreate.bind(this));
    this.registerRequestHandler('xiaohongshu.post.publish', this.handlePostPublish.bind(this));
    
    // 搜索相关
    this.registerRequestHandler('xiaohongshu.search', this.handleSearch.bind(this));
    
    // 推荐相关
    this.registerRequestHandler('xiaohongshu.recommend', this.handleRecommend.bind(this));
    
    logger.debug('请求处理器注册完成');
  }
  
  /**
   * 注册通知处理器
   */
  registerNotificationHandlers() {
    // 账号状态变更通知
    this.registerNotificationHandler('xiaohongshu.account.status_changed', this.handleAccountStatusChanged.bind(this));
    
    // 内容发布状态通知
    this.registerNotificationHandler('xiaohongshu.post.status_changed', this.handlePostStatusChanged.bind(this));
    
    logger.debug('通知处理器注册完成');
  }
  
  /**
   * 注册中间件
   */
  registerMiddlewares() {
    // 请求日志中间件
    this.use(async (context) => {
      const { request } = context;
      logger.info(`MCP请求: ${request.method}`, {
        id: request.id,
        params: request.params
      });
    });
    
    // 响应时间监控中间件
    this.use(async (context, next) => {
      const startTime = Date.now();
      await next();
      const duration = Date.now() - startTime;
      
      logger.debug(`MCP请求耗时: ${duration}ms`, {
        method: context.request.method,
        id: context.request.id
      });
    });
    
    logger.debug('中间件注册完成');
  }
  
  /**
   * 处理账号列表请求
   * @param {Object} params - 请求参数
   * @returns {Promise<Object>} 响应数据
   */
  async handleAccountList(params) {
    logger.debug('处理账号列表请求:', params);
    
    try {
      const result = await this.accountManager.getAccountList(params);
      return {
        success: true,
        data: result.data,
        pagination: result.pagination
      };
    } catch (error) {
      logger.error('获取账号列表失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理添加账号请求
   * @param {Object} params - 请求参数
   * @returns {Promise<Object>} 响应数据
   */
  async handleAccountAdd(params) {
    logger.debug('处理添加账号请求:', params);
    
    try {
      const result = await this.accountManager.addAccount(params);
      return {
        success: true,
        data: result,
        message: '账号添加成功'
      };
    } catch (error) {
      logger.error('添加账号失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理删除账号请求
   * @param {Object} params - 请求参数
   * @returns {Promise<Object>} 响应数据
   */
  async handleAccountRemove(params) {
    logger.debug('处理删除账号请求:', params);
    
    try {
      const { accountId } = params;
      
      if (!accountId) {
        throw new Error('缺少必要参数: accountId');
      }
      
      const result = await this.accountManager.removeAccount(accountId);
      return {
        success: true,
        data: result,
        message: '账号删除成功'
      };
    } catch (error) {
      logger.error('删除账号失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理账号登录请求
   * @param {Object} params - 请求参数
   * @returns {Promise<Object>} 响应数据
   */
  async handleAccountLogin(params) {
    logger.debug('处理账号登录请求:', params);
    
    try {
      const { username, password, verificationCode, proxyId, fingerprintId } = params;
      
      if (!username || !password) {
        throw new Error('缺少必要参数: username 或 password');
      }
      
      const result = await this.accountManager.loginAccount({
        username,
        password,
        verificationCode,
        proxyId,
        fingerprintId
      });
      
      return {
        success: true,
        data: result,
        message: '登录成功'
      };
    } catch (error) {
      logger.error('账号登录失败:', error);
      
      // 特殊错误处理
      if (error.message.includes('验证码')) {
        throw new Error('需要验证码，请提供verificationCode参数');
      }
      
      if (error.message.includes('密码错误')) {
        throw new Error('用户名或密码错误');
      }
      
      if (error.message.includes('账号被封')) {
        throw new Error('该账号已被封禁');
      }
      
      throw error;
    }
  }
  
  /**
   * 处理账号登出请求
   * @param {Object} params - 请求参数
   * @returns {Promise<Object>} 响应数据
   */
  async handleAccountLogout(params) {
    logger.debug('处理账号登出请求:', params);
    
    try {
      const { accountId } = params;
      
      if (!accountId) {
        throw new Error('缺少必要参数: accountId');
      }
      
      const result = await this.accountManager.logoutAccount(accountId);
      return {
        success: true,
        data: result,
        message: '登出成功'
      };
    } catch (error) {
      logger.error('账号登出失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理账号状态检测请求
   * @param {Object} params - 请求参数
   * @returns {Promise<Object>} 响应数据
   */
  async handleAccountStatus(params) {
    logger.debug('处理账号状态检测请求:', params);
    
    try {
      const { accountId } = params;
      
      if (!accountId) {
        throw new Error('缺少必要参数: accountId');
      }
      
      const result = await this.accountManager.checkAccountStatus(accountId);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.error('检测账号状态失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理创建笔记请求
   * @param {Object} params - 请求参数
   * @returns {Promise<Object>} 响应数据
   */
  async handlePostCreate(params) {
    logger.debug('处理创建笔记请求:', params);
    
    try {
      const { accountId, title, content, type, images, video, tags, topic, scheduledTime } = params;
      
      if (!accountId || !title) {
        throw new Error('缺少必要参数: accountId 或 title');
      }
      
      // 验证账号状态
      const accountStatus = await this.accountManager.checkAccountStatus(accountId);
      if (!accountStatus.isLoggedIn) {
        throw new Error('账号未登录，请先登录');
      }
      
      const result = await this.postManager.createPost({
        accountId,
        title,
        content,
        type,
        images,
        video,
        tags,
        topic,
        scheduledTime
      });
      
      return {
        success: true,
        data: result,
        message: '笔记创建成功'
      };
    } catch (error) {
      logger.error('创建笔记失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理发布笔记请求
   * @param {Object} params - 请求参数
   * @returns {Promise<Object>} 响应数据
   */
  async handlePostPublish(params) {
    logger.debug('处理发布笔记请求:', params);
    
    try {
      const { postId } = params;
      
      if (!postId) {
        throw new Error('缺少必要参数: postId');
      }
      
      const result = await this.postManager.publishPost(postId);
      return {
        success: true,
        data: result,
        message: '笔记发布成功'
      };
    } catch (error) {
      logger.error('发布笔记失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理搜索请求
   * @param {Object} params - 请求参数
   * @returns {Promise<Object>} 响应数据
   */
  async handleSearch(params) {
    logger.debug('处理搜索请求:', params);
    
    try {
      const { keyword, type, page, pageSize, sort } = params;
      
      if (!keyword) {
        throw new Error('缺少必要参数: keyword');
      }
      
      const result = await this.searchManager.search({
        keyword,
        type,
        page,
        pageSize,
        sort
      });
      
      return {
        success: true,
        data: result.data,
        pagination: result.pagination
      };
    } catch (error) {
      logger.error('搜索失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理推荐请求
   * @param {Object} params - 请求参数
   * @returns {Promise<Object>} 响应数据
   */
  async handleRecommend(params) {
    logger.debug('处理推荐请求:', params);
    
    try {
      const { accountId, category, page, pageSize } = params;
      
      const result = await this.recommendationManager.getRecommendations({
        accountId,
        category,
        page,
        pageSize
      });
      
      return {
        success: true,
        data: result.data,
        pagination: result.pagination
      };
    } catch (error) {
      logger.error('获取推荐失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理账号状态变更通知
   * @param {Object} params - 通知参数
   */
  async handleAccountStatusChanged(params) {
    logger.debug('处理账号状态变更通知:', params);
    
    try {
      const { accountId, status, reason } = params;
      
      // 更新账号状态
      await this.accountManager.updateAccountStatus(accountId, status, reason);
      
      logger.info(`账号状态变更: ${accountId} -> ${status}`, { reason });
    } catch (error) {
      logger.error('处理账号状态变更通知失败:', error);
    }
  }
  
  /**
   * 处理内容发布状态变更通知
   * @param {Object} params - 通知参数
   */
  async handlePostStatusChanged(params) {
    logger.debug('处理内容发布状态变更通知:', params);
    
    try {
      const { postId, status, reason } = params;
      
      // 更新发布状态
      await this.postManager.updatePostStatus(postId, status, reason);
      
      logger.info(`发布状态变更: ${postId} -> ${status}`, { reason });
    } catch (error) {
      logger.error('处理内容发布状态变更通知失败:', error);
    }
  }
  
  /**
   * 获取支持的MCP方法列表
   * @returns {Array} 方法列表
   */
  getSupportedMethods() {
    return [
      // 账号管理
      'xiaohongshu.account.list',
      'xiaohongshu.account.add',
      'xiaohongshu.account.remove',
      'xiaohongshu.account.login',
      'xiaohongshu.account.logout',
      'xiaohongshu.account.status',
      
      // 内容发布
      'xiaohongshu.post.create',
      'xiaohongshu.post.publish',
      
      // 搜索
      'xiaohongshu.search',
      
      // 推荐
      'xiaohongshu.recommend'
    ];
  }
  
  /**
   * 获取处理器统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      requestHandlers: this.requestHandlers.size,
      notificationHandlers: this.notificationHandlers.size,
      middlewares: this.middlewares.length,
      supportedMethods: this.getSupportedMethods()
    };
  }
}

// 创建全局MCP处理器实例
const mcpHandlers = new MCPHandlers();

/**
 * 获取MCP处理器实例
 * @returns {MCPHandlers} MCP处理器实例
 */
export function getMCPHandlers() {
  return mcpHandlers;
}

/**
 * 初始化MCP处理器
 * @returns {Promise<void>}
 */
export async function initializeMCPHandlers() {
  logger.info('初始化MCP处理器...');
  // MCP处理器在构造函数中已初始化
  logger.info('MCP处理器初始化完成');
}