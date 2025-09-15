/**
 * WebSocket服务器 - 实时通信模块
 * 提供实时状态更新、任务进度通知和双向通信功能
 */

const { Server } = require('socket.io');
const logger = require('../utils/logger');

class WebSocketServer {
  constructor(server, corsOptions = {}) {
    this.io = new Server(server, {
      cors: {
        origin: corsOptions.origin || "*",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.connectedClients = new Map();
    this.setupEventHandlers();
    this.setupHeartbeat();
  }

  /**
   * 设置事件处理器
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('客户端连接', { clientId: socket.id });
      
      // 存储客户端信息
      this.connectedClients.set(socket.id, {
        socket,
        connectedAt: new Date(),
        lastActivity: new Date(),
        subscriptions: new Set()
      });

      // 发送欢迎消息
      socket.emit('welcome', {
        message: '欢迎连接到小红书MCP服务器',
        timestamp: new Date().toISOString(),
        version: require('../../package.json').version
      });

      // 订阅事件
      socket.on('subscribe', (data) => {
        this.handleSubscribe(socket, data);
      });

      // 取消订阅事件
      socket.on('unsubscribe', (data) => {
        this.handleUnsubscribe(socket, data);
      });

      // MCP方法调用
      socket.on('mcp_call', async (data) => {
        await this.handleMCPCall(socket, data);
      });

      // 心跳事件
      socket.on('heartbeat', () => {
        this.updateClientActivity(socket.id);
        socket.emit('heartbeat_ack', { timestamp: new Date().toISOString() });
      });

      // 断开连接
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // 错误处理
      socket.on('error', (error) => {
        logger.error('WebSocket错误', { clientId: socket.id, error: error.message });
      });
    });
  }

  /**
   * 处理订阅请求
   */
  handleSubscribe(socket, data) {
    const { channel, filters = {} } = data;
    const client = this.connectedClients.get(socket.id);
    
    if (!client) return;

    client.subscriptions.add(channel);
    socket.join(channel);
    
    logger.info('客户端订阅频道', { 
      clientId: socket.id, 
      channel, 
      filters 
    });

    // 发送确认
    socket.emit('subscribed', {
      channel,
      filters,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 处理取消订阅请求
   */
  handleUnsubscribe(socket, data) {
    const { channel } = data;
    const client = this.connectedClients.get(socket.id);
    
    if (!client) return;

    client.subscriptions.delete(channel);
    socket.leave(channel);
    
    logger.info('客户端取消订阅频道', { 
      clientId: socket.id, 
      channel 
    });

    socket.emit('unsubscribed', {
      channel,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 处理MCP方法调用
   */
  async handleMCPCall(socket, data) {
    try {
      const { id, method, params } = data;
      
      // 这里应该调用实际的MCP管理器
      // 暂时模拟响应
      const result = await this.simulateMCPCall(method, params);
      
      socket.emit('mcp_response', {
        id,
        result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('MCP调用失败', { 
        clientId: socket.id, 
        method: data?.method, 
        error: error.message 
      });
      
      socket.emit('mcp_error', {
        id: data?.id,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * 处理客户端断开连接
   */
  handleDisconnect(socket) {
    const client = this.connectedClients.get(socket.id);
    if (client) {
      logger.info('客户端断开连接', { 
        clientId: socket.id, 
        connectedDuration: Date.now() - client.connectedAt.getTime() 
      });
      
      this.connectedClients.delete(socket.id);
    }
  }

  /**
   * 设置心跳检测
   */
  setupHeartbeat() {
    setInterval(() => {
      const now = new Date();
      const timeout = 30000; // 30秒超时

      for (const [clientId, client] of this.connectedClients) {
        if (now - client.lastActivity > timeout) {
          logger.warn('客户端心跳超时', { clientId });
          client.socket.disconnect();
          this.connectedClients.delete(clientId);
        }
      }
    }, 10000); // 每10秒检查一次
  }

  /**
   * 更新客户端活动状态
   */
  updateClientActivity(clientId) {
    const client = this.connectedClients.get(clientId);
    if (client) {
      client.lastActivity = new Date();
    }
  }

  /**
   * 广播消息到指定频道
   */
  broadcast(channel, data) {
    this.io.to(channel).emit('message', {
      channel,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 广播系统消息
   */
  broadcastSystem(event, data) {
    this.io.emit('system', {
      event,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 广播任务进度
   */
  broadcastTaskProgress(taskId, progress) {
    this.broadcast('tasks', {
      type: 'task_progress',
      taskId,
      progress,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 广播任务完成
   */
  broadcastTaskComplete(taskId, result) {
    this.broadcast('tasks', {
      type: 'task_complete',
      taskId,
      result,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 广播账号状态更新
   */
  broadcastAccountStatus(accountId, status) {
    this.broadcast('accounts', {
      type: 'account_status',
      accountId,
      status,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 广播系统状态更新
   */
  broadcastSystemStatus(status) {
    this.broadcastSystem('status_update', status);
  }

  /**
   * 广播错误消息
   */
  broadcastError(error, channel = 'system') {
    this.broadcast(channel, {
      type: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 获取连接统计
   */
  getConnectionStats() {
    return {
      totalConnections: this.connectedClients.size,
      activeChannels: this.getActiveChannels(),
      clientDetails: Array.from(this.connectedClients.values()).map(client => ({
        connectedAt: client.connectedAt,
        lastActivity: client.lastActivity,
        subscriptions: Array.from(client.subscriptions)
      }))
    };
  }

  /**
   * 获取活跃频道
   */
  getActiveChannels() {
    const rooms = this.io.sockets.adapter.rooms;
    const channels = {};

    for (const [room, sockets] of rooms) {
      if (!sockets.has(room)) { // 排除socket自身的房间
        channels[room] = sockets.size;
      }
    }

    return channels;
  }

  /**
   * 模拟MCP调用（实际项目中应该调用真实的MCP管理器）
   */
  async simulateMCPCall(method, params) {
    // 模拟延迟
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

    const mockResponses = {
      'get_accounts': () => ({
        accounts: [
          { id: 1, username: 'test_user', status: 'active' },
          { id: 2, username: 'demo_user', status: 'inactive' }
        ]
      }),
      'create_post': () => ({
        postId: Math.random().toString(36).substr(2, 9),
        status: 'created'
      }),
      'get_tasks': () => ({
        tasks: [
          { id: 1, type: 'publish', status: 'running' },
          { id: 2, type: 'comment', status: 'completed' }
        ]
      }),
      'get_system_status': () => ({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connections: this.connectedClients.size
      })
    };

    const response = mockResponses[method];
    if (response) {
      return response(params);
    }

    throw new Error(`未知方法: ${method}`);
  }

  /**
   * 关闭WebSocket服务器
   */
  async close() {
    this.io.close();
    logger.info('WebSocket服务器已关闭');
  }
}

module.exports = WebSocketServer;