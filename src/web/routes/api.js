/**
 * API路由 - 数据查询和统计接口
 * 提供管理后台所需的各种数据接口
 */

import express from 'express';
import { logger } from '../../utils/logger.js';

function createAPIRoutes(databaseManager, taskManager) {
  const router = express.Router();
  const db = databaseManager;

  /**
   * 获取系统概览数据
   * GET /api/dashboard/overview
   */
  router.get('/overview', async (req, res) => {
    try {
      const [
        totalAccounts,
        activeAccounts,
        totalPosts,
        publishedPosts,
        totalTasks,
        pendingTasks,
        runningTasks,
        completedTasks
      ] = await Promise.all([
        db.Account.count(),
        db.Account.count({ where: { status: 'active' } }),
        db.Post.count(),
        db.Post.count({ where: { status: 'published' } }),
        db.Task.count(),
        db.Task.count({ where: { status: 'pending' } }),
        db.Task.count({ where: { status: 'running' } }),
        db.Task.count({ where: { status: 'completed' } })
      ]);

      res.json({
        success: true,
        data: {
          accounts: { total: totalAccounts, active: activeAccounts },
          posts: { total: totalPosts, published: publishedPosts },
          tasks: { total: totalTasks, pending: pendingTasks, running: runningTasks, completed: completedTasks }
        }
      });
    } catch (error) {
      logger.error('获取概览数据失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 获取账号列表
   * GET /api/dashboard/accounts
   */
  router.get('/accounts', async (req, res) => {
    try {
      const { page = 1, limit = 20, status, search } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      if (status) where.status = status;
      if (search) {
        where[db.Sequelize.Op.or] = [
          { username: { [db.Sequelize.Op.like]: `%${search}%` } },
          { nickname: { [db.Sequelize.Op.like]: `%${search}%` } },
          { email: { [db.Sequelize.Op.like]: `%${search}%` } }
        ];
      }

      const { count, rows } = await db.Account.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']],
        include: [
          { model: db.Proxy, attributes: ['host', 'port', 'country'] },
          { model: db.Fingerprint, attributes: ['fingerprint_id'] }
        ]
      });

      res.json({
        success: true,
        data: {
          accounts: rows,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / limit)
          }
        }
      });
    } catch (error) {
      logger.error('获取账号列表失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 获取账号详情
   * GET /api/dashboard/accounts/:id
   */
  router.get('/accounts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const account = await db.Account.findByPk(id, {
        include: [
          { model: db.Proxy },
          { model: db.Fingerprint },
          {
            model: db.Post,
            attributes: ['id', 'title', 'status', 'created_at'],
            limit: 5,
            order: [['created_at', 'DESC']]
          }
        ]
      });

      if (!account) {
        return res.status(404).json({ success: false, error: '账号不存在' });
      }

      res.json({ success: true, data: account });
    } catch (error) {
      logger.error('获取账号详情失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 获取笔记列表
   * GET /api/dashboard/posts
   */
  router.get('/posts', async (req, res) => {
    try {
      const { page = 1, limit = 20, account_id, status, search } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      if (account_id) where.account_id = account_id;
      if (status) where.status = status;
      if (search) {
        where[db.Sequelize.Op.or] = [
          { title: { [db.Sequelize.Op.like]: `%${search}%` } },
          { content: { [db.Sequelize.Op.like]: `%${search}%` } }
        ];
      }

      const { count, rows } = await db.Post.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']],
        include: [
          { model: db.Account, attributes: ['username', 'nickname'] }
        ]
      });

      res.json({
        success: true,
        data: {
          posts: rows,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / limit)
          }
        }
      });
    } catch (error) {
      logger.error('获取笔记列表失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 获取任务列表
   * GET /api/dashboard/tasks
   */
  router.get('/tasks', async (req, res) => {
    try {
      const { page = 1, limit = 20, account_id, status, type } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      if (account_id) where.account_id = account_id;
      if (status) where.status = status;
      if (type) where.task_type = type;

      const { count, rows } = await db.Task.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']],
        include: [
          { model: db.Account, attributes: ['username', 'nickname'] }
        ]
      });

      res.json({
        success: true,
        data: {
          tasks: rows,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / limit)
          }
        }
      });
    } catch (error) {
      logger.error('获取任务列表失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 获取任务统计
   * GET /api/dashboard/task-stats
   */
  router.get('/task-stats', async (req, res) => {
    try {
      const stats = await taskManager.getTaskStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('获取任务统计失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 获取代理列表
   * GET /api/dashboard/proxies
   */
  router.get('/proxies', async (req, res) => {
    try {
      const { page = 1, limit = 20, country, status } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      if (country) where.country = country;
      if (status) where.status = status;

      const { count, rows } = await db.Proxy.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      res.json({
        success: true,
        data: {
          proxies: rows,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / limit)
          }
        }
      });
    } catch (error) {
      logger.error('获取代理列表失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 获取系统实时状态
   * GET /api/dashboard/system-status
   */
  router.get('/system-status', async (req, res) => {
    try {
      const status = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        timestamp: new Date().toISOString(),
        version: (await import('../../../package.json', { with: { type: 'json' } })).default.version
      };

      res.json({ success: true, data: status });
    } catch (error) {
      logger.error('获取系统状态失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 获取数据分析
   * GET /api/dashboard/analytics
   */
  router.get('/analytics', async (req, res) => {
    try {
      const { start_date, end_date, account_id } = req.query;

      const where = {};
      if (start_date && end_date) {
        where.date = {
          [db.Sequelize.Op.between]: [start_date, end_date]
        };
      }
      if (account_id) where.account_id = account_id;

      const analytics = await db.Analytics.findAll({
        where,
        order: [['date', 'DESC'], ['account_id', 'ASC']],
        include: [
          { model: db.Account, attributes: ['username', 'nickname'] }
        ]
      });

      res.json({ success: true, data: analytics });
    } catch (error) {
      logger.error('获取数据分析失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

export default createAPIRoutes;