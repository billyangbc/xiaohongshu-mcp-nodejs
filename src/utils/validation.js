/**
 * 验证工具模块
 * 提供参数验证和数据验证功能
 */

import { logger } from './logger.js';

/**
 * 验证结果类型
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - 是否验证通过
 * @property {string[]} errors - 错误信息列表
 */

/**
 * 参数验证器
 * @param {Object} params - 要验证的参数对象
 * @param {Object} schema - 验证模式
 * @returns {ValidationResult} 验证结果
 */
export function validateParams(params, schema) {
  const errors = [];
  
  try {
    // 遍历验证模式
    for (const [field, rules] of Object.entries(schema)) {
      const value = params[field];
      
      // 检查必填字段
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} 是必填字段`);
        continue;
      }
      
      // 如果字段不存在且不是必填的，跳过验证
      if (!rules.required && (value === undefined || value === null)) {
        continue;
      }
      
      // 类型验证
      if (rules.type) {
        const typeValidation = validateType(value, rules.type, field);
        if (!typeValidation.valid) {
          errors.push(...typeValidation.errors);
          continue;
        }
      }
      
      // 数值范围验证
      if (rules.min !== undefined && typeof value === 'number') {
        if (value < rules.min) {
          errors.push(`${field} 必须大于等于 ${rules.min}`);
        }
      }
      
      if (rules.max !== undefined && typeof value === 'number') {
        if (value > rules.max) {
          errors.push(`${field} 必须小于等于 ${rules.max}`);
        }
      }
      
      // 字符串长度验证
      if (rules.min !== undefined && typeof value === 'string') {
        if (value.length < rules.min) {
          errors.push(`${field} 长度必须大于等于 ${rules.min}`);
        }
      }
      
      if (rules.max !== undefined && typeof value === 'string') {
        if (value.length > rules.max) {
          errors.push(`${field} 长度必须小于等于 ${rules.max}`);
        }
      }
      
      // 数组长度验证
      if (rules.min !== undefined && Array.isArray(value)) {
        if (value.length < rules.min) {
          errors.push(`${field} 必须包含至少 ${rules.min} 个元素`);
        }
      }
      
      if (rules.max !== undefined && Array.isArray(value)) {
        if (value.length > rules.max) {
          errors.push(`${field} 最多包含 ${rules.max} 个元素`);
        }
      }
      
      // 枚举值验证
      if (rules.enum && Array.isArray(rules.enum)) {
        if (!rules.enum.includes(value)) {
          errors.push(`${field} 必须是以下值之一: ${rules.enum.join(', ')}`);
        }
      }
      
      // 正则表达式验证
      if (rules.pattern && rules.pattern instanceof RegExp) {
        if (!rules.pattern.test(value)) {
          errors.push(`${field} 格式不正确`);
        }
      }
      
      // 自定义验证函数
      if (rules.validate && typeof rules.validate === 'function') {
        const customResult = rules.validate(value, params);
        if (customResult !== true) {
          errors.push(typeof customResult === 'string' ? customResult : `${field} 验证失败`);
        }
      }
    }
    
    // 检查未知字段
    const knownFields = Object.keys(schema);
    const unknownFields = Object.keys(params).filter(field => !knownFields.includes(field));
    if (unknownFields.length > 0) {
      errors.push(`发现未知字段: ${unknownFields.join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  } catch (error) {
    logger.error('参数验证失败:', error);
    return {
      valid: false,
      errors: ['参数验证过程出错']
    };
  }
}

/**
 * 类型验证
 * @param {*} value - 要验证的值
 * @param {string} expectedType - 期望的类型
 * @param {string} fieldName - 字段名称
 * @returns {ValidationResult} 验证结果
 */
function validateType(value, expectedType, fieldName) {
  const errors = [];
  
  switch (expectedType) {
    case 'string':
      if (typeof value !== 'string') {
        errors.push(`${fieldName} 必须是字符串类型`);
      }
      break;
      
    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push(`${fieldName} 必须是数字类型`);
      }
      break;
      
    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push(`${fieldName} 必须是布尔类型`);
      }
      break;
      
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${fieldName} 必须是数组类型`);
      }
      break;
      
    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(`${fieldName} 必须是对象类型`);
      }
      break;
      
    case 'date':
      if (!(value instanceof Date) && isNaN(new Date(value))) {
        errors.push(`${fieldName} 必须是有效的日期`);
      }
      break;
      
    case 'email':
      if (typeof value !== 'string' || !isValidEmail(value)) {
        errors.push(`${fieldName} 必须是有效的邮箱地址`);
      }
      break;
      
    case 'url':
      if (typeof value !== 'string' || !isValidUrl(value)) {
        errors.push(`${fieldName} 必须是有效的URL`);
      }
      break;
      
    case 'uuid':
      if (typeof value !== 'string' || !isValidUUID(value)) {
        errors.push(`${fieldName} 必须是有效的UUID`);
      }
      break;
      
    default:
      logger.warn(`未知的验证类型: ${expectedType}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 验证邮箱地址
 * @param {string} email - 邮箱地址
 * @returns {boolean} 是否有效
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证URL
 * @param {string} url - URL地址
 * @returns {boolean} 是否有效
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证UUID
 * @param {string} uuid - UUID字符串
 * @returns {boolean} 是否有效
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * 数据清洗器
 * @param {Object} data - 要清洗的数据
 * @param {Object} schema - 清洗模式
 * @returns {Object} 清洗后的数据
 */
export function sanitizeData(data, schema) {
  const sanitized = {};
  
  try {
    for (const [field, rules] of Object.entries(schema)) {
      if (data[field] === undefined || data[field] === null) {
        if (rules.default !== undefined) {
          sanitized[field] = rules.default;
        }
        continue;
      }
      
      let value = data[field];
      
      // 类型转换
      if (rules.type) {
        value = convertType(value, rules.type);
      }
      
      // 字符串清洗
      if (typeof value === 'string' && rules.trim) {
        value = value.trim();
      }
      
      if (typeof value === 'string' && rules.lowercase) {
        value = value.toLowerCase();
      }
      
      if (typeof value === 'string' && rules.uppercase) {
        value = value.toUpperCase();
      }
      
      // 数组清洗
      if (Array.isArray(value) && rules.unique) {
        value = [...new Set(value)];
      }
      
      if (Array.isArray(value) && rules.sort) {
        value = value.sort();
      }
      
      sanitized[field] = value;
    }
    
    return sanitized;
  } catch (error) {
    logger.error('数据清洗失败:', error);
    return {};
  }
}

/**
 * 类型转换
 * @param {*} value - 要转换的值
 * @param {string} targetType - 目标类型
 * @returns {*} 转换后的值
 */
function convertType(value, targetType) {
  try {
    switch (targetType) {
      case 'string':
        return String(value);
        
      case 'number':
        const num = Number(value);
        return isNaN(num) ? 0 : num;
        
      case 'boolean':
        if (typeof value === 'string') {
          return value.toLowerCase() === 'true' || value === '1';
        }
        return Boolean(value);
        
      case 'array':
        if (Array.isArray(value)) {
          return value;
        }
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return [value];
          }
        }
        return [value];
        
      case 'object':
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return {};
          }
        }
        return typeof value === 'object' && value !== null ? value : {};
        
      case 'date':
        return new Date(value);
        
      default:
        return value;
    }
  } catch (error) {
    logger.error(`类型转换失败: ${value} -> ${targetType}`, error);
    return value;
  }
}

/**
 * 批量验证器
 * @param {Array<Object>} items - 要验证的项目数组
 * @param {Object} schema - 验证模式
 * @returns {Object} 批量验证结果
 */
export function validateBatch(items, schema) {
  const results = [];
  let allValid = true;
  
  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const validation = validateParams(item, schema);
      
      results.push({
        index: i,
        data: item,
        valid: validation.valid,
        errors: validation.errors
      });
      
      if (!validation.valid) {
        allValid = false;
      }
    }
    
    return {
      allValid,
      results,
      validCount: results.filter(r => r.valid).length,
      invalidCount: results.filter(r => !r.valid).length
    };
  } catch (error) {
    logger.error('批量验证失败:', error);
    return {
      allValid: false,
      results: [],
      validCount: 0,
      invalidCount: items.length
    };
  }
}

/**
 * 异步验证器
 * @param {Object} params - 要验证的参数
 * @param {Object} schema - 验证模式
 * @returns {Promise<ValidationResult>} 验证结果
 */
export async function validateParamsAsync(params, schema) {
  try {
    const syncResult = validateParams(params, schema);
    if (!syncResult.valid) {
      return syncResult;
    }
    
    // 执行异步验证
    const asyncErrors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
      if (rules.asyncValidate && typeof rules.asyncValidate === 'function') {
        try {
          const asyncResult = await rules.asyncValidate(params[field], params);
          if (asyncResult !== true) {
            asyncErrors.push(typeof asyncResult === 'string' ? asyncResult : `${field} 异步验证失败`);
          }
        } catch (error) {
          logger.error(`异步验证失败: ${field}`, error);
          asyncErrors.push(`${field} 异步验证出错`);
        }
      }
    }
    
    return {
      valid: asyncErrors.length === 0,
      errors: [...syncResult.errors, ...asyncErrors]
    };
  } catch (error) {
    logger.error('异步参数验证失败:', error);
    return {
      valid: false,
      errors: ['异步验证过程出错']
    };
  }
}