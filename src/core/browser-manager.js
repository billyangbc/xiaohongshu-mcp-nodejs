/**
 * 浏览器管理器 - 反风控核心模块
 * 负责浏览器实例管理、指纹生成、代理配置和反风控策略
 */

const { chromium, firefox, webkit } = require('playwright');
const stealth = require('puppeteer-extra-plugin-stealth');
const { FingerprintGenerator } = require('./fingerprint-generator');
const logger = require('../utils/logger');

class BrowserManager {
  constructor(options = {}) {
    this.browserType = options.browserType || 'chromium';
    this.headless = options.headless !== false;
    this.proxyManager = options.proxyManager;
    this.fingerprintGenerator = new FingerprintGenerator();
    this.instances = new Map();
    this.maxInstances = options.maxInstances || 10;
    this.defaultTimeout = options.defaultTimeout || 30000;
  }

  /**
   * 创建新的浏览器实例
   * @param {Object} options - 浏览器配置选项
   * @returns {Promise<Object>} 浏览器实例信息
   */
  async createInstance(options = {}) {
    try {
      const instanceId = this.generateInstanceId();
      const fingerprint = await this.fingerprintGenerator.generateFingerprint();
      const proxy = options.proxy || await this.getRandomProxy();
      
      const browserOptions = await this.buildBrowserOptions(fingerprint, proxy, options);
      
      const browser = await this.launchBrowser(browserOptions);
      const context = await this.createContext(browser, fingerprint, proxy);
      
      const instance = {
        id: instanceId,
        browser,
        context,
        fingerprint,
        proxy,
        createdAt: new Date(),
        lastUsed: new Date(),
        pages: new Set(),
        isActive: true
      };

      this.instances.set(instanceId, instance);
      
      logger.info(`浏览器实例创建成功`, {
        instanceId,
        fingerprint: fingerprint.fingerprint_id,
        proxy: proxy ? `${proxy.host}:${proxy.port}` : 'none'
      });

      return instance;
    } catch (error) {
      logger.error('创建浏览器实例失败', error);
      throw error;
    }
  }

  /**
   * 获取页面实例
   * @param {string} instanceId - 浏览器实例ID
   * @param {Object} options - 页面配置选项
   * @returns {Promise<Object>} 页面实例
   */
  async getPage(instanceId, options = {}) {
    try {
      const instance = this.instances.get(instanceId);
      if (!instance || !instance.isActive) {
        throw new Error('浏览器实例不存在或已关闭');
      }

      const page = await instance.context.newPage();
      
      // 应用反风控策略
      await this.applyAntiDetection(page, instance.fingerprint);
      
      // 配置页面选项
      await this.configurePage(page, options);

      instance.pages.add(page);
      instance.lastUsed = new Date();

      logger.debug(`获取页面成功`, { instanceId, pageCount: instance.pages.size });
      return page;
    } catch (error) {
      logger.error('获取页面失败', error);
      throw error;
    }
  }

  /**
   * 关闭浏览器实例
   * @param {string} instanceId - 浏览器实例ID
   */
  async closeInstance(instanceId) {
    try {
      const instance = this.instances.get(instanceId);
      if (!instance) return;

      // 关闭所有页面
      for (const page of instance.pages) {
        try {
          await page.close();
        } catch (error) {
          logger.warn('关闭页面失败', error);
        }
      }

      // 关闭浏览器
      await instance.browser.close();
      
      this.instances.delete(instanceId);
      
      logger.info(`浏览器实例关闭成功`, { instanceId });
    } catch (error) {
      logger.error('关闭浏览器实例失败', error);
    }
  }

  /**
   * 获取活跃实例列表
   * @returns {Array} 活跃实例信息
   */
  getActiveInstances() {
    return Array.from(this.instances.values()).map(instance => ({
      id: instance.id,
      fingerprint: instance.fingerprint.fingerprint_id,
      proxy: instance.proxy ? `${instance.proxy.host}:${instance.proxy.port}` : 'none',
      pageCount: instance.pages.size,
      createdAt: instance.createdAt,
      lastUsed: instance.lastUsed
    }));
  }

  /**
   * 清理不活跃的实例
   * @param {number} maxInactiveTime - 最大不活跃时间(分钟)
   */
  async cleanupInactiveInstances(maxInactiveTime = 30) {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - maxInactiveTime * 60 * 1000);

    const inactiveInstances = Array.from(this.instances.values())
      .filter(instance => instance.lastUsed < cutoffTime);

    for (const instance of inactiveInstances) {
      await this.closeInstance(instance.id);
    }

    logger.info(`清理不活跃实例完成`, { 
      cleanedCount: inactiveInstances.length,
      remainingCount: this.instances.size 
    });
  }

  /**
   * 构建浏览器启动选项
   * @private
   */
  async buildBrowserOptions(fingerprint, proxy, options) {
    const browserOptions = {
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-networking',
        '--enable-features=NetworkService,NetworkServiceLogging',
        '--disable-webgl',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-features=TranslateUI'
      ],
      viewport: {
        width: fingerprint.viewport_width,
        height: fingerprint.viewport_height
      },
      userAgent: fingerprint.user_agent,
      locale: fingerprint.language,
      timezoneId: fingerprint.timezone,
      geolocation: {
        latitude: fingerprint.latitude,
        longitude: fingerprint.longitude
      },
      permissions: ['geolocation', 'notifications'],
      ignoreDefaultArgs: ['--enable-automation'],
      bypassCSP: true
    };

    // 配置代理
    if (proxy) {
      browserOptions.proxy = {
        server: `${proxy.type}://${proxy.host}:${proxy.port}`,
        username: proxy.username,
        password: proxy.password
      };
    }

    return browserOptions;
  }

  /**
   * 创建浏览器上下文
   * @private
   */
  async createContext(browser, fingerprint, proxy) {
    const context = await browser.newContext({
      viewport: {
        width: fingerprint.viewport_width,
        height: fingerprint.viewport_height
      },
      userAgent: fingerprint.user_agent,
      locale: fingerprint.language,
      timezoneId: fingerprint.timezone,
      geolocation: {
        latitude: fingerprint.latitude,
        longitude: fingerprint.longitude
      },
      permissions: ['geolocation', 'notifications']
    });

    // 设置Cookie和本地存储
    await this.setupContextData(context, fingerprint);

    return context;
  }

  /**
   * 应用反检测策略
   * @private
   */
  async applyAntiDetection(page, fingerprint) {
    // 注入反检测脚本
    await page.addInitScript(() => {
      // 移除webdriver属性
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // 伪造插件信息
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // 伪造语言信息
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      });

      // 移除自动化标志
      delete navigator.__proto__.webdriver;
      
      // 伪造屏幕信息
      Object.defineProperty(screen, 'width', {
        get: () => 1920,
      });
      
      Object.defineProperty(screen, 'height', {
        get: () => 1080,
      });

      // 伪造WebGL信息
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

    // 设置额外的headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': fingerprint.language,
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });
  }

  /**
   * 配置页面选项
   * @private
   */
  async configurePage(page, options) {
    // 设置默认超时
    page.setDefaultTimeout(this.defaultTimeout);
    page.setDefaultNavigationTimeout(this.defaultTimeout);

    // 配置视口
    if (options.viewport) {
      await page.setViewportSize(options.viewport);
    }

    // 拦截图片加载（可选）
    if (options.blockImages) {
      await page.route('**/*.{png,jpg,jpeg,gif,svg,webp}', route => route.abort());
    }

    // 拦截不必要的资源
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      const blockedTypes = ['font', 'media', 'websocket'];
      
      if (blockedTypes.includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // 监听控制台消息
    page.on('console', (msg) => {
      logger.debug('页面控制台消息', { 
        type: msg.type(), 
        text: msg.text(),
        url: page.url() 
      });
    });

    // 监听错误
    page.on('pageerror', (error) => {
      logger.warn('页面错误', { error: error.message, url: page.url() });
    });
  }

  /**
   * 设置上下文数据
   * @private
   */
  async setupContextData(context, fingerprint) {
    // 设置本地存储
    await context.addInitScript((data) => {
      localStorage.setItem('fingerprint_id', data.fingerprint_id);
      localStorage.setItem('user_agent', data.user_agent);
    }, fingerprint);

    // 设置Cookie
    if (fingerprint.cookies) {
      await context.addCookies(fingerprint.cookies);
    }
  }

  /**
   * 启动浏览器
   * @private
   */
  async launchBrowser(options) {
    const browserMap = {
      chromium,
      firefox,
      webkit
    };

    const browserEngine = browserMap[this.browserType];
    if (!browserEngine) {
      throw new Error(`不支持的浏览器类型: ${this.browserType}`);
    }

    return await browserEngine.launch(options);
  }

  /**
   * 获取随机代理
   * @private
   */
  async getRandomProxy() {
    if (!this.proxyManager) return null;
    return await this.proxyManager.getRandomProxy();
  }

  /**
   * 生成实例ID
   * @private
   */
  generateInstanceId() {
    return `browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 等待页面加载完成
   * @param {Object} page - Playwright页面实例
   * @param {Object} options - 等待选项
   */
  async waitForPageLoad(page, options = {}) {
    const { timeout = 30000, waitForNetwork = true } = options;
    
    try {
      await page.waitForLoadState('networkidle', { timeout });
      
      if (waitForNetwork) {
        await page.waitForLoadState('domcontentloaded', { timeout });
      }

      // 等待额外的时间模拟人类行为
      await page.waitForTimeout(Math.random() * 2000 + 1000);
    } catch (error) {
      logger.warn('页面加载等待超时', { url: page.url(), timeout });
    }
  }

  /**
   * 模拟人类行为
   * @param {Object} page - Playwright页面实例
   */
  async simulateHumanBehavior(page) {
    // 随机滚动
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const randomScroll = Math.random() * scrollHeight;
    await page.evaluate((scroll) => {
      window.scrollTo(0, scroll);
    }, randomScroll);

    // 随机等待
    await page.waitForTimeout(Math.random() * 3000 + 1000);

    // 模拟鼠标移动
    const viewport = page.viewportSize();
    await page.mouse.move(
      Math.random() * viewport.width,
      Math.random() * viewport.height
    );
  }

  /**
   * 关闭所有实例
   */
  async closeAllInstances() {
    const instanceIds = Array.from(this.instances.keys());
    
    for (const instanceId of instanceIds) {
      await this.closeInstance(instanceId);
    }
    
    logger.info('所有浏览器实例已关闭');
  }

  /**
   * 获取实例统计信息
   */
  getStats() {
    return {
      totalInstances: this.instances.size,
      activeInstances: Array.from(this.instances.values()).filter(i => i.isActive).length,
      totalPages: Array.from(this.instances.values()).reduce((sum, i) => sum + i.pages.size, 0),
      maxInstances: this.maxInstances
    };
  }
}

module.exports = BrowserManager;