/**
 * 时间工具模块
 * 提供时间格式化、时区转换和日期计算功能
 */

import { logger } from './logger.js';

/**
 * 时间格式枚举
 */
export const TimeFormat = {
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
  DATE: 'YYYY-MM-DD',
  TIME: 'HH:mm:ss',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
  DATETIME_MS: 'YYYY-MM-DD HH:mm:ss.SSS',
  FILENAME: 'YYYY-MM-DD_HH-mm-ss',
  HUMAN_READABLE: 'YYYY年MM月DD日 HH:mm:ss',
  SHORT_DATE: 'MM-DD',
  SHORT_TIME: 'HH:mm'
};

/**
 * 时区枚举
 */
export const Timezone = {
  UTC: 'UTC',
  BEIJING: 'Asia/Shanghai',
  TOKYO: 'Asia/Tokyo',
  NEW_YORK: 'America/New_York',
  LONDON: 'Europe/London',
  PARIS: 'Europe/Paris',
  SYDNEY: 'Australia/Sydney'
};

/**
 * 时间工具类
 */
export class TimeUtils {
  constructor() {
    this.defaultTimezone = Timezone.BEIJING;
    this.defaultFormat = TimeFormat.DATETIME;
  }
  
  /**
   * 获取当前时间戳（毫秒）
   * @returns {number} 时间戳
   */
  static now() {
    return Date.now();
  }
  
  /**
   * 获取当前时间戳（秒）
   * @returns {number} 时间戳
   */
  static nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }
  
  /**
   * 格式化时间
   * @param {Date|string|number} date - 日期对象、日期字符串或时间戳
   * @param {string} format - 格式字符串
   * @param {string} timezone - 时区
   * @returns {string} 格式化后的时间字符串
   */
  static format(date, format = TimeFormat.DATETIME, timezone = Timezone.BEIJING) {
    try {
      let targetDate;
      
      if (date instanceof Date) {
        targetDate = date;
      } else if (typeof date === 'string') {
        targetDate = new Date(date);
      } else if (typeof date === 'number') {
        // 判断是秒还是毫秒
        targetDate = new Date(date < 1e10 ? date * 1000 : date);
      } else {
        targetDate = new Date();
      }
      
      if (isNaN(targetDate.getTime())) {
        throw new Error('无效的日期');
      }
      
      // 转换时区
      if (timezone && timezone !== 'UTC') {
        targetDate = this.convertTimezone(targetDate, timezone);
      }
      
      return this._formatDate(targetDate, format);
      
    } catch (error) {
      logger.error('时间格式化失败:', error);
      return '';
    }
  }
  
  /**
   * 内部日期格式化
   * @private
   * @param {Date} date - 日期对象
   * @param {string} format - 格式字符串
   * @returns {string} 格式化后的字符串
   */
  static _formatDate(date, format) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    
    return format
      .replace(/YYYY/g, year)
      .replace(/MM/g, month)
      .replace(/DD/g, day)
      .replace(/HH/g, hours)
      .replace(/mm/g, minutes)
      .replace(/ss/g, seconds)
      .replace(/SSS/g, milliseconds);
  }
  
  /**
   * 解析日期字符串
   * @param {string} dateString - 日期字符串
   * @param {string} format - 格式字符串（可选）
   * @returns {Date} 日期对象
   */
  static parse(dateString, format = null) {
    try {
      if (!dateString) {
        throw new Error('日期字符串不能为空');
      }
      
      // 如果是时间戳字符串
      if (/^\d+$/.test(dateString)) {
        const timestamp = parseInt(dateString);
        return new Date(timestamp < 1e10 ? timestamp * 1000 : timestamp);
      }
      
      // 如果是标准ISO格式
      if (dateString.includes('T') || dateString.includes('Z')) {
        return new Date(dateString);
      }
      
      // 尝试直接解析
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }
      
      throw new Error('无法解析日期字符串');
      
    } catch (error) {
      logger.error('日期解析失败:', error);
      return null;
    }
  }
  
  /**
   * 转换时区
   * @param {Date} date - 日期对象
   * @param {string} timezone - 目标时区
   * @returns {Date} 转换后的日期对象
   */
  static convertTimezone(date, timezone) {
    try {
      if (!date || !(date instanceof Date)) {
        throw new Error('无效的日期对象');
      }
      
      // 简化的时区转换（实际项目中应该使用更完整的时区库）
      const timezoneOffsets = {
        'Asia/Shanghai': 8,
        'Asia/Tokyo': 9,
        'America/New_York': -5,
        'Europe/London': 0,
        'Europe/Paris': 1,
        'Australia/Sydney': 11
      };
      
      const offset = timezoneOffsets[timezone] || 0;
      const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
      const targetTime = utc + (3600000 * offset);
      
      return new Date(targetTime);
      
    } catch (error) {
      logger.error('时区转换失败:', error);
      return date;
    }
  }
  
  /**
   * 添加时间
   * @param {Date|string|number} date - 基准时间
   * @param {number} amount - 数量
   * @param {string} unit - 单位 ('ms', 's', 'm', 'h', 'd', 'w', 'M', 'y')
   * @returns {Date} 新的日期对象
   */
  static addTime(date, amount, unit = 'ms') {
    try {
      const targetDate = this.parse(date) || new Date();
      const timeInMs = this._convertToMilliseconds(amount, unit);
      
      return new Date(targetDate.getTime() + timeInMs);
      
    } catch (error) {
      logger.error('时间添加失败:', error);
      return null;
    }
  }
  
  /**
   * 减去时间
   * @param {Date|string|number} date - 基准时间
   * @param {number} amount - 数量
   * @param {string} unit - 单位 ('ms', 's', 'm', 'h', 'd', 'w', 'M', 'y')
   * @returns {Date} 新的日期对象
   */
  static subtractTime(date, amount, unit = 'ms') {
    return this.addTime(date, -amount, unit);
  }
  
  /**
   * 转换时间单位到毫秒
   * @private
   * @param {number} amount - 数量
   * @param {string} unit - 单位
   * @returns {number} 毫秒数
   */
  static _convertToMilliseconds(amount, unit) {
    const multipliers = {
      'ms': 1,
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000,
      'w': 7 * 24 * 60 * 60 * 1000,
      'M': 30 * 24 * 60 * 60 * 1000, // 近似值
      'y': 365 * 24 * 60 * 60 * 1000 // 近似值
    };
    
    return amount * (multipliers[unit] || 1);
  }
  
  /**
   * 计算时间差
   * @param {Date|string|number} startDate - 开始时间
   * @param {Date|string|number} endDate - 结束时间
   * @param {string} unit - 返回单位 ('ms', 's', 'm', 'h', 'd')
   * @returns {number} 时间差
   */
  static diff(startDate, endDate, unit = 'ms') {
    try {
      const start = this.parse(startDate);
      const end = this.parse(endDate) || new Date();
      
      if (!start || !end) {
        throw new Error('无效的日期');
      }
      
      const diffMs = end.getTime() - start.getTime();
      const divisor = this._convertToMilliseconds(1, unit);
      
      return Math.floor(diffMs / divisor);
      
    } catch (error) {
      logger.error('时间差计算失败:', error);
      return 0;
    }
  }
  
  /**
   * 获取时间范围
   * @param {Date|string|number} date - 基准时间
   * @param {string} range - 范围类型 ('day', 'week', 'month', 'year')
   * @returns {Object} 包含开始和结束时间的对象
   */
  static getTimeRange(date, range = 'day') {
    try {
      const targetDate = this.parse(date) || new Date();
      let start, end;
      
      switch (range) {
        case 'day':
          start = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
          end = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);
          break;
          
        case 'week':
          const dayOfWeek = targetDate.getDay();
          const startOfWeek = new Date(targetDate);
          startOfWeek.setDate(targetDate.getDate() - dayOfWeek);
          start = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate());
          
          const endOfWeek = new Date(start);
          endOfWeek.setDate(start.getDate() + 7);
          end = endOfWeek;
          break;
          
        case 'month':
          start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
          end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);
          break;
          
        case 'year':
          start = new Date(targetDate.getFullYear(), 0, 1);
          end = new Date(targetDate.getFullYear() + 1, 0, 1);
          break;
          
        default:
          throw new Error(`不支持的时间范围类型: ${range}`);
      }
      
      return { start, end };
      
    } catch (error) {
      logger.error('获取时间范围失败:', error);
      return { start: null, end: null };
    }
  }
  
  /**
   * 判断是否为工作日
   * @param {Date|string|number} date - 日期
   * @returns {boolean} 是否为工作日
   */
  static isWeekday(date) {
    try {
      const targetDate = this.parse(date);
      if (!targetDate) return false;
      
      const dayOfWeek = targetDate.getDay();
      return dayOfWeek >= 1 && dayOfWeek <= 5; // 周一到周五
      
    } catch (error) {
      logger.error('工作日判断失败:', error);
      return false;
    }
  }
  
  /**
   * 判断是否为周末
   * @param {Date|string|number} date - 日期
   * @returns {boolean} 是否为周末
   */
  static isWeekend(date) {
    return !this.isWeekday(date);
  }
  
  /**
   * 获取年龄
   * @param {Date|string|number} birthDate - 出生日期
   * @param {Date|string|number} currentDate - 当前日期（可选）
   * @returns {number} 年龄
   */
  static getAge(birthDate, currentDate = null) {
    try {
      const birth = this.parse(birthDate);
      const current = this.parse(currentDate) || new Date();
      
      if (!birth || !current) {
        throw new Error('无效的日期');
      }
      
      let age = current.getFullYear() - birth.getFullYear();
      const monthDiff = current.getMonth() - birth.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && current.getDate() < birth.getDate())) {
        age--;
      }
      
      return Math.max(0, age);
      
    } catch (error) {
      logger.error('年龄计算失败:', error);
      return 0;
    }
  }
  
  /**
   * 获取友好的时间描述
   * @param {Date|string|number} date - 日期
   * @param {Date|string|number} currentDate - 当前日期（可选）
   * @returns {string} 友好的时间描述
   */
  static getFriendlyTime(date, currentDate = null) {
    try {
      const targetDate = this.parse(date);
      const current = this.parse(currentDate) || new Date();
      
      if (!targetDate) return '无效时间';
      
      const diffMs = current.getTime() - targetDate.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffSeconds < 60) {
        return '刚刚';
      } else if (diffMinutes < 60) {
        return `${diffMinutes}分钟前`;
      } else if (diffHours < 24) {
        return `${diffHours}小时前`;
      } else if (diffDays < 7) {
        return `${diffDays}天前`;
      } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks}周前`;
      } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return `${months}个月前`;
      } else {
        const years = Math.floor(diffDays / 365);
        return `${years}年前`;
      }
      
    } catch (error) {
      logger.error('友好时间描述生成失败:', error);
      return '未知时间';
    }
  }
  
  /**
   * 创建定时器
   * @param {Function} callback - 回调函数
   * @param {number} interval - 间隔时间（毫秒）
   * @param {boolean} immediate - 是否立即执行
   * @returns {Object} 定时器对象
   */
  static createTimer(callback, interval, immediate = false) {
    let timerId = null;
    let isRunning = false;
    
    const execute = async () => {
      if (isRunning) return;
      isRunning = true;
      
      try {
        await callback();
      } catch (error) {
        logger.error('定时器执行失败:', error);
      } finally {
        isRunning = false;
      }
    };
    
    const start = () => {
      if (immediate) {
        execute();
      }
      
      timerId = setInterval(execute, interval);
    };
    
    const stop = () => {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    };
    
    return {
      start,
      stop,
      isRunning: () => timerId !== null
    };
  }
}

/**
 * 快捷函数
 */
export const formatTime = TimeUtils.format;
export const parseTime = TimeUtils.parse;
export const addTime = TimeUtils.addTime;
export const subtractTime = TimeUtils.subtractTime;
export const timeDiff = TimeUtils.diff;
export const getTimeRange = TimeUtils.getTimeRange;
export const isWeekday = TimeUtils.isWeekday;
export const isWeekend = TimeUtils.isWeekend;
export const getAge = TimeUtils.getAge;
export const getFriendlyTime = TimeUtils.getFriendlyTime;
export const createTimer = TimeUtils.createTimer;

export default {
  TimeUtils,
  TimeFormat,
  Timezone,
  formatTime,
  parseTime,
  addTime,
  subtractTime,
  timeDiff,
  getTimeRange,
  isWeekday,
  isWeekend,
  getAge,
  getFriendlyTime,
  createTimer
};