/**
 * 浏览器管理器
 * 管理浏览器实例池，支持多账号并发操作和反风控
 */

import { chromium } from 'playwright';
import { logger } from '../utils/logger.js';
import { ProxyManager } from '../proxy/proxy-manager.js';
import { FingerprintManager } from '../fingerprint/fingerprint-manager.js';
import { AntiBotManager } from './anti-bot-manager.js';
import { EventEmitter } from 'events';

/**
 * 浏览器管理器类
 */
export class BrowserManager extends EventEmitter {
  constructor() {
    super();
    this.browserPool = new Map(); // 浏览器实例池
    this.pagePool = new Map();    // 页面实例池
    this.maxBrowsers = 10;        // 最大浏览器实例数
    this.maxPagesPerBrowser = 5;  // 每个浏览器的最大页面数
    this.antiBotManager = new AntiBotManager();
  }
  
  /**
   * 获取或创建浏览器实例
   * @param {Object} config - 浏览器配置
   * @returns {Promise<Object>} 浏览器实例
   */
  async getBrowser(config = {}) {
    const { accountId, proxy, fingerprint } = config;
    const browserKey = this.generateBrowserKey(config);
    
    // 检查是否已有可用实例
    if (this.browserPool.has(browserKey)) {
      const browserInfo = this.browserPool.get(browserKey);
      if (browserInfo.isActive()) {
        return browserInfo;
      } else {
        // 清理无效实例
        await this.closeBrowser(browserKey);
      }
    }
    
    // 创建新浏览器实例
    const browserInfo = await this.createBrowser(config);
    this.browserPool.set(browserKey, browserInfo);
    
    return browserInfo;
  }
  
  /**
   * 创建浏览器实例
   * @param {Object} config - 浏览器配置
   * @returns {Promise<Object>} 浏览器实例信息
   */
  async createBrowser(config) {
    const { accountId, proxy, fingerprint } = config;
    
    try {
      // 构建启动参数
      const launchOptions = {
        headless: false, // 生产环境可设为 true
        args: this.buildBrowserArgs(fingerprint),
        viewport: {
          width: fingerprint?.viewport_width || 1920,
          height: fingerprint?.viewport_height || 1080
        },
        userAgent: fingerprint?.user_agent || this.getRandomUserAgent(),
        locale: fingerprint?.language || 'zh-CN',
        timezoneId: fingerprint?.timezone || 'Asia/Shanghai',
        permissions: ['geolocation', 'notifications'],
        geolocation: {
          latitude: 39.9042,
          longitude: 116.4074,
          accuracy: 100
        },
        colorScheme: 'light',
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false
      };
      
      // 配置代理
      if (proxy) {
        launchOptions.proxy = {
          server: `${proxy.type}://${proxy.host}:${proxy.port}`,
          username: proxy.username,
          password: proxy.password
        };
      }
      
      // 创建浏览器实例
      const browser = await chromium.launch(launchOptions);
      
      // 创建浏览器上下文
      const context = await browser.newContext({
        viewport: launchOptions.viewport,
        userAgent: launchOptions.userAgent,
        locale: launchOptions.locale,
        timezoneId: launchOptions.timezoneId,
        geolocation: launchOptions.geolocation,
        permissions: launchOptions.permissions,
        colorScheme: launchOptions.colorScheme,
        deviceScaleFactor: launchOptions.deviceScaleFactor,
        isMobile: launchOptions.isMobile,
        hasTouch: launchOptions.hasTouch,
        extraHTTPHeaders: {
          'Accept-Language': fingerprint?.language || 'zh-CN,zh;q=0.9,en;q=0.8',
          'Sec-CH-UA': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'Sec-CH-UA-Mobile': '?0',
          'Sec-CH-UA-Platform': '"Windows"'
        }
      });
      
      // 应用反风控脚本
      await this.antiBotManager.applyAntiBotScripts(context, fingerprint);
      
      // 创建浏览器信息对象
      const browserInfo = new BrowserInfo({
        browser,
        context,
        config,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        pageCount: 0
      });
      
      // 监听浏览器关闭事件
      browser.on('disconnected', () => {
        logger.warn(`浏览器实例断开连接: ${browserKey}`);
        this.browserPool.delete(browserKey);
        this.emit('browser-closed', { browserKey, accountId });
      });
      
      logger.info(`创建浏览器实例成功: ${browserKey}`);
      
      return browserInfo;
    } catch (error) {
      logger.error('创建浏览器实例失败:', error);
      throw new Error('创建浏览器实例失败: ' + error.message);
    }
  }
  
  /**
   * 获取或创建页面
   * @param {Object} config - 页面配置
   * @returns {Promise<Object>} 页面实例
   */
  async getPage(config = {}) {
    const { accountId, url } = config;
    const browserInfo = await this.getBrowser(config);
    
    try {
      // 创建新页面
      const page = await browserInfo.context.newPage();
      
      // 配置页面行为
      await this.configurePage(page, config);
      
      // 添加到页面池
      const pageKey = this.generatePageKey(config);
      this.pagePool.set(pageKey, {
        page,
        browserKey: browserInfo.getKey(),
        createdAt: Date.now(),
        lastUsed: Date.now()
      });
      
      // 监听页面关闭
      page.on('close', () => {
        this.pagePool.delete(pageKey);
        browserInfo.decrementPageCount();
      });
      
      // 如果指定了URL，导航到该页面
      if (url) {
        await page.goto(url, { waitUntil: 'networkidle' });
      }
      
      browserInfo.incrementPageCount();
      
      return page;
    } catch (error) {
      logger.error('创建页面失败:', error);
      throw error;
    }
  }
  
  /**
   * 配置页面行为
   * @param {Object} page - Playwright页面实例
   * @param {Object} config - 配置参数
   */
  async configurePage(page, config) {
    const { fingerprint } = config;
    
    // 设置默认超时时间
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
    
    // 监听控制台输出
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logger.error('页面错误:', msg.text());
      }
    });
    
    // 监听页面崩溃
    page.on('pageerror', error => {
      logger.error('页面崩溃:', error.message);
    });
    
    // 监听请求
    page.on('request', request => {
      const url = request.url();
      
      // 屏蔽追踪请求
      if (this.isTrackingRequest(url)) {
        logger.debug('屏蔽追踪请求:', url);
        request.abort();
        return;
      }
      
      // 添加请求头
      const headers = request.headers();
      headers['X-Forwarded-For'] = this.getRandomIP();
      headers['X-Real-IP'] = this.getRandomIP();
      
      request.continue({ headers });
    });
    
    // 监听响应
    page.on('response', response => {
      const url = response.url();
      const status = response.status();
      
      // 记录异常响应
      if (status >= 400) {
        logger.warn(`异常响应: ${status} ${url}`);
      }
    });
    
    // 启用请求拦截
    await page.route('**/*', route => {
      const url = route.request().url();
      
      // 屏蔽广告和分析脚本
      if (this.isBlockedResource(url)) {
        route.abort();
        return;
      }
      
      route.continue();
    });
    
    // 添加页面脚本
    await page.addInitScript(() => {
      // 移除自动化特征
      delete navigator.webdriver;
      
      // 模拟真实用户行为
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // 模拟语言
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en']
      });
      
      // 模拟WebGL
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameter(parameter);
      };
    });
  }
  
  /**
   * 登录小红书
   * @param {Object} loginData - 登录数据
   * @returns {Promise<Object>} 登录结果
   */
  async loginXiaohongshu(loginData) {
    const { username, password, verificationCode, proxy, fingerprint } = loginData;
    
    try {
      // 创建浏览器实例
      const page = await this.getPage({
        accountId: username,
        proxy,
        fingerprint,
        url: 'https://www.xiaohongshu.com'
      });
      
      // 等待页面加载
      await page.waitForLoadState('networkidle');
      
      // 点击登录按钮
      await page.click('[data-testid="login-btn"], .login-btn, .login');
      
      // 等待登录弹窗
      await page.waitForSelector('.login-modal, .login-container', { timeout: 10000 });
      
      // 输入用户名
      await page.fill('input[type="text"], input[placeholder*="手机号"], input[placeholder*="用户名"]', username);
      
      // 输入密码
      await page.fill('input[type="password"], input[placeholder*="密码"]', password);
      
      // 如果有验证码，输入验证码
      if (verificationCode) {
        await page.fill('input[placeholder*="验证码"], input[type="verification"]', verificationCode);
      }
      
      // 点击登录按钮
      await page.click('button[type="submit"], .login-submit-btn');
      
      // 等待登录结果
      try {
        // 检查登录成功
        await page.waitForSelector('.user-avatar, .user-info, [data-testid="user-menu"]', { 
          timeout: 10000 
        });
        
        // 获取cookies
        const cookies = await page.context().cookies();
        
        // 获取用户信息
        const userInfo = await this.getUserInfo(page);
        
        logger.info(`小红书登录成功: ${username}`);
        
        return {
          success: true,
          cookies,
          userAgent: await page.evaluate(() => navigator.userAgent),
          userInfo
        };
      } catch (error) {
        // 检查登录失败原因
        const errorElement = await page.$('.error-message, .login-error, .error-tip');
        if (errorElement) {
          const errorText = await errorElement.textContent();
          
          if (errorText.includes('验证码')) {
            throw new Error('需要验证码');
          } else if (errorText.includes('密码')) {
            throw new Error('密码错误');
          } else if (errorText.includes('封禁') || errorText.includes('冻结')) {
            throw new Error('账号被封禁');
          } else {
            throw new Error(`登录失败: ${errorText}`);
          }
        }
        
        throw new Error('登录超时或失败');
      }
    } catch (error) {
      logger.error('小红书登录失败:', error);
      throw error;
    }
  }
  
  /**
   * 登出小红书
   * @param {Array} cookies - 登录cookies
   * @returns {Promise<Object>} 登出结果
   */
  async logoutXiaohongshu(cookies) {
    try {
      // 创建临时浏览器实例进行登出
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      
      // 设置cookies
      await context.addCookies(cookies);
      
      // 创建页面
      const page = await context.newPage();
      await page.goto('https://www.xiaohongshu.com');
      
      // 点击用户菜单
      await page.click('.user-avatar, .user-info, [data-testid="user-menu"]');
      
      // 点击登出按钮
      await page.click('.logout-btn, [data-testid="logout"], a[href*="logout"]');
      
      // 等待登出完成
      await page.waitForSelector('.login-btn, [data-testid="login-btn"]', { timeout: 5000 });
      
      await browser.close();
      
      logger.info('小红书登出成功');
      
      return {
        success: true,
        message: '登出成功'
      };
    } catch (error) {
      logger.error('小红书登出失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 获取用户信息
   * @param {Object} page - Playwright页面实例
   * @returns {Promise<Object>} 用户信息
   */
  async getUserInfo(page) {
    try {
      // 等待用户信息加载
      await page.waitForSelector('.user-info, .user-avatar, [data-testid="user-info"]', { 
        timeout: 5000 
      });
      
      // 获取用户信息
      const userInfo = await page.evaluate(() => {
        const avatarElement = document.querySelector('.user-avatar img, [data-testid="user-avatar"] img');
        const nameElement = document.querySelector('.user-name, .user-info .name, [data-testid="user-name"]');
        const descElement = document.querySelector('.user-desc, .user-info .desc, [data-testid="user-desc"]');
        
        return {
          avatar: avatarElement ? avatarElement.src : '',
          nickname: nameElement ? nameElement.textContent.trim() : '',
          description: descElement ? descElement.textContent.trim() : ''
        };
      });
      
      return userInfo;
    } catch (error) {
      logger.error('获取用户信息失败:', error);
      return {
        avatar: '',
        nickname: '',
        description: ''
      };
    }
  }
  
  /**
   * 生成浏览器实例键
   * @param {Object} config - 配置参数
   * @returns {string} 浏览器键
   */
  generateBrowserKey(config) {
    const { accountId, proxy, fingerprint } = config;
    const parts = [];
    
    if (accountId) parts.push(`account:${accountId}`);
    if (proxy) parts.push(`proxy:${proxy.host}:${proxy.port}`);
    if (fingerprint) parts.push(`fp:${fingerprint.fingerprint_id}`);
    
    return parts.join('|') || 'default';
  }
  
  /**
   * 生成页面键
   * @param {Object} config - 配置参数
   * @returns {string} 页面键
   */
  generatePageKey(config) {
    const { accountId, url } = config;
    const timestamp = Date.now();
    
    return `${accountId || 'default'}:${url || 'page'}:${timestamp}`;
  }
  
  /**
   * 构建浏览器启动参数
   * @param {Object} fingerprint - 指纹配置
   * @returns {Array} 启动参数数组
   */
  buildBrowserArgs(fingerprint) {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--disable-features=SecurePaymentConfirmation',
      '--disable-popup-blocking'
    ];
    
    // 添加指纹相关参数
    if (fingerprint) {
      if (fingerprint.screen_width && fingerprint.screen_height) {
        args.push(`--window-size=${fingerprint.screen_width},${fingerprint.screen_height}`);
      }
      
      if (fingerprint.device_memory) {
        args.push(`--device-memory=${fingerprint.device_memory}`);
      }
    }
    
    return args;
  }
  
  /**
   * 获取随机用户代理
   * @returns {string} 用户代理字符串
   */
  getRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
    ];
    
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }
  
  /**
   * 获取随机IP地址
   * @returns {string} IP地址
   */
  getRandomIP() {
    return `${Math.floor(Math.random() * 255) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  }
  
  /**
   * 检查是否为追踪请求
   * @param {string} url - 请求URL
   * @returns {boolean} 是否为追踪请求
   */
  isTrackingRequest(url) {
    const trackingDomains = [
      'google-analytics.com',
      'googletagmanager.com',
      'facebook.com/tr',
      'doubleclick.net',
      'googleadservices.com'
    ];
    
    return trackingDomains.some(domain => url.includes(domain));
  }
  
  /**
   * 检查是否为被屏蔽的资源
   * @param {string} url - 资源URL
   * @returns {boolean} 是否为被屏蔽资源
   */
  isBlockedResource(url) {
    const blockedPatterns = [
      /.*\.google-analytics\.com.*/,
      /.*\.googletagmanager\.com.*/,
      /.*\.doubleclick\.net.*/,
      /.*\.facebook\.com\/tr.*/,
      /.*\.scorecardresearch\.com.*/,
      /.*\.outbrain\.com.*/,
      /.*\.taboola\.com.*/
    ];
    
    return blockedPatterns.some(pattern => pattern.test(url));
  }
  
  /**
   * 关闭浏览器实例
   * @param {string} browserKey - 浏览器键
   */
  async closeBrowser(browserKey) {
    if (this.browserPool.has(browserKey)) {
      const browserInfo = this.browserPool.get(browserKey);
      
      try {
        await browserInfo.browser.close();
      } catch (error) {
        logger.error('关闭浏览器失败:', error);
      }
      
      this.browserPool.delete(browserKey);
      logger.info(`关闭浏览器实例: ${browserKey}`);
    }
  }
  
  /**
   * 关闭所有浏览器实例
   */
  async closeAllBrowsers() {
    const promises = Array.from(this.browserPool.keys()).map(key => 
      this.closeBrowser(key)
    );
    
    await Promise.all(promises);
    this.browserPool.clear();
    this.pagePool.clear();
    
    logger.info('关闭所有浏览器实例');
  }
  
  /**
   * 获取浏览器池状态
   * @returns {Object} 浏览器池状态
   */
  getPoolStatus() {
    return {
      totalBrowsers: this.browserPool.size,
      totalPages: this.pagePool.size,
      maxBrowsers: this.maxBrowsers,
      maxPagesPerBrowser: this.maxPagesPerBrowser,
      browsers: Array.from(this.browserPool.entries()).map(([key, info]) => ({
        key,
        pageCount: info.pageCount,
        createdAt: info.createdAt,
        lastUsed: info.lastUsed,
        isActive: info.isActive()
      }))
    };
  }
}

/**
 * 浏览器信息类
 */
class BrowserInfo {
  constructor({ browser, context, config, createdAt, lastUsed, pageCount }) {
    this.browser = browser;
    this.context = context;
    this.config = config;
    this.createdAt = createdAt;
    this.lastUsed = lastUsed;
    this.pageCount = pageCount;
  }
  
  /**
   * 获取浏览器键
   * @returns {string} 浏览器键
   */
  getKey() {
    return `${this.config.accountId || 'default'}:${this.createdAt}`;
  }
  
  /**
   * 检查是否活跃
   * @returns {boolean} 是否活跃
   */
  isActive() {
    return !this.browser.isConnected();
  }
  
  /**
   * 增加页面计数
   */
  incrementPageCount() {
    this.pageCount++;
    this.lastUsed = Date.now();
  }
  
  /**
   * 减少页面计数
   */
  decrementPageCount() {
    this.pageCount = Math.max(0, this.pageCount - 1);
    this.lastUsed = Date.now();
  }
}