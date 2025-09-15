/**
 * 小红书任务管理器
 * 负责任务调度、管理和执行监控
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const logger = require('../utils/logger');
const TaskExecutor = require('./task-executor');

class TaskManager extends EventEmitter {
  constructor(databaseManager, browserManager) {
    super();
    this.db = databaseManager;
    this.browserManager = browserManager;
    this.executor = new TaskExecutor(browserManager);
    this.scheduledTasks = new Map();
    this.runningTasks = new Map();
    this.isInitialized = false;
  }

  /**
   * 初始化任务管理器
   */
  async initialize() {
    try {
      logger.info('正在初始化任务管理器...');
      
      // 恢复未完成的任务
      await this.recoverPendingTasks();
      
      // 启动定时任务调度器
      this.startScheduler();
      
      this.isInitialized = true;
      logger.info('任务管理器初始化完成');
      
      this.emit('initialized');
    } catch (error) {
      logger.error('任务管理器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 恢复未完成的任务
   */
  async recoverPendingTasks() {
    try {
      const pendingTasks = await this.db.Task.findAll({
        where: {
          status: ['pending', 'running']
        },
        order: [['created_at', 'ASC']]
      });

      for (const task of pendingTasks) {
        if (task.status === 'running') {
          // 标记为失败，重新排队
          await task.update({
            status: 'failed',
            error_message: '系统重启导致任务中断',
            retry_count: task.retry_count + 1
          });
        }
        
        // 重新调度任务
        if (task.retry_count < task.max_retries) {
          await this.scheduleTask(task);
        }
      }

      logger.info(`已恢复 ${pendingTasks.length} 个未完成任务`);
    } catch (error) {
      logger.error('恢复未完成任务失败:', error);
    }
  }

  /**
   * 启动定时任务调度器
   */
  startScheduler() {
    // 每30秒检查一次待执行任务
    cron.schedule('*/30 * * * * *', async () => {
      try {
        await this.processPendingTasks();
      } catch (error) {
        logger.error('处理待执行任务失败:', error);
      }
    });

    // 每分钟清理已完成的任务
    cron.schedule('* * * * *', async () => {
      try {
        await this.cleanupCompletedTasks();
      } catch (error) {
        logger.error('清理已完成任务失败:', error);
      }
    });

    logger.info('任务调度器已启动');
  }

  /**
   * 处理待执行任务
   */
  async processPendingTasks() {
    try {
      const pendingTasks = await this.db.Task.findAll({
        where: {
          status: 'pending',
          scheduled_time: {
            [this.db.Sequelize.Op.lte]: new Date()
          }
        },
        order: [['priority', 'DESC'], ['created_at', 'ASC']],
        limit: 10
      });

      for (const task of pendingTasks) {
        await this.executeTask(task);
      }
    } catch (error) {
      logger.error('处理待执行任务失败:', error);
    }
  }

  /**
   * 创建新任务
   */
  async createTask(taskData) {
    try {
      const task = await this.db.Task.create({
        id: uuidv4(),
        task_type: taskData.type,
        account_id: taskData.accountId,
        task_data: taskData.data || {},
        cron_expression: taskData.cronExpression,
        priority: taskData.priority || 1,
        max_retries: taskData.maxRetries || 3,
        scheduled_time: taskData.scheduledTime || new Date()
      });

      logger.info(`创建任务成功: ${task.id} (${task.task_type})`);
      
      // 如果是立即执行的任务
      if (!taskData.cronExpression && (!taskData.scheduledTime || taskData.scheduledTime <= new Date())) {
        await this.executeTask(task);
      } else if (taskData.cronExpression) {
        await this.scheduleCronTask(task);
      }

      this.emit('task:created', task);
      return task;
    } catch (error) {
      logger.error('创建任务失败:', error);
      throw error;
    }
  }

  /**
   * 执行单个任务
   */
  async executeTask(task) {
    try {
      if (this.runningTasks.has(task.id)) {
        logger.warn(`任务 ${task.id} 已在运行中，跳过`);
        return;
      }

      await task.update({
        status: 'running',
        started_time: new Date()
      });

      this.runningTasks.set(task.id, task);
      this.emit('task:started', task);

      logger.info(`开始执行任务: ${task.id} (${task.task_type})`);

      const result = await this.executor.execute(task);

      await task.update({
        status: 'completed',
        completed_time: new Date(),
        result_data: result,
        error_message: null
      });

      this.runningTasks.delete(task.id);
      this.emit('task:completed', task);

      logger.info(`任务执行完成: ${task.id}`);
      return result;
    } catch (error) {
      await this.handleTaskError(task, error);
      throw error;
    }
  }

  /**
   * 处理任务错误
   */
  async handleTaskError(task, error) {
    const retryCount = task.retry_count + 1;
    const maxRetries = task.max_retries;

    if (retryCount < maxRetries) {
      // 计算下次重试时间（指数退避）
      const delay = Math.min(Math.pow(2, retryCount) * 60000, 3600000); // 最多1小时
      const nextRetryTime = new Date(Date.now() + delay);

      await task.update({
        status: 'pending',
        retry_count: retryCount,
        scheduled_time: nextRetryTime,
        error_message: error.message
      });

      logger.warn(`任务 ${task.id} 执行失败，${retryCount}/${maxRetries} 次重试，下次重试时间: ${nextRetryTime}`);
    } else {
      await task.update({
        status: 'failed',
        completed_time: new Date(),
        error_message: error.message
      });

      this.runningTasks.delete(task.id);
      this.emit('task:failed', task);

      logger.error(`任务 ${task.id} 最终失败:`, error);
    }
  }

  /**
   * 调度定时任务
   */
  async scheduleCronTask(task) {
    if (!task.cron_expression) return;

    try {
      const scheduledTask = cron.schedule(task.cron_expression, async () => {
        try {
          // 创建新的任务实例
          const newTask = await this.db.Task.create({
            id: uuidv4(),
            task_type: task.task_type,
            account_id: task.account_id,
            task_data: task.task_data,
            priority: task.priority,
            max_retries: task.max_retries,
            scheduled_time: new Date()
          });

          await this.executeTask(newTask);
        } catch (error) {
          logger.error(`定时任务 ${task.id} 执行失败:`, error);
        }
      }, {
        scheduled: false
      });

      this.scheduledTasks.set(task.id, scheduledTask);
      scheduledTask.start();

      logger.info(`已调度定时任务: ${task.id} (${task.cron_expression})`);
    } catch (error) {
      logger.error(`调度定时任务失败: ${task.id}`, error);
    }
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId) {
    try {
      const task = await this.db.Task.findByPk(taskId);
      if (! task) {
        throw new Error(`任务 ${taskId} 不存在`);
      }

      if (task.status === 'running') {
        // 停止运行中的任务
        this.runningTasks.delete(taskId);
        await this.executor.cancel(taskId);
      }

      // 取消定时任务
      const scheduledTask = this.scheduledTasks.get(taskId);
      if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask.destroy();
        this.scheduledTasks.delete(taskId);
      }

      await task.update({
        status: 'cancelled',
        completed_time: new Date()
      });

      this.emit('task:cancelled', task);
      logger.info(`任务已取消: ${taskId}`);

      return task;
    } catch (error) {
      logger.error(`取消任务失败: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * 获取任务列表
   */
  async getTaskList(options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        taskType,
        accountId
      } = options;

      const where = {};
      if (status) where.status = status;
      if (taskType) where.task_type = taskType;
      if (accountId) where.account_id = accountId;

      const { count, rows } = await this.db.Task.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        offset: (page - 1) * limit,
        limit,
        include: [
          {
            model: this.db.Account,
            attributes: ['username', 'nickname']
          }
        ]
      });

      return {
        tasks: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('获取任务列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取任务详情
   */
  async getTaskDetails(taskId) {
    try {
      const task = await this.db.Task.findByPk(taskId, {
        include: [
          {
            model: this.db.Account,
            attributes: ['username', 'nickname']
          }
        ]
      });

      if (!task) {
        throw new Error(`任务 ${taskId} 不存在`);
      }

      return task;
    } catch (error) {
      logger.error(`获取任务详情失败: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * 获取任务统计
   */
  async getTaskStats() {
    try {
      const stats = await this.db.Task.findAll({
        attributes: [
          'status',
          [this.db.Sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['status']
      });

      const runningCount = this.runningTasks.size;
      const scheduledCount = this.scheduledTasks.size;

      return {
        byStatus: stats.reduce((acc, stat) => {
          acc[stat.status] = parseInt(stat.dataValues.count);
          return acc;
        }, {}),
        running: runningCount,
        scheduled: scheduledCount,
        total: stats.reduce((sum, stat) => sum + parseInt(stat.dataValues.count), 0)
      };
    } catch (error) {
      logger.error('获取任务统计失败:', error);
      throw error;
    }
  }

  /**
   * 清理已完成的任务
   */
  async cleanupCompletedTasks() {
    try {
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7天前

      const result = await this.db.Task.destroy({
        where: {
          status: ['completed', 'failed', 'cancelled'],
          updated_at: {
            [this.db.Sequelize.Op.lt]: cutoffDate
          }
        }
      });

      if (result > 0) {
        logger.info(`清理了 ${result} 个过期任务`);
      }
    } catch (error) {
      logger.error('清理已完成任务失败:', error);
    }
  }

  /**
   * 创建特定类型的任务
   */
  async createPostTask(accountId, postData, options = {}) {
    return this.createTask({
      type: 'create_post',
      accountId,
      data: postData,
      ...options
    });
  }

  async createCommentTask(accountId, commentData, options = {}) {
    return this.createTask({
      type: 'create_comment',
      accountId,
      data: commentData,
      ...options
    });
  }

  async createLikeTask(accountId, likeData, options = {}) {
    return this.createTask({
      type: 'like_post',
      accountId,
      data: likeData,
      ...options
    });
  }

  async createFollowTask(accountId, followData, options = {}) {
    return this.createTask({
      type: 'follow_user',
      accountId,
      data: followData,
      ...options
    });
  }

  async createScrapeTask(accountId, scrapeData, options = {}) {
    return this.createTask({
      type: 'scrape_data',
      accountId,
      data: scrapeData,
      ...options
    });
  }

  /**
   * 关闭任务管理器
   */
  async shutdown() {
    logger.info('正在关闭任务管理器...');

    // 停止所有定时任务
    for (const [taskId, scheduledTask] of this.scheduledTasks) {
      scheduledTask.stop();
      scheduledTask.destroy();
    }
    this.scheduledTasks.clear();

    // 等待运行中的任务完成
    const promises = Array.from(this.runningTasks.values()).map(task => 
      this.waitForTaskCompletion(task.id)
    );
    
    await Promise.allSettled(promises);
    
    logger.info('任务管理器已关闭');
  }

  /**
   * 等待任务完成
   */
  async waitForTaskCompletion(taskId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`任务 ${taskId} 超时`));
      }, timeout);

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.removeAllListeners(`task:${taskId}:completed`);
        this.removeAllListeners(`task:${taskId}:failed`);
      };

      this.once(`task:${taskId}:completed`, (task) => {
        cleanup();
        resolve(task);
      });

      this.once(`task:${taskId}:failed`, (task) => {
        cleanup();
        reject(new Error(task.error_message));
      });
    });
  }
}

module.exports = TaskManager;