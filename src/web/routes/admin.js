/**
 * 管理后台路由 - 系统配置和管理接口
 * 提供系统管理、配置更新、监控等功能
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../../utils/logger');

function createAdminRoutes(databaseManager, taskManager, configManager) {
  const router = express.Router();
  const db = databaseManager;
  const config = configManager;

  // 文件上传配置
  const upload = multer({
    dest: 'temp/uploads/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('不支持的文件类型'));
      }
    }
  });

  /**
   * 获取系统配置
   * GET /api/admin/config
   */
  router.get('/config', async (req, res) => {
    try {
      const systemConfig = await config.getAll();
      res.json({ success: true, data: systemConfig });
    } catch (error) {
      logger.error('获取系统配置失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 更新系统配置
   * POST /api/admin/config
   */
  router.post('/config', async (req, res) => {
    try {
      const updates = req.body;
      await config.update(updates);
      res.json({ success: true, message: '配置更新成功' });
    } catch (error) {
      logger.error('更新系统配置失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 批量导入代理
   * POST /api/admin/proxies/import
   */
  router.post('/proxies/import', async (req, res) => {
    try {
      const { proxies } = req.body;
      if (!Array.isArray(proxies)) {
        return res.status(400).json({ success: false, error: '代理数据格式错误' });
      }

      const results = [];
      for (const proxy of proxies) {
        try {
          const [record, created] = await db.Proxy.findOrCreate({
            where: { host: proxy.host, port: proxy.port },
            defaults: proxy
          });
          results.push({ proxy: `${proxy.host}:${proxy.port}`, created });
        } catch (error) {
          results.push({ proxy: `${proxy.host}:${proxy.port}`, error: error.message });
        }
      }

      res.json({ success: true, data: results });
    } catch (error) {
      logger.error('导入代理失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 批量导入指纹
   * POST /api/admin/fingerprints/import
   */
  router.post('/fingerprints/import', async (req, res) => {
    try {
      const { fingerprints } = req.body;
      if (!Array.isArray(fingerprints)) {
        return res.status(400).json({ success: false, error: '指纹数据格式错误' });
      }

      const results = [];
      for (const fp of fingerprints) {
        try {
          const [record, created] = await db.Fingerprint.findOrCreate({
            where: { fingerprint_id: fp.fingerprint_id },
            defaults: fp
          });
          results.push({ fingerprint_id: fp.fingerprint_id, created });
        } catch (error) {
          results.push({ fingerprint_id: fp.fingerprint_id, error: error.message });
        }
      }

      res.json({ success: true, data: results });
    } catch (error) {
      logger.error('导入指纹失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 创建新账号
   * POST /api/admin/accounts
   */
  router.post('/accounts', async (req, res) => {
    try {
      const { username, password, phone, email, nickname, proxy_id, fingerprint_id } = req.body;

      // 验证必填字段
      if (!username) {
        return res.status(400).json({ success: false, error: '用户名不能为空' });
      }

      // 检查用户名是否已存在
      const existing = await db.Account.findOne({ where: { username } });
      if (existing) {
        return res.status(400).json({ success: false, error: '用户名已存在' });
      }

      const account = await db.Account.create({
        username,
        password: password || null,
        phone,
        email,
        nickname,
        proxy_id,
        fingerprint_id,
        status: 'active',
        login_status: false
      });

      res.json({ success: true, data: account });
    } catch (error) {
      logger.error('创建账号失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 更新账号信息
   * PUT /api/admin/accounts/:id
   */
  router.put('/accounts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const account = await db.Account.findByPk(id);
      if (!account) {
        return res.status(404).json({ success: false, error: '账号不存在' });
      }

      // 不允许更新敏感字段
      delete updates.cookies_encrypted;
      delete updates.session_data;

      await account.update(updates);
      res.json({ success: true, data: account });
    } catch (error) {
      logger.error('更新账号失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 删除账号
   * DELETE /api/admin/accounts/:id
   */
  router.delete('/accounts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const account = await db.Account.findByPk(id);

      if (!account) {
        return res.status(404).json({ success: false, error: '账号不存在' });
      }

      await account.destroy();
      res.json({ success: true, message: '账号删除成功' });
    } catch (error) {
      logger.error('删除账号失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 批量创建任务
   * POST /api/admin/tasks/batch
   */
  router.post('/tasks/batch', async (req, res) => {
    try {
      const { tasks } = req.body;
      if (!Array.isArray(tasks)) {
        return res.status(400).json({ success: false, error: '任务数据格式错误' });
      }

      const results = [];
      for (const taskData of tasks) {
        try {
          const task = await taskManager.createTask(taskData);
          results.push({ task_id: task.id, success: true });
        } catch (error) {
          results.push({ task_data: taskData, success: false, error: error.message });
        }
      }

      res.json({ success: true, data: results });
    } catch (error) {
      logger.error('批量创建任务失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 取消任务
   * DELETE /api/admin/tasks/:id
   */
  router.delete('/tasks/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await taskManager.cancelTask(id);

      if (result.success) {
        res.json({ success: true, message: '任务取消成功' });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      logger.error('取消任务失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 重新运行失败任务
   * POST /api/admin/tasks/:id/retry
   */
  router.post('/tasks/:id/retry', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await taskManager.retryTask(id);

      if (result.success) {
        res.json({ success: true, message: '任务重试成功', data: result.task });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      logger.error('重试任务失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 系统健康检查
   * GET /api/admin/health
   */
  router.get('/health', async (req, res) => {
    try {
      const health = {
        timestamp: new Date().toISOString(),
        database: await checkDatabaseHealth(),
        task_queue: await checkTaskQueueHealth(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        version: require('../../../package.json').version
      };

      res.json({ success: true, data: health });
    } catch (error) {
      logger.error('健康检查失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 获取系统日志
   * GET /api/admin/logs
   */
  router.get('/logs', async (req, res) => {
    try {
      const { level = 'info', limit = 100 } = req.query;
      const logFile = path.join(process.cwd(), 'logs', `${level}.log`);

      try {
        await fs.access(logFile);
        const content = await fs.readFile(logFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim()).slice(-limit);
        res.json({ success: true, data: lines });
      } catch (error) {
        res.json({ success: true, data: [] });
      }
    } catch (error) {
      logger.error('获取日志失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 清理系统日志
   * DELETE /api/admin/logs
   */
  router.delete('/logs', async (req, res) => {
    try {
      const { level } = req.query;
      const logDir = path.join(process.cwd(), 'logs');

      if (level) {
        const logFile = path.join(logDir, `${level}.log`);
        await fs.writeFile(logFile, '');
      } else {
        // 清理所有日志文件
        const files = await fs.readdir(logDir);
        for (const file of files) {
          if (file.endsWith('.log')) {
            await fs.writeFile(path.join(logDir, file), '');
          }
        }
      }

      res.json({ success: true, message: '日志清理成功' });
    } catch (error) {
      logger.error('清理日志失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 文件上传接口
   * POST /api/admin/upload
   */
  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: '未上传文件' });
      }

      const { type = 'image' } = req.body;
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', type);
      
      await fs.mkdir(uploadDir, { recursive: true });
      
      const filename = `${Date.now()}-${req.file.originalname}`;
      const filePath = path.join(uploadDir, filename);
      
      await fs.rename(req.file.path, filePath);

      const url = `/uploads/${type}/${filename}`;
      res.json({ success: true, data: { url, filename, size: req.file.size } });
    } catch (error) {
      logger.error('文件上传失败', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 辅助函数
  async function checkDatabaseHealth() {
    try {
      await db.sequelize.authenticate();
      return { status: 'healthy', message: '数据库连接正常' };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  async function checkTaskQueueHealth() {
    try {
      const stats = await taskManager.getTaskStats();
      return {
        status: 'healthy',
        pending: stats.pending,
        running: stats.running,
        completed: stats.completed,
        failed: stats.failed
      };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  return router;
}

module.exports = createAdminRoutes;