/**
 * 加密工具模块
 * 提供数据加密、解密和哈希功能
 */

import crypto from 'crypto';
import { logger } from './logger.js';

/**
 * 加密配置
 */
const CRYPTO_CONFIG = {
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  saltLength: 32,
  tagLength: 16,
  hashAlgorithm: 'sha256',
  pbkdf2Iterations: 100000,
  pbkdf2KeyLength: 32
};

/**
 * 加密结果类型
 * @typedef {Object} EncryptionResult
 * @property {string} encrypted - 加密后的数据
 * @property {string} iv - 初始化向量
 * @property {string} tag - 认证标签
 * @property {string} salt - 盐值
 */

/**
 * 生成随机字符串
 * @param {number} length - 字符串长度
 * @returns {string} 随机字符串
 */
export function generateRandomString(length = 32) {
  try {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  } catch (error) {
    logger.error('生成随机字符串失败:', error);
    throw new Error('随机字符串生成失败');
  }
}

/**
 * 生成随机字节
 * @param {number} length - 字节长度
 * @returns {Buffer} 随机字节
 */
export function generateRandomBytes(length = 32) {
  try {
    return crypto.randomBytes(length);
  } catch (error) {
    logger.error('生成随机字节失败:', error);
    throw new Error('随机字节生成失败');
  }
}

/**
 * 生成UUID v4
 * @returns {string} UUID字符串
 */
export function generateUUID() {
  try {
    return crypto.randomUUID();
  } catch (error) {
    logger.error('生成UUID失败:', error);
    throw new Error('UUID生成失败');
  }
}

/**
 * 生成密钥对
 * @param {string} keyType - 密钥类型 ('rsa', 'ec', 'ed25519')
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 密钥对
 */
export async function generateKeyPair(keyType = 'rsa', options = {}) {
  try {
    const keyPairOptions = {
      rsa: {
        modulusLength: options.modulusLength || 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: options.passphrase || generateRandomString(32)
        }
      },
      ec: {
        namedCurve: options.namedCurve || 'secp256k1',
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: options.passphrase || generateRandomString(32)
        }
      },
      ed25519: {
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: options.passphrase || generateRandomString(32)
        }
      }
    };
    
    const selectedOptions = keyPairOptions[keyType];
    if (!selectedOptions) {
      throw new Error(`不支持的密钥类型: ${keyType}`);
    }
    
    return crypto.generateKeyPairSync(keyType, selectedOptions);
    
  } catch (error) {
    logger.error(`生成密钥对失败: ${keyType}`, error);
    throw new Error(`密钥对生成失败: ${error.message}`);
  }
}

/**
 * 派生密钥
 * @param {string} password - 密码
 * @param {Buffer} salt - 盐值
 * @param {number} iterations - 迭代次数
 * @param {number} keyLength - 密钥长度
 * @returns {Promise<Buffer>} 派生密钥
 */
export async function deriveKey(password, salt, iterations = CRYPTO_CONFIG.pbkdf2Iterations, keyLength = CRYPTO_CONFIG.pbkdf2KeyLength) {
  try {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, iterations, keyLength, 'sha256', (error, derivedKey) => {
        if (error) {
          reject(error);
        } else {
          resolve(derivedKey);
        }
      });
    });
  } catch (error) {
    logger.error('密钥派生失败:', error);
    throw new Error('密钥派生失败');
  }
}

/**
 * 加密数据
 * @param {string} data - 要加密的数据
 * @param {string} password - 密码
 * @returns {Promise<EncryptionResult>} 加密结果
 */
export async function encrypt(data, password) {
  try {
    // 生成盐值和IV
    const salt = generateRandomBytes(CRYPTO_CONFIG.saltLength);
    const iv = generateRandomBytes(CRYPTO_CONFIG.ivLength);
    
    // 派生密钥
    const key = await deriveKey(password, salt);
    
    // 创建加密器
    const cipher = crypto.createCipher(CRYPTO_CONFIG.algorithm, key);
    cipher.setAAD(Buffer.from('xiaohongshu-mcp', 'utf8'));
    
    // 加密数据
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // 获取认证标签
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      salt: salt.toString('hex')
    };
    
  } catch (error) {
    logger.error('数据加密失败:', error);
    throw new Error('数据加密失败');
  }
}

/**
 * 解密数据
 * @param {EncryptionResult} encryptedData - 加密的数据
 * @param {string} password - 密码
 * @returns {Promise<string>} 解密后的数据
 */
export async function decrypt(encryptedData, password) {
  try {
    const { encrypted, iv, tag, salt } = encryptedData;
    
    // 转换十六进制字符串为Buffer
    const ivBuffer = Buffer.from(iv, 'hex');
    const tagBuffer = Buffer.from(tag, 'hex');
    const saltBuffer = Buffer.from(salt, 'hex');
    
    // 派生密钥
    const key = await deriveKey(password, saltBuffer);
    
    // 创建解密器
    const decipher = crypto.createDecipher(CRYPTO_CONFIG.algorithm, key);
    decipher.setAAD(Buffer.from('xiaohongshu-mcp', 'utf8'));
    decipher.setAuthTag(tagBuffer);
    
    // 解密数据
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
    
  } catch (error) {
    logger.error('数据解密失败:', error);
    throw new Error('数据解密失败');
  }
}

/**
 * 计算哈希值
 * @param {string} data - 要哈希的数据
 * @param {string} algorithm - 哈希算法
 * @returns {string} 哈希值
 */
export function hash(data, algorithm = CRYPTO_CONFIG.hashAlgorithm) {
  try {
    return crypto.createHash(algorithm).update(data).digest('hex');
  } catch (error) {
    logger.error('哈希计算失败:', error);
    throw new Error('哈希计算失败');
  }
}

/**
 * 计算HMAC
 * @param {string} data - 要计算HMAC的数据
 * @param {string} key - 密钥
 * @param {string} algorithm - 哈希算法
 * @returns {string} HMAC值
 */
export function hmac(data, key, algorithm = CRYPTO_CONFIG.hashAlgorithm) {
  try {
    return crypto.createHmac(algorithm, key).update(data).digest('hex');
  } catch (error) {
    logger.error('HMAC计算失败:', error);
    throw new Error('HMAC计算失败');
  }
}

/**
 * 生成数字签名
 * @param {string} data - 要签名的数据
 * @param {string} privateKey - 私钥
 * @param {string} passphrase - 私钥密码
 * @returns {string} 数字签名
 */
export function sign(data, privateKey, passphrase = '') {
  try {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(data);
    return sign.sign({ key: privateKey, passphrase }, 'hex');
  } catch (error) {
    logger.error('数字签名失败:', error);
    throw new Error('数字签名失败');
  }
}

/**
 * 验证数字签名
 * @param {string} data - 要验证的数据
 * @param {string} signature - 数字签名
 * @param {string} publicKey - 公钥
 * @returns {boolean} 签名是否有效
 */
export function verify(data, signature, publicKey) {
  try {
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(data);
    return verify.verify(publicKey, signature, 'hex');
  } catch (error) {
    logger.error('数字签名验证失败:', error);
    throw new Error('数字签名验证失败');
  }
}

/**
 * 加密对象
 * @param {Object} obj - 要加密的对象
 * @param {string} password - 密码
 * @returns {Promise<string>} 加密后的字符串
 */
export async function encryptObject(obj, password) {
  try {
    const jsonString = JSON.stringify(obj);
    const encrypted = await encrypt(jsonString, password);
    return JSON.stringify(encrypted);
  } catch (error) {
    logger.error('对象加密失败:', error);
    throw new Error('对象加密失败');
  }
}

/**
 * 解密对象
 * @param {string} encryptedString - 加密的字符串
 * @param {string} password - 密码
 * @returns {Promise<Object>} 解密后的对象
 */
export async function decryptObject(encryptedString, password) {
  try {
    const encryptedData = JSON.parse(encryptedString);
    const decryptedString = await decrypt(encryptedData, password);
    return JSON.parse(decryptedString);
  } catch (error) {
    logger.error('对象解密失败:', error);
    throw new Error('对象解密失败');
  }
}

/**
 * 生成安全的随机密码
 * @param {number} length - 密码长度
 * @param {Object} options - 选项
 * @returns {string} 随机密码
 */
export function generateSecurePassword(length = 16, options = {}) {
  const {
    includeUppercase = true,
    includeLowercase = true,
    includeNumbers = true,
    includeSymbols = true,
    excludeSimilar = true
  } = options;
  
  let charset = '';
  
  if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (includeNumbers) charset += '0123456789';
  if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  if (excludeSimilar) {
    charset = charset.replace(/[0O1lI]/g, '');
  }
  
  if (charset.length === 0) {
    throw new Error('必须至少选择一种字符类型');
  }
  
  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, charset.length);
    password += charset[randomIndex];
  }
  
  return password;
}

/**
 * 比较两个值是否相等（防时序攻击）
 * @param {string} a - 第一个值
 * @param {string} b - 第二个值
 * @returns {boolean} 是否相等
 */
export function secureCompare(a, b) {
  try {
    return crypto.timingSafeEqual(
      Buffer.from(a, 'utf8'),
      Buffer.from(b, 'utf8')
    );
  } catch (error) {
    // 如果长度不同，直接返回false
    return false;
  }
}

/**
 * 生成一次性密码（TOTP）
 * @param {string} secret - 密钥
 * @param {number} timeStep - 时间步长（秒）
 * @param {number} digits - 密码位数
 * @returns {string} 一次性密码
 */
export function generateTOTP(secret, timeStep = 30, digits = 6) {
  try {
    const time = Math.floor(Date.now() / 1000 / timeStep);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigUInt64BE(BigInt(time));
    
    const hmac = crypto.createHmac('sha1', secret).update(timeBuffer).digest();
    
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, digits);
    
    return code.toString().padStart(digits, '0');
  } catch (error) {
    logger.error('TOTP生成失败:', error);
    throw new Error('TOTP生成失败');
  }
}

/**
 * 验证一次性密码（TOTP）
 * @param {string} token - 待验证的密码
 * @param {string} secret - 密钥
 * @param {number} timeStep - 时间步长（秒）
 * @param {number} digits - 密码位数
 * @param {number} window - 时间窗口（前后步数）
 * @returns {boolean} 是否有效
 */
export function verifyTOTP(token, secret, timeStep = 30, digits = 6, window = 1) {
  try {
    const currentTime = Math.floor(Date.now() / 1000 / timeStep);
    
    for (let i = -window; i <= window; i++) {
      const expectedToken = generateTOTP(secret, timeStep, digits);
      if (secureCompare(token, expectedToken)) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    logger.error('TOTP验证失败:', error);
    return false;
  }
}

/**
 * 加密工具类
 */
export class CryptoManager {
  constructor(password) {
    this.password = password;
  }
  
  /**
   * 加密数据
   * @param {string} data - 要加密的数据
   * @returns {Promise<string>} 加密后的字符串
   */
  async encrypt(data) {
    const encrypted = await encryptObject({ data }, this.password);
    return encrypted;
  }
  
  /**
   * 解密数据
   * @param {string} encryptedData - 加密的数据
   * @returns {Promise<string>} 解密后的数据
   */
  async decrypt(encryptedData) {
    const result = await decryptObject(encryptedData, this.password);
    return result.data;
  }
  
  /**
   * 哈希数据
   * @param {string} data - 要哈希的数据
   * @returns {string} 哈希值
   */
  hash(data) {
    return hash(data);
  }
  
  /**
   * 生成HMAC
   * @param {string} data - 要计算HMAC的数据
   * @returns {string} HMAC值
   */
  hmac(data) {
    return hmac(data, this.password);
  }
}

export default {
  generateRandomString,
  generateRandomBytes,
  generateUUID,
  generateKeyPair,
  deriveKey,
  encrypt,
  decrypt,
  hash,
  hmac,
  sign,
  verify,
  encryptObject,
  decryptObject,
  generateSecurePassword,
  secureCompare,
  generateTOTP,
  verifyTOTP,
  CryptoManager
};