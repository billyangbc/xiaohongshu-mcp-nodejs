# 小红书MCP Node.js重构

企业级小红书MCP Node.js重构项目，支持多账号矩阵管理、反风控、数据采集与发布。

## 🚀 快速开始

### 安装依赖
```bash
npm install
```

### 启动服务
```bash
npm run web
```

### 访问地址
- Web服务: http://localhost:3000
- API文档: http://localhost:3000/docs
- 管理后台: http://localhost:3000/admin

## 📋 功能特性

- ✅ 多账号矩阵管理
- ✅ 浏览器指纹反风控
- ✅ 自动化数据采集
- ✅ 内容发布调度
- ✅ 代理IP池管理
- ✅ 实时监控分析

## 🛠️ 技术栈

- **运行时**: Node.js 18+
- **浏览器**: Playwright + Stealth
- **数据库**: MySQL 8.0+
- **框架**: Express.js + Socket.IO
- **管理**: Directus CMS

## 📁 项目结构

```
src/
├── browser/          # 浏览器自动化
├── config/           # 配置管理
├── core/             # 核心功能
├── database/         # 数据库操作
├── handlers/         # 请求处理器
├── mcp/              # MCP协议实现
├── middleware/       # 中间件
├── utils/            # 工具函数
└── web/              # Web服务
```

## 🔧 配置

创建 `.env` 文件：
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=xiaohongshu_mcp
DB_USER=root
DB_PASSWORD=your_password
PORT=3000
```

## 📄 许可证

MIT License