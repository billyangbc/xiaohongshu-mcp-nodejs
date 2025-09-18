/**
 * MCP协议实现
 * JSON-RPC 2.0 标准协议支持
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

/**
 * MCP错误码定义
 */
export const MCP_ERROR_CODES = {
  // 标准JSON-RPC错误码
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  
  // MCP自定义错误码
  ACCOUNT_NOT_FOUND: -32001,
  ACCOUNT_NOT_LOGIN: -32002,
  POST_NOT_FOUND: -32003,
  PROXY_UNAVAILABLE: -32004,
  FINGERPRINT_INVALID: -32005,
  RATE_LIMIT_EXCEEDED: -32006,
  CAPTCHA_REQUIRED: -32007,
  BROWSER_ERROR: -32008,
  NETWORK_ERROR: -32009,
  VALIDATION_ERROR: -32010,
  
  // 系统错误码
  SYSTEM_MAINTENANCE: -32050,
  SERVICE_UNAVAILABLE: -32051,
  DATABASE_ERROR: -32052,
  CACHE_ERROR: -32053,
  
  // 用户操作错误码
  INVALID_CREDENTIALS: -32100,
  INSUFFICIENT_PERMISSIONS: -32101,
  OPERATION_NOT_ALLOWED: -32102,
  RESOURCE_CONFLICT: -32103
};

/**
 * MCP错误信息映射
 */
export const MCP_ERROR_MESSAGES = {
  [MCP_ERROR_CODES.PARSE_ERROR]: '解析错误',
  [MCP_ERROR_CODES.INVALID_REQUEST]: '无效请求',
  [MCP_ERROR_CODES.METHOD_NOT_FOUND]: '方法未找到',
  [MCP_ERROR_CODES.INVALID_PARAMS]: '无效参数',
  [MCP_ERROR_CODES.INTERNAL_ERROR]: '内部错误',
  
  [MCP_ERROR_CODES.ACCOUNT_NOT_FOUND]: '账号不存在',
  [MCP_ERROR_CODES.ACCOUNT_NOT_LOGIN]: '账号未登录',
  [MCP_ERROR_CODES.POST_NOT_FOUND]: '笔记不存在',
  [MCP_ERROR_CODES.PROXY_UNAVAILABLE]: '代理不可用',
  [MCP_ERROR_CODES.FINGERPRINT_INVALID]: '指纹无效',
  [MCP_ERROR_CODES.RATE_LIMIT_EXCEEDED]: '请求频率超限',
  [MCP_ERROR_CODES.CAPTCHA_REQUIRED]: '需要验证码',
  [MCP_ERROR_CODES.BROWSER_ERROR]: '浏览器错误',
  [MCP_ERROR_CODES.NETWORK_ERROR]: '网络错误',
  [MCP_ERROR_CODES.VALIDATION_ERROR]: '验证错误',
  
  [MCP_ERROR_CODES.SYSTEM_MAINTENANCE]: '系统维护中',
  [MCP_ERROR_CODES.SERVICE_UNAVAILABLE]: '服务不可用',
  [MCP_ERROR_CODES.DATABASE_ERROR]: '数据库错误',
  [MCP_ERROR_CODES.CACHE_ERROR]: '缓存错误',
  
  [MCP_ERROR_CODES.INVALID_CREDENTIALS]: '无效凭证',
  [MCP_ERROR_CODES.INSUFFICIENT_PERMISSIONS]: '权限不足',
  [MCP_ERROR_CODES.OPERATION_NOT_ALLOWED]: '操作不允许',
  [MCP_ERROR_CODES.RESOURCE_CONFLICT]: '资源冲突'
};

/**
 * MCP参数验证模式
 */
export const MCPParamsSchema = {
  // 账号管理相关
  accountLogin: {
    type: 'object',
    properties: {
      username: { type: 'string', minLength: 1 },
      password: { type: 'string', minLength: 1 },
      verificationCode: { type: 'string', optional: true },
      proxyId: { type: 'number', optional: true },
      fingerprintId: { type: 'number', optional: true }
    },
    required: ['username', 'password']
  },
  
  accountList: {
    type: 'object',
    properties: {
      page: { type: 'number', minimum: 1, default: 1 },
      pageSize: { type: 'number', minimum: 1, maximum: 100, default: 20 },
      status: { type: 'string', enum: ['active', 'banned', 'suspended', 'login_required'], optional: true },
      search: { type: 'string', optional: true }
    }
  },
  
  accountAdd: {
    type: 'object',
    properties: {
      username: { type: 'string', minLength: 1 },
      phone: { type: 'string', pattern: '^1[3-9]\\d{9}$', optional: true },
      email: { type: 'string', format: 'email', optional: true },
      nickname: { type: 'string', optional: true },
      proxyId: { type: 'number', optional: true },
      fingerprintId: { type: 'number', optional: true }
    },
    required: ['username']
  },
  
  // 内容发布相关
  postCreate: {
    type: 'object',
    properties: {
      accountId: { type: 'number', minimum: 1 },
      title: { type: 'string', minLength: 1, maxLength: 200 },
      content: { type: 'string', optional: true },
      type: { type: 'string', enum: ['image', 'video', 'text'], default: 'image' },
      images: { 
        type: 'array', 
        items: { type: 'string' },
        minItems: 1,
        maxItems: 9,
        optional: true 
      },
      video: { type: 'string', optional: true },
      tags: { 
        type: 'array', 
        items: { type: 'string' },
        maxItems: 10,
        optional: true 
      },
      topic: { type: 'string', maxLength: 100, optional: true },
      scheduledTime: { type: 'string', format: 'date-time', optional: true }
    },
    required: ['accountId', 'title']
  },
  
  postPublish: {
    type: 'object',
    properties: {
      postId: { type: 'number', minimum: 1 }
    },
    required: ['postId']
  },
  
  // 搜索相关
  search: {
    type: 'object',
    properties: {
      keyword: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['note', 'user', 'topic'], default: 'note' },
      page: { type: 'number', minimum: 1, default: 1 },
      pageSize: { type: 'number', minimum: 1, maximum: 50, default: 20 },
      sort: { type: 'string', enum: ['general', 'latest', 'hot'], default: 'general' }
    },
    required: ['keyword']
  },
  
  // 推荐相关
  recommend: {
    type: 'object',
    properties: {
      accountId: { type: 'number', minimum: 1, optional: true },
      category: { type: 'string', optional: true },
      page: { type: 'number', minimum: 1, default: 1 },
      pageSize: { type: 'number', minimum: 1, maximum: 50, default: 20 }
    }
  }
};

/**
 * MCP协议基类
 */
export class MCPProtocol {
  constructor() {
    this.requestHandlers = new Map();
    this.notificationHandlers = new Map();
    this.middlewares = [];
  }
  
  /**
   * 注册请求处理器
   * @param {string} method - 方法名
   * @param {Function} handler - 处理器函数
   */
  registerRequestHandler(method, handler) {
    this.requestHandlers.set(method, handler);
    logger.debug(`注册请求处理器: ${method}`);
  }
  
  /**
   * 注册通知处理器
   * @param {string} method - 方法名
   * @param {Function} handler - 处理器函数
   */
  registerNotificationHandler(method, handler) {
    this.notificationHandlers.set(method, handler);
    logger.debug(`注册通知处理器: ${method}`);
  }
  
  /**
   * 添加中间件
   * @param {Function} middleware - 中间件函数
   */
  use(middleware) {
    this.middlewares.push(middleware);
  }
  
  /**
   * 处理请求
   * @param {Object} request - 请求对象
   * @returns {Promise<Object>} 响应对象
   */
  async handleRequest(request) {
    const requestId = request.id || uuidv4();
    const startTime = Date.now();
    
    try {
      logger.debug('处理MCP请求:', { method: request.method, params: request.params });
      
      // 验证请求格式
      const validationResult = this.validateRequest(request);
      if (!validationResult.valid) {
        return this.createErrorResponse(requestId, MCP_ERROR_CODES.INVALID_REQUEST, validationResult.error);
      }
      
      // 执行中间件
      const context = { request, startTime };
      for (const middleware of this.middlewares) {
        await middleware(context);
      }
      
      // 查找处理器
      const handler = this.requestHandlers.get(request.method);
      if (!handler) {
        return this.createErrorResponse(requestId, MCP_ERROR_CODES.METHOD_NOT_FOUND, `方法未找到: ${request.method}`);
      }
      
      // 验证参数
      if (request.params) {
        const schema = MCPParamsSchema[request.method.replace('.', '_')];
        if (schema) {
          const validation = this.validateParams(request.params, schema);
          if (!validation.valid) {
            return this.createErrorResponse(requestId, MCP_ERROR_CODES.INVALID_PARAMS, validation.error);
          }
        }
      }
      
      // 执行处理器
      const result = await handler(request.params, context);
      
      const duration = Date.now() - startTime;
      logger.debug(`MCP请求处理完成 (${duration}ms):`, { method: request.method, result });
      
      return this.createSuccessResponse(requestId, result);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`MCP请求处理失败 (${duration}ms):`, { method: request.method, error: error.message });
      
      // 根据错误类型返回相应错误码
      let errorCode = MCP_ERROR_CODES.INTERNAL_ERROR;
      let errorMessage = error.message;
      
      if (error.code === 'ER_NO_SUCH_TABLE') {
        errorCode = MCP_ERROR_CODES.DATABASE_ERROR;
        errorMessage = '数据库错误: ' + error.message;
      } else if (error.code === 'ER_DUP_ENTRY') {
        errorCode = MCP_ERROR_CODES.RESOURCE_CONFLICT;
        errorMessage = '资源冲突: ' + error.message;
      } else if (error.message.includes('账号')) {
        errorCode = MCP_ERROR_CODES.ACCOUNT_NOT_FOUND;
      } else if (error.message.includes('登录')) {
        errorCode = MCP_ERROR_CODES.ACCOUNT_NOT_LOGIN;
      } else if (error.message.includes('代理')) {
        errorCode = MCP_ERROR_CODES.PROXY_UNAVAILABLE;
      } else if (error.message.includes('指纹')) {
        errorCode = MCP_ERROR_CODES.FINGERPRINT_INVALID;
      } else if (error.message.includes('频率')) {
        errorCode = MCP_ERROR_CODES.RATE_LIMIT_EXCEEDED;
      } else if (error.message.includes('验证码')) {
        errorCode = MCP_ERROR_CODES.CAPTCHA_REQUIRED;
      } else if (error.message.includes('浏览器')) {
        errorCode = MCP_ERROR_CODES.BROWSER_ERROR;
      } else if (error.message.includes('网络')) {
        errorCode = MCP_ERROR_CODES.NETWORK_ERROR;
      }
      
      return this.createErrorResponse(requestId, errorCode, errorMessage);
    }
  }
  
  /**
   * 处理通知
   * @param {Object} notification - 通知对象
   */
  async handleNotification(notification) {
    const startTime = Date.now();
    
    try {
      logger.debug('处理MCP通知:', { method: notification.method, params: notification.params });
      
      // 验证通知格式
      const validationResult = this.validateNotification(notification);
      if (!validationResult.valid) {
        logger.error('无效的通知格式:', validationResult.error);
        return;
      }
      
      // 查找处理器
      const handler = this.notificationHandlers.get(notification.method);
      if (!handler) {
        logger.warn(`未找到通知处理器: ${notification.method}`);
        return;
      }
      
      // 执行处理器
      await handler(notification.params);
      
      const duration = Date.now() - startTime;
      logger.debug(`MCP通知处理完成 (${duration}ms):`, { method: notification.method });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`MCP通知处理失败 (${duration}ms):`, { method: notification.method, error: error.message });
    }
  }
  
  /**
   * 验证请求格式
   * @param {Object} request - 请求对象
   * @returns {Object} 验证结果
   */
  validateRequest(request) {
    if (!request || typeof request !== 'object') {
      return { valid: false, error: '请求必须是对象' };
    }
    
    if (!request.method || typeof request.method !== 'string') {
      return { valid: false, error: '请求必须包含method字段' };
    }
    
    if (request.params && typeof request.params !== 'object') {
      return { valid: false, error: 'params必须是对象' };
    }
    
    if (request.id && (typeof request.id !== 'string' && typeof request.id !== 'number')) {
      return { valid: false, error: 'id必须是字符串或数字' };
    }
    
    return { valid: true };
  }
  
  /**
   * 验证通知格式
   * @param {Object} notification - 通知对象
   * @returns {Object} 验证结果
   */
  validateNotification(notification) {
    if (!notification || typeof notification !== 'object') {
      return { valid: false, error: '通知必须是对象' };
    }
    
    if (!notification.method || typeof notification.method !== 'string') {
      return { valid: false, error: '通知必须包含method字段' };
    }
    
    if (notification.params && typeof notification.params !== 'object') {
      return { valid: false, error: 'params必须是对象' };
    }
    
    return { valid: true };
  }
  
  /**
   * 验证参数
   * @param {Object} params - 参数对象
   * @param {Object} schema - 验证模式
   * @returns {Object} 验证结果
   */
  validateParams(params, schema) {
    // 简化的参数验证实现
    if (schema.required) {
      for (const field of schema.required) {
        if (params[field] === undefined || params[field] === null) {
          return { valid: false, error: `缺少必要参数: ${field}` };
        }
      }
    }
    
    if (schema.properties) {
      for (const [field, fieldSchema] of Object.entries(schema.properties)) {
        const value = params[field];
        
        if (value !== undefined && value !== null) {
          // 类型检查
          if (fieldSchema.type && typeof value !== fieldSchema.type) {
            return { valid: false, error: `参数 ${field} 类型错误，期望 ${fieldSchema.type}` };
          }
          
          // 字符串长度检查
          if (fieldSchema.minLength && typeof value === 'string' && value.length < fieldSchema.minLength) {
            return { valid: false, error: `参数 ${field} 长度不能少于 ${fieldSchema.minLength}` };
          }
          
          if (fieldSchema.maxLength && typeof value === 'string' && value.length > fieldSchema.maxLength) {
            return { valid: false, error: `参数 ${field} 长度不能超过 ${fieldSchema.maxLength}` };
          }
          
          // 数字范围检查
          if (fieldSchema.minimum && typeof value === 'number' && value < fieldSchema.minimum) {
            return { valid: false, error: `参数 ${field} 不能小于 ${fieldSchema.minimum}` };
          }
          
          if (fieldSchema.maximum && typeof value === 'number' && value > fieldSchema.maximum) {
            return { valid: false, error: `参数 ${field} 不能大于 ${fieldSchema.maximum}` };
          }
          
          // 枚举检查
          if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
            return { valid: false, error: `参数 ${field} 必须是以下值之一: ${fieldSchema.enum.join(', ')}` };
          }
        }
      }
    }
    
    return { valid: true };
  }
  
  /**
   * 创建成功响应
   * @param {string} id - 请求ID
   * @param {*} result - 结果数据
   * @returns {Object} 响应对象
   */
  createSuccessResponse(id, result) {
    return {
      jsonrpc: '2.0',
      id: id,
      result: result
    };
  }
  
  /**
   * 创建错误响应
   * @param {string} id - 请求ID
   * @param {number} code - 错误码
   * @param {string} message - 错误信息
   * @param {*} data - 附加数据
   * @returns {Object} 响应对象
   */
  createErrorResponse(id, code, message, data = null) {
    const error = {
      code: code,
      message: message || MCP_ERROR_MESSAGES[code] || '未知错误'
    };
    
    if (data !== null) {
      error.data = data;
    }
    
    return {
      jsonrpc: '2.0',
      id: id,
      error: error
    };
  }
  
  /**
   * 解析请求
   * @param {string} data - 请求数据
   * @returns {Object} 解析结果
   */
  parseRequest(data) {
    try {
      if (typeof data === 'string') {
        return JSON.parse(data);
      }
      return data;
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: MCP_ERROR_CODES.PARSE_ERROR,
          message: '解析错误: ' + error.message
        }
      };
    }
  }
  
  /**
   * 序列化响应
   * @param {Object} response - 响应对象
   * @returns {string} JSON字符串
   */
  serializeResponse(response) {
    return JSON.stringify(response);
  }
}