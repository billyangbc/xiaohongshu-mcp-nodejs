/**
 * HTTP客户端工具模块
 * 提供HTTP请求封装和代理支持
 */

import axios from 'axios';
import { logger } from './logger.js';

/**
 * HTTP客户端配置
 */
class HttpClientConfig {
  constructor() {
    this.timeout = 30000; // 30秒
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1秒
    this.retryMultiplier = 2;
    this.maxRedirects = 5;
    this.validateStatus = (status) => status >= 200 && status < 300;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.enableLogging = true;
    this.enableRetry = true;
    this.enableProxy = false;
    this.proxy = null;
    this.headers = {};
  }
}

/**
 * HTTP客户端类
 */
export class HttpClient {
  constructor(config = new HttpClientConfig()) {
    this.config = config;
    this.axiosInstance = null;
    this.interceptors = {
      request: [],
      response: []
    };
    this.retryCount = new Map(); // 用于跟踪每个请求的重试次数
    
    this._initializeAxios();
    this._setupInterceptors();
  }
  
  /**
   * 初始化Axios实例
   * @private
   */
  _initializeAxios() {
    const axiosConfig = {
      timeout: this.config.timeout,
      maxRedirects: this.config.maxRedirects,
      validateStatus: this.config.validateStatus,
      headers: {
        'User-Agent': this.config.userAgent,
        ...this.config.headers
      }
    };
    
    // 配置代理
    if (this.config.enableProxy && this.config.proxy) {
      axiosConfig.proxy = this.config.proxy;
    }
    
    this.axiosInstance = axios.create(axiosConfig);
  }
  
  /**
   * 设置拦截器
   * @private
   */
  _setupInterceptors() {
    // 请求拦截器
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // 执行自定义请求拦截器
        this.interceptors.request.forEach(interceptor => {
          config = interceptor(config);
        });
        
        if (this.config.enableLogging) {
          logger.debug('HTTP请求', {
            method: config.method?.toUpperCase(),
            url: config.url,
            headers: config.headers,
            data: config.data,
            timeout: config.timeout
          });
        }
        
        return config;
      },
      (error) => {
        if (this.config.enableLogging) {
          logger.error('HTTP请求拦截器错误', error);
        }
        return Promise.reject(error);
      }
    );
    
    // 响应拦截器
    this.axiosInstance.interceptors.response.use(
      (response) => {
        if (this.config.enableLogging) {
          logger.debug('HTTP响应', {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.data,
            url: response.config.url
          });
        }
        
        // 执行自定义响应拦截器
        this.interceptors.response.forEach(interceptor => {
          response = interceptor(response);
        });
        
        return response;
      },
      (error) => {
        if (this.config.enableLogging) {
          logger.error('HTTP响应错误', {
            message: error.message,
            code: error.code,
            config: error.config,
            response: error.response?.data
          });
        }
        
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * 生成请求ID
   * @private
   * @returns {string} 请求ID
   */
  _generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 计算重试延迟
   * @private
   * @param {number} attempt - 尝试次数
   * @returns {number} 延迟时间（毫秒）
   */
  _calculateRetryDelay(attempt) {
    return this.config.retryDelay * Math.pow(this.config.retryMultiplier, attempt - 1);
  }
  
  /**
   * 是否应该重试
   * @private
   * @param {Error} error - 错误对象
   * @param {number} attempt - 尝试次数
   * @returns {boolean} 是否应该重试
   */
  _shouldRetry(error, attempt) {
    if (!this.config.enableRetry || attempt >= this.config.maxRetries) {
      return false;
    }
    
    // 可重试的错误类型
    const retryableErrors = [
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EPIPE',
      'EHOSTUNREACH',
      'EAI_AGAIN'
    ];
    
    // 可重试的HTTP状态码
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    
    // 检查错误代码
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }
    
    // 检查HTTP状态码
    if (error.response && retryableStatusCodes.includes(error.response.status)) {
      return true;
    }
    
    // 网络错误
    if (error.message && error.message.toLowerCase().includes('network')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 执行重试逻辑
   * @private
   * @param {Function} requestFunc - 请求函数
   * @param {number} attempt - 尝试次数
   * @param {string} requestId - 请求ID
   * @returns {Promise} 响应结果
   */
  async _executeWithRetry(requestFunc, attempt = 0, requestId = null) {
    const id = requestId || this._generateRequestId();
    
    try {
      return await requestFunc();
    } catch (error) {
      if (this._shouldRetry(error, attempt)) {
        const delay = this._calculateRetryDelay(attempt + 1);
        
        if (this.config.enableLogging) {
          logger.warn(`请求重试 ${attempt + 1}/${this.config.maxRetries}`, {
            requestId: id,
            error: error.message,
            retryDelay: delay
          });
        }
        
        await this._sleep(delay);
        return this._executeWithRetry(requestFunc, attempt + 1, id);
      }
      
      throw error;
    }
  }
  
  /**
   * 睡眠函数
   * @private
   * @param {number} ms - 毫秒数
   * @returns {Promise} Promise
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * GET请求
   * @param {string} url - URL
   * @param {Object} config - 配置
   * @returns {Promise} 响应结果
   */
  async get(url, config = {}) {
    const requestFunc = () => this.axiosInstance.get(url, config);
    return this._executeWithRetry(requestFunc);
  }
  
  /**
   * POST请求
   * @param {string} url - URL
   * @param {*} data - 请求数据
   * @param {Object} config - 配置
   * @returns {Promise} 响应结果
   */
  async post(url, data, config = {}) {
    const requestFunc = () => this.axiosInstance.post(url, data, config);
    return this._executeWithRetry(requestFunc);
  }
  
  /**
   * PUT请求
   * @param {string} url - URL
   * @param {*} data - 请求数据
   * @param {Object} config - 配置
   * @returns {Promise} 响应结果
   */
  async put(url, data, config = {}) {
    const requestFunc = () => this.axiosInstance.put(url, data, config);
    return this._executeWithRetry(requestFunc);
  }
  
  /**
   * DELETE请求
   * @param {string} url - URL
   * @param {Object} config - 配置
   * @returns {Promise} 响应结果
   */
  async delete(url, config = {}) {
    const requestFunc = () => this.axiosInstance.delete(url, config);
    return this._executeWithRetry(requestFunc);
  }
  
  /**
   * PATCH请求
   * @param {string} url - URL
   * @param {*} data - 请求数据
   * @param {Object} config - 配置
   * @returns {Promise} 响应结果
   */
  async patch(url, data, config = {}) {
    const requestFunc = () => this.axiosInstance.patch(url, data, config);
    return this._executeWithRetry(requestFunc);
  }
  
  /**
   * HEAD请求
   * @param {string} url - URL
   * @param {Object} config - 配置
   * @returns {Promise} 响应结果
   */
  async head(url, config = {}) {
    const requestFunc = () => this.axiosInstance.head(url, config);
    return this._executeWithRetry(requestFunc);
  }
  
  /**
   * OPTIONS请求
   * @param {string} url - URL
   * @param {Object} config - 配置
   * @returns {Promise} 响应结果
   */
  async options(url, config = {}) {
    const requestFunc = () => this.axiosInstance.options(url, config);
    return this._executeWithRetry(requestFunc);
  }
  
  /**
   * 下载文件
   * @param {string} url - 文件URL
   * @param {string} filePath - 保存路径
   * @param {Object} config - 配置
   * @returns {Promise} 响应结果
   */
  async download(url, filePath, config = {}) {
    const response = await this.get(url, {
      ...config,
      responseType: 'stream'
    });
    
    const fs = await import('fs');
    const writer = fs.createWriteStream(filePath);
    
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }
  
  /**
   * 上传文件
   * @param {string} url - 上传URL
   * @param {string|Buffer|Stream} file - 文件
   * @param {Object} config - 配置
   * @returns {Promise} 响应结果
   */
  async upload(url, file, config = {}) {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    
    if (typeof file === 'string') {
      // 文件路径
      const fs = await import('fs');
      formData.append('file', fs.createReadStream(file));
    } else {
      // Buffer或Stream
      formData.append('file', file);
    }
    
    return this.post(url, formData, {
      ...config,
      headers: {
        ...formData.getHeaders(),
        ...config.headers
      }
    });
  }
  
  /**
   * 添加请求拦截器
   * @param {Function} interceptor - 拦截器函数
   */
  addRequestInterceptor(interceptor) {
    this.interceptors.request.push(interceptor);
  }
  
  /**
   * 添加响应拦截器
   * @param {Function} interceptor - 拦截器函数
   */
  addResponseInterceptor(interceptor) {
    this.interceptors.response.push(interceptor);
  }
  
  /**
   * 设置代理
   * @param {Object} proxy - 代理配置
   */
  setProxy(proxy) {
    this.config.proxy = proxy;
    this.config.enableProxy = true;
    
    // 重新初始化Axios实例
    this._initializeAxios();
    this._setupInterceptors();
  }
  
  /**
   * 清除代理
   */
  clearProxy() {
    this.config.proxy = null;
    this.config.enableProxy = false;
    
    // 重新初始化Axios实例
    this._initializeAxios();
    this._setupInterceptors();
  }
  
  /**
   * 设置请求头
   * @param {Object} headers - 请求头
   */
  setHeaders(headers) {
    this.config.headers = { ...this.config.headers, ...headers };
    
    // 重新初始化Axios实例
    this._initializeAxios();
    this._setupInterceptors();
  }
  
  /**
   * 获取当前配置
   * @returns {HttpClientConfig} 配置对象
   */
  getConfig() {
    return { ...this.config };
  }
  
  /**
   * 更新配置
   * @param {Object} config - 配置对象
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
    
    // 重新初始化Axios实例
    this._initializeAxios();
    this._setupInterceptors();
  }
  
  /**
   * 关闭客户端
   */
  close() {
    if (this.axiosInstance) {
      // 这里可以添加清理逻辑
      this.axiosInstance = null;
    }
  }
}

/**
 * 创建HTTP客户端实例
 * @param {Object} config - 配置对象
 * @returns {HttpClient} HTTP客户端实例
 */
export function createHttpClient(config = {}) {
  const clientConfig = new HttpClientConfig();
  Object.assign(clientConfig, config);
  return new HttpClient(clientConfig);
}

/**
 * 默认的HTTP客户端实例
 */
let defaultClient = null;

/**
 * 获取默认的HTTP客户端
 * @returns {HttpClient} HTTP客户端实例
 */
export function getDefaultClient() {
  if (!defaultClient) {
    defaultClient = createHttpClient();
  }
  return defaultClient;
}

/**
 * 快速GET请求
 * @param {string} url - URL
 * @param {Object} config - 配置
 * @returns {Promise} 响应结果
 */
export async function get(url, config = {}) {
  const client = getDefaultClient();
  return client.get(url, config);
}

/**
 * 快速POST请求
 * @param {string} url - URL
 * @param {*} data - 请求数据
 * @param {Object} config - 配置
 * @returns {Promise} 响应结果
 */
export async function post(url, data, config = {}) {
  const client = getDefaultClient();
  return client.post(url, data, config);
}

/**
 * 快速PUT请求
 * @param {string} url - URL
 * @param {*} data - 请求数据
 * @param {Object} config - 配置
 * @returns {Promise} 响应结果
 */
export async function put(url, data, config = {}) {
  const client = getDefaultClient();
  return client.put(url, data, config);
}

/**
 * 快速DELETE请求
 * @param {string} url - URL
 * @param {Object} config - 配置
 * @returns {Promise} 响应结果
 */
export async function del(url, config = {}) {
  const client = getDefaultClient();
  return client.delete(url, config);
}

/**
 * 快速PATCH请求
 * @param {string} url - URL
 * @param {*} data - 请求数据
 * @param {Object} config - 配置
 * @returns {Promise} 响应结果
 */
export async function patch(url, data, config = {}) {
  const client = getDefaultClient();
  return client.patch(url, data, config);
}

export default {
  HttpClient,
  HttpClientConfig,
  createHttpClient,
  getDefaultClient,
  get,
  post,
  put,
  delete: del,
  patch
};