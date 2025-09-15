/**
 * 日志管理器
 * 
 * @description 基于Winston的日志系统，支持文件和console输出
 * @author MCP团队
 * @since 2024-12-20
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// 创建日志目录
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 日志格式
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            logMessage += ` ${JSON.stringify(meta)}`;
        }
        return logMessage;
    })
);

// 创建日志实例
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // 错误日志
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        }),
        
        // 所有日志
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        }),
        
        // 开发环境控制台输出
        ...(process.env.NODE_ENV !== 'production' ? [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            })
        ] : [])
    ],
    
    // 异常处理
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(logDir, 'exceptions.log')
        })
    ],
    
    // 未处理Promise拒绝
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(logDir, 'rejections.log')
        })
    ]
});