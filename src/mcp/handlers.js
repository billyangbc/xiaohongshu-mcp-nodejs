/**
 * MCP协议处理器
 * 处理MCP协议请求和响应
 */

import { logger } from '../utils/logger.js';
import { MCPError, MCP_ERROR_CODES } from './protocol.js';
import { MCPParamsSchema } from './schemas.js';
import { AccountManager } from '../services/account-manager.js';
import { PostManager } from '../services/post-manager.js';
import { TaskManager } from '../services/task-manager.js';
import { interactionHandlers } from './interaction-handlers.js';

/**
 * 账号管理器实例
 */
const accountManager = new AccountManager();

/**
 * 内容发布管理器实例
 */
const postManager = new PostManager();

/**
 * 任务管理器实例
 */
const taskManager = new TaskManager();

/**
 * MCP协议处理器
 */
export const mcpHandlers = {
  
  /**
   * 账号管理相关功能
   */
  
  // 获取账号列表
  'xiaohongshu.account.list': async (params) => {
    try {
      logger.info('获取账号列表:', params);
      
      const accounts = await accountManager.listAccounts(params);
      return {
        success: true,
        data: accounts,
        message: '获取账号列表成功'
      };
    } catch (error) {
      logger.error('获取账号列表失败:', error);
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '获取账号列表失败');
    }
  },
  
  // 添加账号
  'xiaohongshu.account.add': async (params) => {
    try {
      logger.info('添加账号:', params);
      
      // 参数验证
      const validation = MCPParamsSchema.validateAccountAdd(params);
      if (!validation.valid) {
        throw new MCPError(MCP_ERROR_CODES.INVALID_PARAMS, validation.errors.join(', '));
      }
      
      const account = await accountManager.addAccount(params);
      return {
        success: true,
        data: account,
        message: '添加账号成功'
      };
    } catch (error) {
      logger.error('添加账号失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '添加账号失败');
    }
  },
  
  // 删除账号
  'xiaohongshu.account.remove': async (params) => {
    try {
      logger.info('删除账号:', params);
      
      // 参数验证
      const validation = MCPParamsSchema.validateAccountRemove(params);
      if (!validation.valid) {
        throw new MCPError(MCP_ERROR_CODES.INVALID_PARAMS, validation.errors.join(', '));
      }
      
      const result = await accountManager.removeAccount(params.accountId);
      return {
        success: true,
        data: result,
        message: '删除账号成功'
      };
    } catch (error) {
      logger.error('删除账号失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '删除账号失败');
    }
  },
  
  // 账号登录
  'xiaohongshu.account.login': async (params) => {
    try {
      logger.info('账号登录:', params);
      
      // 参数验证
      const validation = MCPParamsSchema.validateAccountLogin(params);
      if (!validation.valid) {
        throw new MCPError(MCP_ERROR_CODES.INVALID_PARAMS, validation.errors.join(', '));
      }
      
      const result = await accountManager.loginAccount(params);
      return {
        success: true,
        data: result,
        message: '账号登录成功'
      };
    } catch (error) {
      logger.error('账号登录失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '账号登录失败');
    }
  },
  
  // 账号登出
  'xiaohongshu.account.logout': async (params) => {
    try {
      logger.info('账号登出:', params);
      
      // 参数验证
      const validation = MCPParamsSchema.validateAccountLogout(params);
      if (!validation.valid) {
        throw new MCPError(MCP_ERROR_CODES.INVALID_PARAMS, validation.errors.join(', '));
      }
      
      const result = await accountManager.logoutAccount(params.accountId);
      return {
        success: true,
        data: result,
        message: '账号登出成功'
      };
    } catch (error) {
      logger.error('账号登出失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '账号登出失败');
    }
  },
  
  // 获取账号状态
  'xiaohongshu.account.status': async (params) => {
    try {
      logger.info('获取账号状态:', params);
      
      // 参数验证
      const validation = MCPParamsSchema.validateAccountStatus(params);
      if (!validation.valid) {
        throw new MCPError(MCP_ERROR_CODES.INVALID_PARAMS, validation.errors.join(', '));
      }
      
      const status = await accountManager.getAccountStatus(params.accountId);
      return {
        success: true,
        data: status,
        message: '获取账号状态成功'
      };
    } catch (error) {
      logger.error('获取账号状态失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '获取账号状态失败');
    }
  },
  
  /**
   * 内容发布相关功能
   */
  
  // 创建笔记
  'xiaohongshu.post.create': async (params) => {
    try {
      logger.info('创建笔记:', params);
      
      // 参数验证
      const validation = MCPParamsSchema.validatePostCreate(params);
      if (!validation.valid) {
        throw new MCPError(MCP_ERROR_CODES.INVALID_PARAMS, validation.errors.join(', '));
      }
      
      const post = await postManager.createPost(params);
      return {
        success: true,
        data: post,
        message: '创建笔记成功'
      };
    } catch (error) {
      logger.error('创建笔记失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '创建笔记失败');
    }
  },
  
  // 发布笔记
  'xiaohongshu.post.publish': async (params) => {
    try {
      logger.info('发布笔记:', params);
      
      // 参数验证
      const validation = MCPParamsSchema.validatePostPublish(params);
      if (!validation.valid) {
        throw new MCPError(MCP_ERROR_CODES.INVALID_PARAMS, validation.errors.join(', '));
      }
      
      const result = await postManager.publishPost(params);
      return {
        success: true,
        data: result,
        message: '发布笔记成功'
      };
    } catch (error) {
      logger.error('发布笔记失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '发布笔记失败');
    }
  },
  
  // 搜索笔记
  'xiaohongshu.post.search': async (params) => {
    try {
      logger.info('搜索笔记:', params);
      
      // 参数验证
      const validation = MCPParamsSchema.validatePostSearch(params);
      if (!validation.valid) {
        throw new MCPError(MCP_ERROR_CODES.INVALID_PARAMS, validation.errors.join(', '));
      }
      
      const results = await postManager.searchPosts(params);
      return {
        success: true,
        data: results,
        message: '搜索笔记成功'
      };
    } catch (error) {
      logger.error('搜索笔记失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '搜索笔记失败');
    }
  },
  
  // 获取推荐笔记
  'xiaohongshu.post.recommend': async (params) => {
    try {
      logger.info('获取推荐笔记:', params);
      
      // 参数验证
      const validation = MCPParamsSchema.validatePostRecommend(params);
      if (!validation.valid) {
        throw new MCPError(MCP_ERROR_CODES.INVALID_PARAMS, validation.errors.join(', '));
      }
      
      const results = await postManager.getRecommendPosts(params);
      return {
        success: true,
        data: results,
        message: '获取推荐笔记成功'
      };
    } catch (error) {
      logger.error('获取推荐笔记失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '获取推荐笔记失败');
    }
  },
  
  /**
   * 任务调度相关功能
   */
  
  // 创建任务
  'xiaohongshu.task.create': async (params) => {
    try {
      logger.info('创建任务:', params);
      
      // 参数验证
      const validation = MCPParamsSchema.validateTaskCreate(params);
      if (!validation.valid) {
        throw new MCPError(MCP_ERROR_CODES.INVALID_PARAMS, validation.errors.join(', '));
      }
      
      const task = await taskManager.createTask(params);
      return {
        success: true,
        data: task,
        message: '创建任务成功'
      };
    } catch (error) {
      logger.error('创建任务失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '创建任务失败');
    }
  },
  
  // 获取任务列表
  'xiaohongshu.task.list': async (params) => {
    try {
      logger.info('获取任务列表:', params);
      
      const tasks = await taskManager.listTasks(params);
      return {
        success: true,
        data: tasks,
        message: '获取任务列表成功'
      };
    } catch (error) {
      logger.error('获取任务列表失败:', error);
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '获取任务列表失败');
    }
  },
  
  // 取消任务
  'xiaohongshu.task.cancel': async (params) => {
    try {
      logger.info('取消任务:', params);
      
      // 参数验证
      const validation = MCPParamsSchema.validateTaskCancel(params);
      if (!validation.valid) {
        throw new MCPError(MCP_ERROR_CODES.INVALID_PARAMS, validation.errors.join(', '));
      }
      
      const result = await taskManager.cancelTask(params.taskId);
      return {
        success: true,
        data: result,
        message: '取消任务成功'
      };
    } catch (error) {
      logger.error('取消任务失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '取消任务失败');
    }
  },
  
  /**
   * 互动功能相关
   */
  
  // 点赞笔记
  'xiaohongshu.interaction.like': async (params) => {
    try {
      logger.info('MCP点赞请求:', params);
      
      // 调用互动处理器
      const result = await interactionHandlers['xiaohongshu.interaction.like'](params);
      
      if (!result.success) {
        throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, result.error);
      }
      
      return {
        success: true,
        data: result.data,
        message: result.message
      };
    } catch (error) {
      logger.error('MCP点赞失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '点赞操作失败');
    }
  },
  
  // 评论笔记
  'xiaohongshu.interaction.comment': async (params) => {
    try {
      logger.info('MCP评论请求:', params);
      
      // 调用互动处理器
      const result = await interactionHandlers['xiaohongshu.interaction.comment'](params);
      
      if (!result.success) {
        throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, result.error);
      }
      
      return {
        success: true,
        data: result.data,
        message: result.message
      };
    } catch (error) {
      logger.error('MCP评论失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '评论操作失败');
    }
  },
  
  // 关注用户
  'xiaohongshu.interaction.follow': async (params) => {
    try {
      logger.info('MCP关注请求:', params);
      
      // 调用互动处理器
      const result = await interactionHandlers['xiaohongshu.interaction.follow'](params);
      
      if (!result.success) {
        throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, result.error);
      }
      
      return {
        success: true,
        data: result.data,
        message: result.message
      };
    } catch (error) {
      logger.error('MCP关注失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '关注操作失败');
    }
  },
  
  // 批量点赞
  'xiaohongshu.interaction.batchLike': async (params) => {
    try {
      logger.info('MCP批量点赞请求:', params);
      
      // 调用互动处理器
      const result = await interactionHandlers['xiaohongshu.interaction.batchLike'](params);
      
      if (!result.success) {
        throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, result.error);
      }
      
      return {
        success: true,
        data: result.data,
        message: result.message
      };
    } catch (error) {
      logger.error('MCP批量点赞失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '批量点赞操作失败');
    }
  },
  
  // 获取互动历史
  'xiaohongshu.interaction.getHistory': async (params) => {
    try {
      logger.info('MCP获取互动历史请求:', params);
      
      // 调用互动处理器
      const result = await interactionHandlers['xiaohongshu.interaction.getHistory'](params);
      
      if (!result.success) {
        throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, result.error);
      }
      
      return {
        success: true,
        data: result.data,
        pagination: result.pagination,
        message: result.message
      };
    } catch (error) {
      logger.error('MCP获取互动历史失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '获取互动历史失败');
    }
  },
  
  // 获取互动统计
  'xiaohongshu.interaction.getStats': async (params) => {
    try {
      logger.info('MCP获取互动统计请求:', params);
      
      // 调用互动处理器
      const result = await interactionHandlers['xiaohongshu.interaction.getStats'](params);
      
      if (!result.success) {
        throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, result.error);
      }
      
      return {
        success: true,
        data: result.data,
        message: result.message
      };
    } catch (error) {
      logger.error('MCP获取互动统计失败:', error);
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '获取互动统计失败');
    }
  },
  
  /**
   * 系统相关功能
   */
  
  // 获取系统状态
  'xiaohongshu.system.status': async (params) => {
    try {
      logger.info('获取系统状态:', params);
      
      const status = {
        service: 'xiaohongshu-mcp-nodejs',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        accounts: {
          total: await accountManager.getTotalAccounts(),
          active: await accountManager.getActiveAccounts(),
          loggedIn: await accountManager.getLoggedInAccounts()
        },
        tasks: {
          total: await taskManager.getTotalTasks(),
          running: await taskManager.getRunningTasks(),
          completed: await taskManager.getCompletedTasks()
        }
      };
      
      return {
        success: true,
        data: status,
        message: '获取系统状态成功'
      };
    } catch (error) {
      logger.error('获取系统状态失败:', error);
      throw new MCPError(MCP_ERROR_CODES.INTERNAL_ERROR, '获取系统状态失败');
    }
  }
};