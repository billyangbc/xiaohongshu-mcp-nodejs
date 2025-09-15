/**
 * MCP API路由
 * 处理JSON-RPC 2.0格式的MCP请求
 */

const express = require('express');
const logger = require('../../utils/logger');

function createMCPRoutes(mcpManager) {
  const router = express.Router();

  /**
   * MCP JSON-RPC端点
   * POST /api/mcp
   * 处理所有MCP方法调用
   */
  router.post('/', async (req, res) => {
    try {
      const request = req.body;
      
      // 验证请求格式
      if (!request || typeof request !== 'object') {
        return res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Invalid Request',
            data: 'Request must be a JSON object'
          }
        });
      }

      // 处理请求
      const response = await mcpManager.handleRequest(request);
      
      // 如果是通知，不返回响应
      if (response === null) {
        return res.status(204).send();
      }

      res.json(response);
    } catch (error) {
      logger.error('MCP请求处理错误', error);
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      });
    }
  });

  /**
   * 批量MCP请求
   * POST /api/mcp/batch
   * 处理多个MCP方法调用
   */
  router.post('/batch', async (req, res) => {
    try {
      const requests = req.body;
      
      if (!Array.isArray(requests)) {
        return res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Invalid Request',
            data: 'Batch requests must be an array'
          }
        });
      }

      // 并行处理所有请求
      const responses = await Promise.all(
        requests.map(async (request) => {
          try {
            return await mcpManager.handleRequest(request);
          } catch (error) {
            logger.error('批量请求处理错误', error);
            return {
              jsonrpc: '2.0',
              id: request.id || null,
              error: {
                code: -32603,
                message: 'Internal error',
                data: error.message
              }
            };
          }
        })
      );

      // 过滤掉通知响应
      const filteredResponses = responses.filter(r => r !== null);
      
      res.json(filteredResponses);
    } catch (error) {
      logger.error('批量MCP请求处理错误', error);
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      });
    }
  });

  /**
   * 获取可用方法列表
   * GET /api/mcp/methods
   */
  router.get('/methods', (req, res) => {
    try {
      const methods = mcpManager.getMethods();
      res.json({
        jsonrpc: '2.0',
        id: null,
        result: methods
      });
    } catch (error) {
      logger.error('获取方法列表错误', error);
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      });
    }
  });

  /**
   * 获取方法详情
   * GET /api/mcp/methods/:method
   */
  router.get('/methods/:method', (req, res) => {
    try {
      const { method } = req.params;
      const methods = mcpManager.getMethods();
      const methodInfo = methods.find(m => m.name === method);
      
      if (!methodInfo) {
        return res.status(404).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        });
      }

      res.json({
        jsonrpc: '2.0',
        id: null,
        result: methodInfo
      });
    } catch (error) {
      logger.error('获取方法详情错误', error);
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      });
    }
  });

  /**
   * WebSocket MCP端点
   * 用于实时通信
   */
  router.ws = (io) => {
    io.on('connection', (socket) => {
      logger.info(`MCP WebSocket客户端连接: ${socket.id}`);

      socket.on('mcp_request', async (data) => {
        try {
          const response = await mcpManager.handleRequest(data);
          if (response !== null) {
            socket.emit('mcp_response', response);
          }
        } catch (error) {
          logger.error('WebSocket MCP请求错误', error);
          socket.emit('mcp_error', {
            jsonrpc: '2.0',
            id: data?.id || null,
            error: {
              code: -32603,
              message: 'Internal error',
              data: error.message
            }
          });
        }
      });

      socket.on('disconnect', () => {
        logger.info(`MCP WebSocket客户端断开: ${socket.id}`);
      });
    });
  };

  return router;
}

module.exports = createMCPRoutes;