/**
 * 随机数工具模块
 * 提供随机数生成、随机字符串生成和随机延迟功能
 */

import { logger } from './logger.js';

/**
 * 随机数工具类
 */
export class RandomUtils {
  constructor() {
    this.defaultCharset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    this.defaultLength = 8;
  }
  
  /**
   * 生成随机整数
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {number} 随机整数
   */
  static int(min, max) {
    if (min > max) {
      [min, max] = [max, min];
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  /**
   * 生成随机浮点数
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @param {number} precision - 小数精度
   * @returns {number} 随机浮点数
   */
  static float(min, max, precision = 2) {
    if (min > max) {
      [min, max] = [max, min];
    }
    const random = Math.random() * (max - min) + min;
    return parseFloat(random.toFixed(precision));
  }
  
   /**
   * 生成随机布尔值
   * @param {number} probability - 为true的概率 (0-1)
   * @returns {boolean} 随机布尔值
   */
  static boolean(probability = 0.5) {
    return Math.random() < probability;
  }
  
  /**
   * 从数组中随机选择一个元素
   * @param {Array} array - 数组
   * @returns {*} 随机元素
   */
  static choice(array) {
    if (!Array.isArray(array) || array.length === 0) {
      return null;
    }
    return array[this.int(0, array.length - 1)];
  }
  
  /**
   * 从数组中随机选择多个元素
   * @param {Array} array - 数组
   * @param {number} count - 选择数量
   * @param {boolean} unique - 是否去重
   * @returns {Array} 随机元素数组
   */
  static choices(array, count = 1, unique = true) {
    if (!Array.isArray(array) || array.length === 0 || count <= 0) {
      return [];
    }
    
    if (unique && count > array.length) {
      count = array.length;
    }
    
    const result = [];
    const available = unique ? [...array] : array;
    
    for (let i = 0; i < count; i++) {
      if (unique && available.length === 0) break;
      
      const index = this.int(0, available.length - 1);
      result.push(available[index]);
      
      if (unique) {
        available.splice(index, 1);
      }
    }
    
    return result;
  }
  
  /**
   * 打乱数组顺序
   * @param {Array} array - 数组
   * @returns {Array} 打乱后的数组
   */
  static shuffle(array) {
    if (!Array.isArray(array)) {
      return [];
    }
    
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    
    return result;
  }
  
  /**
   * 生成随机字符串
   * @param {number} length - 字符串长度
   * @param {string} charset - 字符集
   * @returns {string} 随机字符串
   */
  static string(length = 8, charset = null) {
    const chars = charset || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(this.int(0, chars.length - 1));
    }
    
    return result;
  }
  
  /**
   * 生成随机字母字符串
   * @param {number} length - 字符串长度
   * @param {string} caseType - 大小写类型 ('upper', 'lower', 'mixed')
   * @returns {string} 随机字母字符串
   */
  static letters(length = 8, caseType = 'mixed') {
    let charset;
    switch (caseType) {
      case 'upper':
        charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        break;
      case 'lower':
        charset = 'abcdefghijklmnopqrstuvwxyz';
        break;
      default:
        charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    }
    
    return this.string(length, charset);
  }
  
  /**
   * 生成随机数字字符串
   * @param {number} length - 字符串长度
   * @returns {string} 随机数字字符串
   */
  static digits(length = 8) {
    return this.string(length, '0123456789');
  }
  
  /**
   * 生成随机UUID格式字符串
   * @returns {string} UUID格式字符串
   */
  static uuid() {
    const segments = [8, 4, 4, 4, 12];
    const result = segments.map(length => this.string(length, '0123456789abcdef')).join('-');
    return result;
  }
  
  /**
   * 生成随机十六进制字符串
   * @param {number} length - 字符串长度
   * @returns {string} 十六进制字符串
   */
  static hex(length = 8) {
    return this.string(length, '0123456789abcdef');
  }
  
  /**
   * 生成随机Base64字符串
   * @param {number} length - 字符串长度
   * @returns {string} Base64字符串
   */
  static base64(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    return this.string(length, chars);
  }
  
  /**
   * 生成随机中文姓名
   * @returns {string} 中文姓名
   */
  static chineseName() {
    const surnames = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗'];
    const names = ['伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀兰', '霞'];
    
    const surname = this.choice(surnames);
    const name = this.choice(names);
    
    return surname + name;
  }
  
  /**
   * 生成随机IP地址
   * @param {string} type - IP类型 ('ipv4', 'ipv6')
   * @returns {string} IP地址
   */
  static ip(type = 'ipv4') {
    if (type === 'ipv6') {
      const segments = Array.from({ length: 8 }, () => this.hex(4));
      return segments.join(':');
    } else {
      return [
        this.int(1, 255),
        this.int(0, 255),
        this.int(0, 255),
        this.int(1, 255)
      ].join('.');
    }
  }
  
  /**
   * 生成随机MAC地址
   * @returns {string} MAC地址
   */
  static mac() {
    const segments = Array.from({ length: 6 }, () => this.hex(2));
    return segments.join(':');
  }
  
  /**
   * 生成随机用户代理字符串
   * @returns {string} 用户代理字符串
   */
  static userAgent() {
    const browsers = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/91.0.864.59'
    ];
    
    return this.choice(browsers);
  }
  
  /**
   * 生成随机邮箱地址
   * @param {string} domain - 邮箱域名
   * @returns {string} 邮箱地址
   */
  static email(domain = null) {
    const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'qq.com', '163.com'];
    const username = this.letters(this.int(6, 12), 'lower');
    const emailDomain = domain || this.choice(domains);
    
    return `${username}@${emailDomain}`;
  }
  
  /**
   * 生成随机手机号码
   * @param {string} country - 国家代码
   * @returns {string} 手机号码
   */
  static phoneNumber(country = 'CN') {
    if (country === 'CN') {
      const prefixes = ['130', '131', '132', '133', '134', '135', '136', '137', '138', '139', '150', '151', '152', '153', '155', '156', '157', '158', '159', '170', '171', '172', '173', '174', '175', '176', '177', '178', '180', '181', '182', '183', '184', '185', '186', '187', '188', '189'];
      const prefix = this.choice(prefixes);
      const suffix = this.digits(8);
      
      return prefix + suffix;
    } else {
      return '+' + this.digits(this.int(10, 12));
    }
  }
  
  /**
   * 生成随机延迟
   * @param {number} min - 最小延迟（毫秒）
   * @param {number} max - 最大延迟（毫秒）
   * @returns {Promise<void>}
   */
  static async delay(min, max) {
    const delayTime = this.int(min, max);
    logger.debug(`随机延迟: ${delayTime}ms`);
    
    return new Promise(resolve => {
      setTimeout(resolve, delayTime);
    });
  }
  
  /**
   * 生成随机延迟（秒）
   * @param {number} min - 最小延迟（秒）
   * @param {number} max - 最大延迟（秒）
   * @returns {Promise<void>}
   */
  static async delaySeconds(min, max) {
    const minMs = min * 1000;
    const maxMs = max * 1000;
    return this.delay(minMs, maxMs);
  }
  
  /**
   * 生成随机延迟（分钟）
   * @param {number} min - 最小延迟（分钟）
   * @param {number} max - 最大延迟（分钟）
   * @returns {Promise<void>}
   */
  static async delayMinutes(min, max) {
    const minMs = min * 60 * 1000;
    const maxMs = max * 60 * 1000;
    return this.delay(minMs, maxMs);
  }
  
  /**
   * 概率测试
   * @param {number} probability - 成功概率 (0-1)
   * @returns {boolean} 是否成功
   */
  static chance(probability = 0.5) {
    return this.boolean(probability);
  }
  
  /**
   * 加权随机选择
   * @param {Array<Object>} items - 带权重的项目数组 [{item: any, weight: number}]
   * @returns {*} 选中的项目
   */
  static weightedChoice(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return null;
    }
    
    const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0), 0);
    if (totalWeight <= 0) {
      return this.choice(items.map(item => item.item));
    }
    
    let random = this.float(0, totalWeight);
    
    for (const item of items) {
      random -= (item.weight || 0);
      if (random <= 0) {
        return item.item;
      }
    }
    
    return items[items.length - 1].item;
  }
  
  /**
   * 生成随机颜色
   * @param {string} format - 颜色格式 ('hex', 'rgb', 'hsl')
   * @returns {string} 颜色值
   */
  static color(format = 'hex') {
    switch (format) {
      case 'rgb':
        return `rgb(${this.int(0, 255)}, ${this.int(0, 255)}, ${this.int(0, 255)})`;
      
      case 'hsl':
        return `hsl(${this.int(0, 360)}, ${this.int(0, 100)}%, ${this.int(0, 100)}%)`;
      
      default:
        return '#' + this.hex(6);
    }
  }
  
  /**
   * 生成随机地理位置
   * @param {Object} bounds - 边界范围 {minLat, maxLat, minLng, maxLng}
   * @returns {Object} 地理位置 {latitude, longitude}
   */
  static location(bounds = null) {
    const defaultBounds = {
      minLat: -90,
      maxLat: 90,
      minLng: -180,
      maxLng: 180
    };
    
    const finalBounds = { ...defaultBounds, ...bounds };
    
    return {
      latitude: this.float(finalBounds.minLat, finalBounds.maxLat, 6),
      longitude: this.float(finalBounds.minLng, finalBounds.maxLng, 6)
    };
  }
  
  /**
   * 生成随机浏览器指纹参数
   * @returns {Object} 浏览器指纹参数
   */
  static browserFingerprint() {
    return {
      userAgent: this.userAgent(),
      screenWidth: this.choice([1366, 1440, 1536, 1600, 1920]),
      screenHeight: this.choice([768, 900, 1024, 1080, 1200]),
      viewportWidth: this.int(1024, 1920),
      viewportHeight: this.int(768, 1080),
      deviceMemory: this.choice([4, 8, 16]),
      hardwareConcurrency: this.choice([4, 8, 12, 16]),
      timezone: this.choice(['Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'Europe/London']),
      language: this.choice(['zh-CN', 'en-US', 'ja-JP']),
      platform: this.choice(['Win32', 'MacIntel', 'Linux x86_64']),
      webglVendor: this.choice(['Intel Inc.', 'NVIDIA Corporation', 'ATI Technologies Inc.']),
      webglRenderer: this.choice(['Intel Iris OpenGL Engine', 'NVIDIA GeForce GTX 1080', 'AMD Radeon Pro 580'])
    };
  }
  
  /**
   * 生成随机设备信息
   * @returns {Object} 设备信息
   */
  static deviceInfo() {
    const brands = ['Apple', 'Samsung', 'Huawei', 'Xiaomi', 'OPPO', 'Vivo'];
    const models = ['iPhone 13', 'Galaxy S21', 'Mate 40', 'Mi 11', 'Find X3', 'X60'];
    
    return {
      brand: this.choice(brands),
      model: this.choice(models),
      os: this.choice(['iOS 15', 'Android 11', 'Android 12']),
      screenSize: this.choice(['6.1', '6.5', '6.7', '5.8']),
      resolution: this.choice(['1080x2400', '1440x3200', '828x1792'])
    };
  }
}

/**
 * 快捷函数
 */
export const randomInt = RandomUtils.int;
export const randomFloat = RandomUtils.float;
export const randomBoolean = RandomUtils.boolean;
export const randomChoice = RandomUtils.choice;
export const randomChoices = RandomUtils.choices;
export const randomShuffle = RandomUtils.shuffle;
export const randomString = RandomUtils.string;
export const randomLetters = RandomUtils.letters;
export const randomDigits = RandomUtils.digits;
export const randomUuid = RandomUtils.uuid;
export const randomHex = RandomUtils.hex;
export const randomDelay = RandomUtils.delay;
export const randomDelaySeconds = RandomUtils.delaySeconds;
export const randomDelayMinutes = RandomUtils.delayMinutes;
export const randomChance = RandomUtils.chance;
export const randomWeightedChoice = RandomUtils.weightedChoice;
export const randomColor = RandomUtils.color;
export const randomLocation = RandomUtils.location;
export const randomBrowserFingerprint = RandomUtils.browserFingerprint;
export const randomDeviceInfo = RandomUtils.deviceInfo;

export default {
  RandomUtils,
  randomInt,
  randomFloat,
  randomBoolean,
  randomChoice,
  randomChoices,
  randomShuffle,
  randomString,
  randomLetters,
  randomDigits,
  randomUuid,
  randomHex,
  randomDelay,
  randomDelaySeconds,
  randomDelayMinutes,
  randomChance,
  randomWeightedChoice,
  randomColor,
  randomLocation,
  randomBrowserFingerprint,
  randomDeviceInfo
};