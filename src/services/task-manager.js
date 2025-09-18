/**
 * 任务管理器
 * 负责任务的创建、调度、执行和监控
 */

import { logger } from '../utils/logger.js';
import { query, transaction } from '../database/index.js';
import Queue from 'bull';
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';

/**
 * 任务管理器类
 */
export class TaskManager {
  constructor() {
    // 初始化任务队列
    this.queues = {
      publish: new Queue('publish', {
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD
        }
      }),
      crawl: new Queue('crawl', {
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD
        }
      }),
      interaction: new Queue('interaction', {
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD
        }
      }),
      maintenance: new Queue('maintenance', {
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD
        }
      })
    };
    
    // 定时任务调度器
    this.cronJobs = new Map();
    
    // 任务处理器映射
    this.processors = new Map();
    
    // 初始化队列处理器
    this.initializeProcessors();
    
    // 启动定时任务清理器
    this.startCleanupScheduler();
  }
  
  /**
   * 初始化队列处理器
   */
  initializeProcessors() {
    // 发布任务处理器
    this.queues.publish.process(async (job) => {
      return await this.processPublishTask(job.data);
    });
    
    // 爬取任务处理器
    this.queues.crawl.process(async (job) => {
      return await this.processCrawlTask(job.data);
    });
    
    // 互动任务处理器
    this.queues.interaction.process(async (job) => {
      return await this.processInteractionTask(job.data);
    });
    
    // 维护任务处理器
    this.queues.maintenance.process(async (job) => {
      return await this.processMaintenanceTask(job.data);
    });
    
    // 监听队列事件
    this.setupQueueEventListeners();
  }
  
  /**
   * 设置队列事件监听器
   */
  setupQueueEventListeners() {
    Object.values(this.queues).forEach(queue => {
      queue.on('completed', (job, result) => {
        logger.info(`任务完成: ${job.id} (${queue.name})`, result);
      });
      
      queue.on('failed', (job, err) => {
        logger.error(`任务失败: ${job.id} (${queue.name})`, err);
      });
      
      queue.on('stalled', (job) => {
        logger.warn(`任务停滞: ${job.id} (${queue.name})`);
      });
    });
  }
  
  /**
   * 创建任务
   * @param {Object} taskData - 任务数据
   * @returns {Promise<Object>} 创建结果
   */
  async createTask(taskData) {
    const {
      taskType,
      accountId,
      taskData: data,
      scheduledTime,
      cronExpression,
      priority = 1,
      maxRetries = 3
    } = taskData;
    
    try {
      const taskId = uuidv4();
      
      // 验证任务类型
      const validTaskTypes = ['publish_post', 'crawl_user', 'crawl_post', 'like_post', 'comment_post', 'follow_user', 'maintenance'];
      if (!validTaskTypes.includes(taskType)) {
        throw new Error(`无效的任务类型: ${taskType}`);
      }
      
      // 确定队列类型
      let queueType;
      if (taskType.includes('publish')) {
        queueType = 'publish';
      } else if (taskType.includes('crawl')) {
        queueType = 'crawl';
      } else if (taskType.includes('like') || taskType.includes('comment') || taskType.includes('follow')) {
        queueType = 'interaction';
      } else {
        queueType = 'maintenance';
      }
      
      // 保存到数据库
      const result = await query(
        `INSERT INTO idea_xiaohongshu_tasks 
         (id, task_type, account_id, task_data, cron_expression, status, priority, max_retries, scheduled_time) 
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [taskId, taskType, accountId, JSON.stringify(data), cronExpression, priority, maxRetries, scheduledTime]
      );
      
      if (cronExpression) {
        // 创建定时任务
        await this.createCronTask(taskId, taskType, cronExpression, data);
      } else if (scheduledTime) {
        // 创建延迟任务
        const delay = new Date(scheduledTime).getTime() - Date.now();
        if (delay > 0) {
          await this.queues[queueType].add({
            taskId,
            taskType,
            accountId,
            data,
            priority
          }, {
            delay,
            attempts: maxRetries,
            backoff: {
              type: 'exponential',
              delay: 2000
            }
          });
        }
      } else {
        // 立即执行
        await this.queues[queueType].add({
          taskId,
          taskType,
          accountId,
          data,
          priority
        }, {
          attempts: maxRetries,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        });
      }
      
      // 更新任务状态
      await query(
        'UPDATE idea_xiaohongshu_tasks SET status = "queued" WHERE id = ?',
        [taskId]
      );
      
      logger.info(`创建任务成功: ${taskId} (${taskType})`);
      
      return {
        success: true,
        taskId,
        status: 'queued',
        scheduledTime,
        message: '任务创建成功'
      };
    } catch (error) {
      logger.error('创建任务失败:', error);
      throw error;
    }
  }
  
  /**
   * 创建定时任务
   * @param {string} taskId - 任务ID
   * @param {string} taskType - 任务类型
   * @param {string} cronExpression - Cron表达式
   * @param {Object} data - 任务数据
   */
  async createCronTask(taskId, taskType, cronExpression, data) {
    try {
      // 验证Cron表达式
      if (!cron.validate(cronExpression)) {
        throw new Error('无效的Cron表达式');
      }
      
      // 创建Cron任务
      const job = cron.schedule(cronExpression, async () => {
        try {
          logger.info(`执行定时任务: ${taskId} (${taskType})`);
          
          // 获取任务信息
          const task = await query(
            'SELECT * FROM idea_xiaohongshu_tasks WHERE id = ?',
            [taskId]
          );
          
          if (task.length === 0) {
            logger.warn(`定时任务不存在: ${taskId}`);
            return;
          }
          
          const taskData = task[0];
          
          // 创建新的执行实例
          await this.createTask({
            taskType,
            accountId: taskData.account_id,
            taskData: JSON.parse(taskData.task_data),
            priority: taskData.priority
          });
          
        } catch (error) {
          logger.error(`定时任务执行失败: ${taskId}`, error);
        }
      }, {
        scheduled: false // 手动启动
      });
      
      // 保存Cron任务引用
      this.cronJobs.set(taskId, job);
      
      // 启动任务
      job.start();
      
      logger.info(`创建定时任务成功: ${taskId} (${cronExpression})`);
    } catch (error) {
      logger.error('创建定时任务失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理发布任务
   * @param {Object} taskData - 任务数据
   * @returns {Promise<Object>} 处理结果
   */
  async processPublishTask(taskData) {
    const { taskId, taskType, accountId, data } = taskData;
    
    try {
      // 更新任务状态
      await query(
        'UPDATE idea_xiaohongshu_tasks SET status = "running", started_time = NOW() WHERE id = ?',
        [taskId]
      );
      
      logger.info(`开始处理发布任务: ${taskId}`);
      
      // 根据任务类型处理
      let result;
      if (taskType === 'publish_post') {
        // 发布笔记
        const PostManager = (await import('./post-manager.js')).PostManager;
        const postManager = new PostManager();
        result = await postManager.publishPost(data.postId);
      }
      
      // 更新任务完成状态
      await query(
        `UPDATE idea_xiaohongshu_tasks 
         SET status = "completed", completed_time = NOW(), result_data = ? 
         WHERE id = ?`,
        [JSON.stringify(result), taskId]
      );
      
      logger.info(`发布任务完成: ${taskId}`);
      
      return result;
    } catch (error) {
      logger.error(`发布任务失败: ${taskId}`, error);
      
      // 更新任务失败状态
      await query(
        `UPDATE idea_xiaohongshu_tasks 
         SET status = "failed", completed_time = NOW(), error_message = ? 
         WHERE id = ?`,
        [error.message, taskId]
      );
      
      throw error;
    }
  }
  
  /**
   * 处理爬取任务
   * @param {Object} taskData - 任务数据
   * @returns {Promise<Object>} 处理结果
   */
  async processCrawlTask(taskData) {
    const { taskId, taskType, accountId, data } = taskData;
    
    try {
      // 更新任务状态
      await query(
        'UPDATE idea_xiaohongshu_tasks SET status = "running", started_time = NOW() WHERE id = ?',
        [taskId]
      );
      
      logger.info(`开始处理爬取任务: ${taskId}`);
      
      // 根据任务类型处理
      let result;
      if (taskType === 'crawl_user') {
        // 爬取用户信息
        // TODO: 实现用户爬取逻辑
        result = { success: true, message: '用户爬取任务完成' };
      } else if (taskType === 'crawl_post') {
        // 爬取笔记信息
        // TODO: 实现笔记爬取逻辑
        result = { success: true, message: '笔记爬取任务完成' };
      }
      
      // 更新任务完成状态
      await query(
        `UPDATE idea_xiaohongshu_tasks 
         SET status = "completed", completed_time = NOW(), result_data = ? 
         WHERE id = ?`,
        [JSON.stringify(result), taskId]
      );
      
      logger.info(`爬取任务完成: ${taskId}`);
      
      return result;
    } catch (error) {
      logger.error(`爬取任务失败: ${taskId}`, error);
      
      // 更新任务失败状态
      await query(
        `UPDATE idea_xiaohongshu_tasks 
         SET status = "failed", completed_time = NOW(), error_message = ? 
         WHERE id = ?`,
        [error.message, taskId]
      );
      
      throw error;
    }
  }
  
  /**
   * 处理互动任务
   * @param {Object} taskData - 任务数据
   * @returns {Promise<Object>} 处理结果
   */
  async processInteractionTask(taskData) {
    const { taskId, taskType, accountId, data } = taskData;
    
    try {
      // 更新任务状态
      await query(
        'UPDATE idea_xiaohongshu_tasks SET status = "running", started_time = NOW() WHERE id = ?',
        [taskId]
      );
      
      logger.info(`开始处理互动任务: ${taskId}`);
      
      // 根据任务类型处理
      let result;
      if (taskType === 'like_post') {
        // 点赞笔记
        // TODO: 实现点赞逻辑
        result = { success: true, message: '点赞任务完成' };
      } else if (taskType === 'comment_post') {
        // 评论笔记
        // TODO: 实现评论逻辑
        result = { success: true, message: '评论任务完成' };
      } else if (taskType === 'follow_user') {
        // 关注用户
        // TODO: 实现关注逻辑
        result = { success: true, message: '关注任务完成' };
      }
      
      // 更新任务完成状态
      await query(
        `UPDATE idea_xiaohongshu_tasks 
         SET status = "completed", completed_time = NOW(), result_data = ? 
         WHERE id = ?`,
        [JSON.stringify(result), taskId]
      );
      
      logger.info(`互动任务完成: ${taskId}`);
      
      return result;
    } catch (error) {
      logger.error(`互动任务失败: ${taskId}`, error);
      
      // 更新任务失败状态
      await query(
        `UPDATE idea_xiaohongshu_tasks 
         SET status = "failed", completed_time = NOW(), error_message = ? 
         WHERE id = ?`,
        [error.message, taskId]
      );
      
      throw error;
    }
  }
  
  /**
   * 处理维护任务
   * @param {Object} taskData - 任务数据
   * @returns {Promise<Object>} 处理结果
   */
  async processMaintenanceTask(taskData) {
    const { taskId, taskType, accountId, data } = taskData;
    
    try {
      // 更新任务状态
      await query(
        'UPDATE idea_xiaohongshu_tasks SET status = "running", started_time = NOW() WHERE id = ?',
        [taskId]
      );
      
      logger.info(`开始处理维护任务: ${taskId}`);
      
      // 维护任务处理
      let result;
      if (taskType === 'maintenance') {
        // 清理过期数据
        await this.cleanupExpiredData();
        result = { success: true, message: '数据清理完成' };
      }
      
      // 更新任务完成状态
      await query(
        `UPDATE idea_xiaohongshu_tasks 
         SET status = "completed", completed_time = NOW(), result_data = ? 
         WHERE id = ?`,
        [JSON.stringify(result), taskId]
      );
      
      logger.info(`维护任务完成: ${taskId}`);
      
      return result;
    } catch (error) {
      logger.error(`维护任务失败: ${taskId}`, error);
      
      // 更新任务失败状态
      await query(
        `UPDATE idea_xiaohongshu_tasks 
         SET status = "failed", completed_time = NOW(), error_message = ? 
         WHERE id = ?`,
        [error.message, taskId]
      );
      
      throw error;
    }
  }
  
  /**
   * 获取任务状态
   * @param {string} taskId - 任务ID
   * @returns {Promise<Object>} 任务状态
   */
  async getTaskStatus(taskId) {
    try {
      const tasks = await query(
        'SELECT * FROM idea_xiaohongshu_tasks WHERE id = ?',
        [taskId]
      );
      
      if (tasks.length === 0) {
        throw new Error('任务不存在');
      }
      
      const task = tasks[0];
      
      return {
        taskId: task.id,
        taskType: task.task_type,
        accountId: task.account_id,
        status: task.status,
        priority: task.priority,
        retryCount: task.retry_count,
        maxRetries: task.max_retries,
        scheduledTime: task.scheduled_time,
        startedTime: task.started_time,
        completedTime: task.completed_time,
        errorMessage: task.error_message,
        resultData: task.result_data ? JSON.parse(task.result_data) : null,
        createdAt: task.created_at,
        updatedAt: task.updated_at
      };
    } catch (error) {
      logger.error('获取任务状态失败:', error);
      throw error;
    }
  }
  
  /**
   * 取消任务
   * @param {string} taskId - 任务ID
   * @returns {Promise<Object>} 取消结果
   */
  async cancelTask(taskId) {
    try {
      // 获取任务信息
      const task = await query(
        'SELECT * FROM idea_xiaohongshu_tasks WHERE id = ?',
        [taskId]
      );
      
      if (task.length === 0) {
        throw new Error('任务不存在');
      }
      
      const taskData = task[0];
      
      // 检查任务状态
      if (taskData.status === 'completed' || taskData.status === 'failed') {
        throw new Error('任务已完成或已失败，无法取消');
      }
      
      if (taskData.status === 'running') {
        throw new Error('任务正在执行中，无法取消');
      }
      
      // 更新任务状态
      await query(
        'UPDATE idea_xiaohongshu_tasks SET status = "cancelled", completed_time = NOW() WHERE id = ?',
        [taskId]
      );
      
      // 如果是定时任务，停止Cron任务
      if (taskData.cron_expression && this.cronJobs.has(taskId)) {
        const job = this.cronJobs.get(taskId);
        job.stop();
        this.cronJobs.delete(taskId);
      }
      
      logger.info(`任务已取消: ${taskId}`);
      
      return {
        success: true,
        message: '任务已取消'
      };
    } catch (error) {
      logger.error('取消任务失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取任务列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 任务列表
   */
  async getTaskList(params) {
    const {
      accountId,
      taskType,
      status,
      page = 1,
      pageSize = 20,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = params;
    
    try {
      let whereClause = 'WHERE 1=1';
      const queryParams = [];
      
      if (accountId) {
        whereClause += ' AND account_id = ?';
        queryParams.push(accountId);
      }
      
      if (taskType) {
        whereClause += ' AND task_type = ?';
        queryParams.push(taskType);
      }
      
      if (status) {
        whereClause += ' AND status = ?';
        queryParams.push(status);
      }
      
      // 获取总数
      const countResult = await query(
        `SELECT COUNT(*) as total FROM idea_xiaohongshu_tasks ${whereClause}`,
        queryParams
      );
      
      const total = countResult[0].total;
      
      // 获取分页数据
      const offset = (page - 1) * pageSize;
      queryParams.push(offset, pageSize);
      
      const tasks = await query(
        `SELECT * FROM idea_xiaohongshu_tasks 
         ${whereClause} 
         ORDER BY ${sortBy} ${sortOrder.toUpperCase()} 
         LIMIT ? OFFSET ?`,
        queryParams
      );
      
      return {
        data: tasks,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      };
    } catch (error) {
      logger.error('获取任务列表失败:', error);
      throw error;
    }
  }
  
  /**
   * 清理过期数据
   */
  async cleanupExpiredData() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // 删除30天前的已完成任务
      const result = await query(
        'DELETE FROM idea_xiaohongshu_tasks WHERE status IN ("completed", "failed", "cancelled") AND completed_time < ?',
        [thirtyDaysAgo]
      );
      
      logger.info(`清理过期数据完成: 删除 ${result.affectedRows} 条记录`);
    } catch (error) {
      logger.error('清理过期数据失败:', error);
    }
  }
  
  /**
   * 启动清理调度器
   */
  startCleanupScheduler() {
    // 每天凌晨2点执行清理任务
    cron.schedule('0 2 * * *', async () => {
      try {
        await this.cleanupExpiredData();
      } catch (error) {
        logger.error('定时清理任务失败:', error);
      }
    });
    
    logger.info('启动清理调度器');
  }
  
  /**
   * 获取队列统计信息
   * @returns {Object} 统计信息
   */
  async getQueueStats() {
    const stats = {};
    
    for (const [queueName, queue] of Object.entries(this.queues)) {
      try {
        const jobCounts = await queue.getJobCounts();
        stats[queueName] = jobCounts;
      } catch (error) {
        logger.error(`获取队列统计失败: ${queueName}`, error);
        stats[queueName] = {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0
        };
      }
    }
    
    return stats;
  }
  
  /**
   * 关闭所有队列
   */
  async close() {
    try {
      // 停止所有定时任务
      for (const job of this.cronJobs.values()) {
        job.stop();
      }
      this.cronJobs.clear();
      
      // 关闭所有队列
      await Promise.all(
        Object.values(this.queues).map(queue => queue.close())
      );
      
      logger.info('任务管理器已关闭');
    } catch (error) {
      logger.error('关闭任务管理器失败:', error);
    }
  }
}