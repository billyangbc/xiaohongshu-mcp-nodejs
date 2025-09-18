/**
 * MCP协议处理器实现
 * 小红书各项功能的具体实现
 */

import { MCP_ERROR_CODES, MCPParamsSchema } from './protocol.js';
import { pool } from '../database/index.js';
import { AccountManager } from '../services/account.js';
import { PostManager } from '../services/post.js';
import { CommentManager } from '../services/comment.js';
import { UserManager } from '../services/user.js';
import { DiscoveryService } from '../services/discovery.js';
import { SystemService } from '../services/system.js';

// 初始化服务
const accountManager = new AccountManager();
const postManager = new PostManager();
const commentManager = new CommentManager();
const userManager = new UserManager();
const discoveryService = new DiscoveryService();
const systemService = new SystemService();

/**
 * MCP协议处理器映射
 */
export const mcpHandlers = {
  // 账号管理
  'xiaohongshu.account.list': async (params) => {
    const { status = 'all', limit = 20, offset = 0 } = MCPParamsSchema.accountList.parse(params);
    
    const query = `
      SELECT a.*, p.host as proxy_host, p.port as proxy_port, f.fingerprint_id
      FROM idea_xiaohongshu_accounts a
      LEFT JOIN idea_xiaohongshu_proxies p ON a.proxy_id = p.id
      LEFT JOIN idea_xiaohongshu_fingerprints f ON a.fingerprint_id = f.id
      WHERE ? = 'all' OR a.status = ?
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const [rows] = await pool.execute(query, [status, status, limit, offset]);
    
    return {
      accounts: rows.map(row => ({
        id: row.id,
        username: row.username,
        nickname: row.nickname,
        avatar_url: row.avatar_url,
        status: row.status,
        login_status: row.login_status,
        last_login_time: row.last_login_time,
        proxy: row.proxy_host ? {
          host: row.proxy_host,
          port: row.proxy_port
        } : null,
        fingerprint: row.fingerprint_id || null,
        created_at: row.created_at
      })),
      total: rows.length,
      limit,
      offset
    };
  },

  'xiaohongshu.account.add': async (params) => {
    const { username, phone, email, proxy_id, fingerprint_id } = MCPParamsSchema.accountAdd.parse(params);
    
    // 检查用户名是否已存在
    const [existing] = await pool.execute(
      'SELECT id FROM idea_xiaohongshu_accounts WHERE username = ?',
      [username]
    );
    
    if (existing.length > 0) {
      throw {
        code: MCP_ERROR_CODES.INVALID_PARAMS,
        message: `账号 ${username} 已存在`
      };
    }
    
    const [result] = await pool.execute(
      'INSERT INTO idea_xiaohongshu_accounts (username, phone, email, proxy_id, fingerprint_id) VALUES (?, ?, ?, ?, ?)',
      [username, phone, email, proxy_id, fingerprint_id]
    );
    
    return {
      account_id: result.insertId,
      username,
      status: 'active',
      created_at: new Date()
    };
  },

  'xiaohongshu.account.remove': async (params) => {
    const { account_id } = params;
    
    if (!account_id) {
      throw {
        code: MCP_ERROR_CODES.INVALID_PARAMS,
        message: '缺少account_id参数'
      };
    }
    
    const [result] = await pool.execute(
      'DELETE FROM idea_xiaohongshu_accounts WHERE id = ?',
      [account_id]
    );
    
    if (result.affectedRows === 0) {
      throw {
        code: MCP_ERROR_CODES.ACCOUNT_NOT_FOUND,
        message: `账号 ${account_id} 不存在`
      };
    }
    
    return { success: true, message: `账号 ${account_id} 已删除` };
  },

  'xiaohongshu.account.login': async (params) => {
    const { account_id, password, verification_code } = MCPParamsSchema.accountLogin.parse(params);
    
    const account = await accountManager.login(account_id, password, verification_code);
    
    return {
      success: true,
      account: {
        id: account.id,
        username: account.username,
        login_status: true,
        last_login_time: new Date()
      }
    };
  },

  'xiaohongshu.account.logout': async (params) => {
    const { account_id } = params;
    
    if (!account_id) {
      throw {
        code: MCP_ERROR_CODES.INVALID_PARAMS,
        message: '缺少account_id参数'
      };
    }
    
    await accountManager.logout(account_id);
    
    return { success: true, message: `账号 ${account_id} 已登出` };
  },

  'xiaohongshu.account.status': async (params) => {
    const { account_id } = params;
    
    if (!account_id) {
      throw {
        code: MCP_ERROR_CODES.INVALID_PARAMS,
        message: '缺少account_id参数'
      };
    }
    
    const [rows] = await pool.execute(
      'SELECT id, username, status, login_status, last_login_time FROM idea_xiaohongshu_accounts WHERE id = ?',
      [account_id]
    );
    
    if (rows.length === 0) {
      throw {
        code: MCP_ERROR_CODES.ACCOUNT_NOT_FOUND,
        message: `账号 ${account_id} 不存在`
      };
    }
    
    return {
      account: rows[0]
    };
  },

  // 内容发布
  'xiaohongshu.post.create': async (params) => {
    const postData = MCPParamsSchema.postCreate.parse(params);
    
    const post = await postManager.createPost(postData);
    
    return {
      post_id: post.id,
      status: post.status,
      created_at: post.created_at
    };
  },

  'xiaohongshu.post.publish': async (params) => {
    const { post_id } = params;
    
    if (!post_id) {
      throw {
        code: MCP_ERROR_CODES.INVALID_PARAMS,
        message: '缺少post_id参数'
      };
    }
    
    const result = await postManager.publishPost(post_id);
    
    return {
      success: true,
      post_id: result.post_id,
      published_time: result.published_time
    };
  },

  // 内容搜索
  'xiaohongshu.search': async (params) => {
    const searchData = MCPParamsSchema.search.parse(params);
    
    const results = await discoveryService.search(searchData);
    
    return {
      results: results.items,
      total: results.total,
      has_more: results.hasMore,
      next_offset: results.nextOffset
    };
  },

  // 用户信息获取
  'xiaohongshu.user.info': async (params) => {
    const { user_id } = MCPParamsSchema.userInfo.parse(params);
    
    const user = await userManager.getUserInfo(user_id);
    
    return {
      user: {
        id: user.id,
        user_id: user.user_id,
        nickname: user.nickname,
        avatar_url: user.avatar_url,
        description: user.description,
        follower_count: user.follower_count,
        following_count: user.following_count,
        post_count: user.post_count,
        like_count: user.like_count,
        is_verified: user.is_verified,
        verification_type: user.verification_type,
        location: user.location,
        gender: user.gender,
        age_range: user.age_range,
        last_active: user.last_active,
        created_at: user.created_at
      }
    };
  },

  // 评论管理
  'xiaohongshu.comment.add': async (params) => {
    const commentData = MCPParamsSchema.commentAdd.parse(params);
    
    const comment = await commentManager.addComment(commentData);
    
    return {
      comment_id: comment.comment_id,
      success: true,
      created_at: comment.created_at
    };
  },

  'xiaohongshu.comment.list': async (params) => {
    const { post_id, limit = 20, offset = 0 } = MCPParamsSchema.commentList.parse(params);
    
    const comments = await commentManager.getComments(post_id, limit, offset);
    
    return {
      comments: comments.items,
      total: comments.total,
      has_more: comments.hasMore,
      next_offset: comments.nextOffset
    };
  },

  // 系统管理
  'xiaohongshu.system.status': async (params) => {
    const status = await systemService.getSystemStatus();
    
    return {
      system: {
        version: status.version,
        uptime: status.uptime,
        memory_usage: status.memoryUsage,
        cpu_usage: status.cpuUsage,
        active_accounts: status.activeAccounts,
        active_tasks: status.activeTasks,
        total_requests: status.totalRequests,
        success_rate: status.successRate
      },
      timestamp: new Date()
    };
  },

  'xiaohongshu.system.config': async (params) => {
    const { config_key } = params;
    
    if (config_key) {
      const config = await systemService.getConfig(config_key);
      return { config };
    } else {
      const configs = await systemService.getAllConfigs();
      return { configs };
    }
  },

  'xiaohongshu.system.stats': async (params) => {
    const { date_range = '7d' } = params;
    
    const stats = await systemService.getStats(date_range);
    
    return {
      stats: {
        total_accounts: stats.totalAccounts,
        active_accounts: stats.activeAccounts,
        total_posts: stats.totalPosts,
        total_tasks: stats.totalTasks,
        success_tasks: stats.successTasks,
        failed_tasks: stats.failedTasks,
        daily_stats: stats.dailyStats
      },
      date_range: date_range
    };
  }
};

/**
 * 获取指定处理器
 * @param {string} method - MCP方法名
 * @returns {Function} 处理器函数
 */
export function getHandler(method) {
  const handler = mcpHandlers[method];
  
  if (!handler) {
    throw {
      code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
      message: `方法 ${method} 不存在`
    };
  }
  
  return handler;
}

/**
 * 获取所有支持的MCP方法
 * @returns {Array} 方法列表
 */
export function getSupportedMethods() {
  return Object.keys(mcpHandlers);
}