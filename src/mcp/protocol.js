/**
 * MCP协议实现
 * Model Context Protocol - JSON-RPC 2.0 标准实现
 */

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
  ACCOUNT_LOGIN_FAILED: -32002,
  POST_NOT_FOUND: -32003,
  PROXY_ERROR: -32004,
  FINGERPRINT_ERROR: -32005,
  BROWSER_ERROR: -32006,
  NETWORK_ERROR: -32007,
  VALIDATION_ERROR: -32008,
  RATE_LIMIT_ERROR: -32009,
  CAPTCHA_REQUIRED: -32010,
  
  // 成功状态码
  SUCCESS: 0
};

/**
 * MCP错误信息映射
 */
export const MCP_ERROR_MESSAGES = {
  [MCP_ERROR_CODES.PARSE_ERROR]: '解析错误',
  [MCP_ERROR_CODES.INVALID_REQUEST]: '无效请求',
  [MCP_ERROR_CODES.METHOD_NOT_FOUND]: '方法不存在',
  [MCP_ERROR_CODES.INVALID_PARAMS]: '参数错误',
  [MCP_ERROR_CODES.INTERNAL_ERROR]: '内部错误',
  [MCP_ERROR_CODES.ACCOUNT_NOT_FOUND]: '账号不存在',
  [MCP_ERROR_CODES.ACCOUNT_LOGIN_FAILED]: '账号登录失败',
  [MCP_ERROR_CODES.POST_NOT_FOUND]: '笔记不存在',
  [MCP_ERROR_CODES.PROXY_ERROR]: '代理错误',
  [MCP_ERROR_CODES.FINGERPRINT_ERROR]: '指纹错误',
  [MCP_ERROR_CODES.BROWSER_ERROR]: '浏览器错误',
  [MCP_ERROR_CODES.NETWORK_ERROR]: '网络错误',
  [MCP_ERROR_CODES.VALIDATION_ERROR]: '验证错误',
  [MCP_ERROR_CODES.RATE_LIMIT_ERROR]: '频率限制',
  [MCP_ERROR_CODES.CAPTCHA_REQUIRED]: '需要验证码',
  [MCP_ERROR_CODES.SUCCESS]: '成功'
};

/**
 * MCP请求格式
 */
export class MCPRequest {
  constructor(method, params = {}, id = null) {
    this.jsonrpc = '2.0';
    this.method = method;
    this.params = params;
    this.id = id || this.generateId();
  }
  
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  toJSON() {
    return JSON.stringify({
      jsonrpc: this.jsonrpc,
      method: this.method,
      params: this.params,
      id: this.id
    });
  }
}

/**
 * MCP响应格式
 */
export class MCPResponse {
  constructor(id, result = null, error = null) {
    this.jsonrpc = '2.0';
    this.id = id;
    this.result = result;
    this.error = error;
  }
  
  static success(id, result) {
    return new MCPResponse(id, result);
  }
  
  static error(id, code, message, data = null) {
    return new MCPResponse(id, null, {
      code,
      message: message || MCP_ERROR_MESSAGES[code] || '未知错误',
      data
    });
  }
  
  toJSON() {
    return JSON.stringify({
      jsonrpc: this.jsonrpc,
      id: this.id,
      result: this.result,
      error: this.error
    });
  }
}

/**
 * MCP通知格式（无需响应）
 */
export class MCPNotification {
  constructor(method, params = {}) {
    this.jsonrpc = '2.0';
    this.method = method;
    this.params = params;
  }
  
  toJSON() {
    return JSON.stringify({
      jsonrpc: this.jsonrpc,
      method: this.method,
      params: this.params
    });
  }
}

/**
 * 参数验证模式
 */
export const MCPParamsSchema = {
  // 账号管理相关
  accountList: {
    parse: (params) => {
      const { status = 'all', limit = 20, offset = 0 } = params || {};
      
      if (!['all', 'active', 'banned', 'suspended', 'login_required'].includes(status)) {
        throw new Error('无效的状态参数');
      }
      
      if (limit < 1 || limit > 100) {
        throw new Error('limit参数必须在1-100之间');
      }
      
      if (offset < 0) {
        throw new Error('offset参数不能为负数');
      }
      
      return { status, limit, offset };
    }
  },
  
  accountAdd: {
    parse: (params) => {
      const { username, phone, email, proxy_id, fingerprint_id } = params || {};
      
      if (!username || typeof username !== 'string' || username.length < 3) {
        throw new Error('用户名不能为空且至少3个字符');
      }
      
      if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
        throw new Error('手机号格式不正确');
      }
      
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('邮箱格式不正确');
      }
      
      if (proxy_id && (typeof proxy_id !== 'number' || proxy_id < 1)) {
        throw new Error('代理ID必须是正整数');
      }
      
      if (fingerprint_id && (typeof fingerprint_id !== 'number' || fingerprint_id < 1)) {
        throw new Error('指纹ID必须是正整数');
      }
      
      return { username, phone, email, proxy_id, fingerprint_id };
    }
  },
  
  accountLogin: {
    parse: (params) => {
      const { account_id, password, verification_code } = params || {};
      
      if (!account_id || typeof account_id !== 'number' || account_id < 1) {
        throw new Error('账号ID必须是正整数');
      }
      
      if (!password || typeof password !== 'string' || password.length < 6) {
        throw new Error('密码不能为空且至少6个字符');
      }
      
      if (verification_code && (typeof verification_code !== 'string' || verification_code.length !== 6)) {
        throw new Error('验证码必须是6位字符串');
      }
      
      return { account_id, password, verification_code };
    }
  },
  
  // 内容发布相关
  postCreate: {
    parse: (params) => {
      const { account_id, title, content, type = 'image', images, video, tags, topic, scheduled_time } = params || {};
      
      if (!account_id || typeof account_id !== 'number' || account_id < 1) {
        throw new Error('账号ID必须是正整数');
      }
      
      if (!title || typeof title !== 'string' || title.length < 1 || title.length > 200) {
        throw new Error('标题不能为空且不能超过200个字符');
      }
      
      if (content && typeof content !== 'string') {
        throw new Error('内容必须是字符串');
      }
      
      if (!['image', 'video', 'text'].includes(type)) {
        throw new Error('笔记类型必须是image、video或text');
      }
      
      if (images && !Array.isArray(images)) {
        throw new Error('图片必须是数组');
      }
      
      if (video && typeof video !== 'object') {
        throw new Error('视频信息必须是对象');
      }
      
      if (tags && !Array.isArray(tags)) {
        throw new Error('标签必须是数组');
      }
      
      if (topic && typeof topic !== 'string') {
        throw new Error('话题必须是字符串');
      }
      
      if (scheduled_time && !Date.parse(scheduled_time)) {
        throw new Error('计划发布时间格式不正确');
      }
      
      return { account_id, title, content, type, images, video, tags, topic, scheduled_time };
    }
  },
  
  // 搜索相关
  search: {
    parse: (params) => {
      const { keyword, type = 'all', account_id, limit = 20, offset = 0, sort = 'relevance' } = params || {};
      
      if (!keyword || typeof keyword !== 'string' || keyword.length < 1) {
        throw new Error('搜索关键词不能为空');
      }
      
      if (!['all', 'user', 'post', 'topic'].includes(type)) {
        throw new Error('搜索类型必须是all、user、post或topic');
      }
      
      if (account_id && (typeof account_id !== 'number' || account_id < 1)) {
        throw new Error('账号ID必须是正整数');
      }
      
      if (limit < 1 || limit > 100) {
        throw new Error('limit参数必须在1-100之间');
      }
      
      if (offset < 0) {
        throw new Error('offset参数不能为负数');
      }
      
      if (!['relevance', 'latest', 'hot'].includes(sort)) {
        throw new Error('排序方式必须是relevance、latest或hot');
      }
      
      return { keyword, type, account_id, limit, offset, sort };
    }
  },
  
  // 用户信息相关
  userInfo: {
    parse: (params) => {
      const { user_id } = params || {};
      
      if (!user_id || typeof user_id !== 'string' || user_id.length < 1) {
        throw new Error('用户ID不能为空');
      }
      
      return { user_id };
    }
  },
  
  // 评论相关
  commentAdd: {
    parse: (params) => {
      const { post_id, content, parent_comment_id } = params || {};
      
      if (!post_id || typeof post_id !== 'string' || post_id.length < 1) {
        throw new Error('笔记ID不能为空');
      }
      
      if (!content || typeof content !== 'string' || content.length < 1 || content.length > 500) {
        throw new Error('评论内容不能为空且不能超过500个字符');
      }
      
      if (parent_comment_id && (typeof parent_comment_id !== 'string' || parent_comment_id.length < 1)) {
        throw new Error('父评论ID必须是字符串');
      }
      
      return { post_id, content, parent_comment_id };
    }
  },
  
  commentList: {
    parse: (params) => {
      const { post_id, limit = 20, offset = 0 } = params || {};
      
      if (!post_id || typeof post_id !== 'string' || post_id.length < 1) {
        throw new Error('笔记ID不能为空');
      }
      
      if (limit < 1 || limit > 100) {
        throw new Error('limit参数必须在1-100之间');
      }
      
      if (offset < 0) {
        throw new Error('offset参数不能为负数');
      }
      
      return { post_id, limit, offset };
    }
  }
};

/**
 * MCP协议处理器
 */
export class MCPProtocol {
  constructor() {
    this.handlers = new Map();
  }
  
  /**
   * 注册处理器
   * @param {string} method - 方法名
   * @param {Function} handler - 处理器函数
   */
  registerHandler(method, handler) {
    this.handlers.set(method, handler);
  }
  
  /**
   * 处理MCP请求
   * @param {string} requestData - 请求数据
   * @returns {Promise<MCPResponse>} 响应对象
   */
  async handleRequest(requestData) {
    let request;
    
    try {
      request = JSON.parse(requestData);
    } catch (error) {
      return MCPResponse.error(null, MCP_ERROR_CODES.PARSE_ERROR, 'JSON解析错误');
    }
    
    // 验证请求格式
    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      return MCPResponse.error(request.id, MCP_ERROR_CODES.INVALID_REQUEST, '无效的JSON-RPC版本');
    }
    
    if (!request.method || typeof request.method !== 'string') {
      return MCPResponse.error(request.id, MCP_ERROR_CODES.INVALID_REQUEST, '缺少方法名');
    }
    
    // 获取处理器
    const handler = this.handlers.get(request.method);
    if (!handler) {
      return MCPResponse.error(request.id, MCP_ERROR_CODES.METHOD_NOT_FOUND, `方法 ${request.method} 不存在`);
    }
    
    try {
      // 执行处理器
      const result = await handler(request.params);
      return MCPResponse.success(request.id, result);
    } catch (error) {
      console.error(`MCP处理器错误 [${request.method}]:`, error);
      
      // 如果是已知的MCP错误
      if (error.code && MCP_ERROR_MESSAGES[error.code]) {
        return MCPResponse.error(request.id, error.code, error.message, error.data);
      }
      
      // 默认内部错误
      return MCPResponse.error(
        request.id, 
        MCP_ERROR_CODES.INTERNAL_ERROR, 
        '服务器内部错误',
        process.env.NODE_ENV === 'development' ? error.message : null
      );
    }
  }
  
  /**
   * 获取支持的方法列表
   * @returns {Array<string>} 方法列表
   */
  getSupportedMethods() {
    return Array.from(this.handlers.keys());
  }
}

/**
 * 创建MCP协议实例
 * @param {Object} handlers - 处理器映射
 * @returns {MCPProtocol} MCP协议实例
 */
export function createMCPProtocol(handlers = {}) {
  const protocol = new MCPProtocol();
  
  // 注册所有处理器
  Object.entries(handlers).forEach(([method, handler]) => {
    protocol.registerHandler(method, handler);
  });
  
  return protocol;
}