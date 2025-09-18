/**
 * 文件工具模块
 * 提供文件读写、路径处理、压缩解压等功能
 */

import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { logger } from './logger.js';

/**
 * 文件工具类
 */
export class FileUtils {
  constructor() {
    this.defaultEncoding = 'utf8';
    this.defaultJsonIndent = 2;
  }
  
  /**
   * 检查文件是否存在
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>} 是否存在
   */
  static async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * 检查是否是文件
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>} 是否是文件
   */
  static async isFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }
  
  /**
   * 检查是否是目录
   * @param {string} dirPath - 目录路径
   * @returns {Promise<boolean>} 是否是目录
   */
  static async isDirectory(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
  
  /**
   * 读取文件内容
   * @param {string} filePath - 文件路径
   * @param {string} encoding - 编码格式
   * @returns {Promise<string>} 文件内容
   */
  static async read(filePath, encoding = 'utf8') {
    try {
      const content = await fs.readFile(filePath, encoding);
      logger.debug(`文件读取成功: ${filePath}`);
      return content;
    } catch (error) {
      logger.error(`文件读取失败: ${filePath}`, error);
      throw error;
    }
  }
  
  /**
   * 写入文件内容
   * @param {string} filePath - 文件路径
   * @param {string|Buffer} content - 文件内容
   * @param {string} encoding - 编码格式
   * @returns {Promise<void>}
   */
  static async write(filePath, content, encoding = 'utf8') {
    try {
      // 确保目录存在
      await this.ensureDir(path.dirname(filePath));
      
      await fs.writeFile(filePath, content, encoding);
      logger.debug(`文件写入成功: ${filePath}`);
    } catch (error) {
      logger.error(`文件写入失败: ${filePath}`, error);
      throw error;
    }
  }
  
  /**
   * 追加文件内容
   * @param {string} filePath - 文件路径
   * @param {string} content - 追加内容
   * @param {string} encoding - 编码格式
   * @returns {Promise<void>}
   */
  static async append(filePath, content, encoding = 'utf8') {
    try {
      await fs.appendFile(filePath, content, encoding);
      logger.debug(`文件追加成功: ${filePath}`);
    } catch (error) {
      logger.error(`文件追加失败: ${filePath}`, error);
      throw error;
    }
  }
  
  /**
   * 读取JSON文件
   * @param {string} filePath - JSON文件路径
   * @returns {Promise<Object>} JSON对象
   */
  static async readJson(filePath) {
    try {
      const content = await this.read(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`JSON文件读取失败: ${filePath}`, error);
      throw error;
    }
  }
  
  /**
   * 写入JSON文件
   * @param {string} filePath - JSON文件路径
   * @param {Object} data - JSON数据
   * @param {number} indent - 缩进空格数
   * @returns {Promise<void>}
   */
  static async writeJson(filePath, data, indent = 2) {
    try {
      const jsonString = JSON.stringify(data, null, indent);
      await this.write(filePath, jsonString, 'utf8');
      logger.debug(`JSON文件写入成功: ${filePath}`);
    } catch (error) {
      logger.error(`JSON文件写入失败: ${filePath}`, error);
      throw error;
    }
  }
  
  /**
   * 复制文件
   * @param {string} sourcePath - 源文件路径
   * @param {string} targetPath - 目标文件路径
   * @returns {Promise<void>}
   */
  static async copy(sourcePath, targetPath) {
    try {
      // 确保目标目录存在
      await this.ensureDir(path.dirname(targetPath));
      
      await fs.copyFile(sourcePath, targetPath);
      logger.debug(`文件复制成功: ${sourcePath} -> ${targetPath}`);
    } catch (error) {
      logger.error(`文件复制失败: ${sourcePath} -> ${targetPath}`, error);
      throw error;
    }
  }
  
  /**
   * 移动文件
   * @param {string} sourcePath - 源文件路径
   * @param {string} targetPath - 目标文件路径
   * @returns {Promise<void>}
   */
  static async move(sourcePath, targetPath) {
    try {
      // 确保目标目录存在
      await this.ensureDir(path.dirname(targetPath));
      
      await fs.rename(sourcePath, targetPath);
      logger.debug(`文件移动成功: ${sourcePath} -> ${targetPath}`);
    } catch (error) {
      logger.error(`文件移动失败: ${sourcePath} -> ${targetPath}`, error);
      throw error;
    }
  }
  
  /**
   * 删除文件
   * @param {string} filePath - 文件路径
   * @returns {Promise<void>}
   */
  static async delete(filePath) {
    try {
      await fs.unlink(filePath);
      logger.debug(`文件删除成功: ${filePath}`);
    } catch (error) {
      logger.error(`文件删除失败: ${filePath}`, error);
      throw error;
    }
  }
  
  /**
   * 创建目录
   * @param {string} dirPath - 目录路径
   * @param {Object} options - 选项
   * @returns {Promise<void>}
   */
  static async ensureDir(dirPath, options = { recursive: true }) {
    try {
      await fs.mkdir(dirPath, options);
      logger.debug(`目录创建成功: ${dirPath}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        logger.error(`目录创建失败: ${dirPath}`, error);
        throw error;
      }
    }
  }
  
  /**
   * 删除目录
   * @param {string} dirPath - 目录路径
   * @param {Object} options - 选项
   * @returns {Promise<void>}
   */
  static async removeDir(dirPath, options = { recursive: true }) {
    try {
      await fs.rmdir(dirPath, options);
      logger.debug(`目录删除成功: ${dirPath}`);
    } catch (error) {
      logger.error(`目录删除失败: ${dirPath}`, error);
      throw error;
    }
  }
  
  /**
   * 读取目录内容
   * @param {string} dirPath - 目录路径
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 文件和目录列表
   */
  static async readDir(dirPath, options = {}) {
    try {
      const items = await fs.readdir(dirPath, options);
      logger.debug(`目录读取成功: ${dirPath}`);
      return items;
    } catch (error) {
      logger.error(`目录读取失败: ${dirPath}`, error);
      throw error;
    }
  }
  
  /**
   * 获取文件信息
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 文件信息
   */
  static async stat(filePath) {
    try {
      const stats = await fs.stat(filePath);
      logger.debug(`文件信息获取成功: ${filePath}`);
      return stats;
    } catch (error) {
      logger.error(`文件信息获取失败: ${filePath}`, error);
      throw error;
    }
  }
  
  /**
   * 获取文件大小
   * @param {string} filePath - 文件路径
   * @returns {Promise<number>} 文件大小（字节）
   */
  static async getFileSize(filePath) {
    try {
      const stats = await this.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }
  
  /**
   * 压缩文件
   * @param {string} sourcePath - 源文件路径
   * @param {string} targetPath - 目标文件路径
   * @returns {Promise<void>}
   */
  static async compress(sourcePath, targetPath) {
    try {
      const source = createReadStream(sourcePath);
      const target = createWriteStream(targetPath);
      const gzip = createGzip();
      
      await pipeline(source, gzip, target);
      logger.debug(`文件压缩成功: ${sourcePath} -> ${targetPath}`);
    } catch (error) {
      logger.error(`文件压缩失败: ${sourcePath} -> ${targetPath}`, error);
      throw error;
    }
  }
  
  /**
   * 解压文件
   * @param {string} sourcePath - 压缩文件路径
   * @param {string} targetPath - 目标文件路径
   * @returns {Promise<void>}
   */
  static async decompress(sourcePath, targetPath) {
    try {
      const source = createReadStream(sourcePath);
      const target = createWriteStream(targetPath);
      const gunzip = createGunzip();
      
      await pipeline(source, gunzip, target);
      logger.debug(`文件解压成功: ${sourcePath} -> ${targetPath}`);
    } catch (error) {
      logger.error(`文件解压失败: ${sourcePath} -> ${targetPath}`, error);
      throw error;
    }
  }
  
  /**
   * 获取文件扩展名
   * @param {string} filePath - 文件路径
   * @returns {string} 扩展名
   */
  static getExtension(filePath) {
    return path.extname(filePath);
  }
  
  /**
   * 获取文件名（不含扩展名）
   * @param {string} filePath - 文件路径
   * @returns {string} 文件名
   */
  static getBaseName(filePath) {
    return path.basename(filePath, path.extname(filePath));
  }
  
  /**
   * 获取文件名（含扩展名）
   * @param {string} filePath - 文件路径
   * @returns {string} 文件名
   */
  static getFileName(filePath) {
    return path.basename(filePath);
  }
  
  /**
   * 获取目录路径
   * @param {string} filePath - 文件路径
   * @returns {string} 目录路径
   */
  static getDirName(filePath) {
    return path.dirname(filePath);
  }
  
  /**
   * 拼接路径
   * @param {...string} paths - 路径片段
   * @returns {string} 完整路径
   */
  static joinPath(...paths) {
    return path.join(...paths);
  }
  
  /**
   * 解析路径
   * @param {string} filePath - 文件路径
   * @returns {Object} 路径信息
   */
  static parsePath(filePath) {
    return path.parse(filePath);
  }
  
  /**
   * 获取绝对路径
   * @param {string} filePath - 文件路径
   * @returns {string} 绝对路径
   */
  static resolvePath(filePath) {
    return path.resolve(filePath);
  }
  
  /**
   * 获取相对路径
   * @param {string} from - 起始路径
   * @param {string} to - 目标路径
   * @returns {string} 相对路径
   */
  static relativePath(from, to) {
    return path.relative(from, to);
  }
  
  /**
   * 批量读取JSON文件
   * @param {Array<string>} filePaths - JSON文件路径数组
   * @returns {Promise<Object>} 文件内容对象
   */
  static async readMultipleJson(filePaths) {
    const results = {};
    
    for (const filePath of filePaths) {
      try {
        const data = await this.readJson(filePath);
        const fileName = this.getBaseName(filePath);
        results[fileName] = data;
      } catch (error) {
        logger.error(`批量读取JSON失败: ${filePath}`, error);
      }
    }
    
    return results;
  }
  
  /**
   * 批量写入JSON文件
   * @param {Object} fileData - 文件数据对象 {文件名: 数据}
   * @param {string} outputDir - 输出目录
   * @returns {Promise<void>}
   */
  static async writeMultipleJson(fileData, outputDir) {
    for (const [fileName, data] of Object.entries(fileData)) {
      try {
        const filePath = this.joinPath(outputDir, `${fileName}.json`);
        await this.writeJson(filePath, data);
      } catch (error) {
        logger.error(`批量写入JSON失败: ${fileName}`, error);
      }
    }
  }
  
  /**
   * 监控文件变化
   * @param {string} filePath - 文件路径
   * @param {Function} callback - 变化回调函数
   * @param {Object} options - 监控选项
   * @returns {Object} 监控器对象
   */
  static watchFile(filePath, callback, options = {}) {
    try {
      const watcher = fs.watch(filePath, options, (eventType, filename) => {
        logger.debug(`文件变化: ${eventType} - ${filename}`);
        callback(eventType, filename);
      });
      
      logger.debug(`开始监控文件: ${filePath}`);
      return watcher;
    } catch (error) {
      logger.error(`文件监控失败: ${filePath}`, error);
      throw error;
    }
  }
  
  /**
   * 获取文件MD5哈希
   * @param {string} filePath - 文件路径
   * @returns {Promise<string>} MD5哈希值
   */
  static async getFileHash(filePath) {
    try {
      const crypto = await import('crypto');
      const hash = crypto.createHash('md5');
      const stream = createReadStream(filePath);
      
      return new Promise((resolve, reject) => {
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error(`文件哈希计算失败: ${filePath}`, error);
      throw error;
    }
  }
  
  /**
   * 清理临时文件
   * @param {string} tempDir - 临时目录
   * @param {number} maxAge - 最大存活时间（毫秒）
   * @returns {Promise<void>}
   */
  static async cleanTempFiles(tempDir, maxAge = 24 * 60 * 60 * 1000) {
    try {
      if (!(await this.exists(tempDir))) {
        return;
      }
      
      const items = await this.readDir(tempDir);
      const now = Date.now();
      
      for (const item of items) {
        const itemPath = this.joinPath(tempDir, item);
        const stats = await this.stat(itemPath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          if (stats.isFile()) {
            await this.delete(itemPath);
          } else if (stats.isDirectory()) {
            await this.removeDir(itemPath);
          }
        }
      }
      
      logger.debug(`临时文件清理完成: ${tempDir}`);
    } catch (error) {
      logger.error(`临时文件清理失败: ${tempDir}`, error);
    }
  }
}

/**
 * 快捷函数
 */
export const readFile = FileUtils.read;
export const writeFile = FileUtils.write;
export const readJsonFile = FileUtils.readJson;
export const writeJsonFile = FileUtils.writeJson;
export const ensureDirectory = FileUtils.ensureDir;
export const copyFile = FileUtils.copy;
export const moveFile = FileUtils.move;
export const deleteFile = FileUtils.delete;
export const getFileExtension = FileUtils.getExtension;
export const getBaseName = FileUtils.getBaseName;
export const getFileName = FileUtils.getFileName;
export const getDirectoryName = FileUtils.getDirName;
export const joinPath = FileUtils.joinPath;
export const resolvePath = FileUtils.resolvePath;

export default {
  FileUtils,
  readFile,
  writeFile,
  readJsonFile,
  writeJsonFile,
  ensureDirectory,
  copyFile,
  moveFile,
  deleteFile,
  getFileExtension,
  getBaseName,
  getFileName,
  getDirectoryName,
  joinPath,
  resolvePath
};