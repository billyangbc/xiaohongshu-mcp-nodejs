-- 小红书MCP数据库初始化脚本
-- 创建数据库和表结构

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS xiaohongshu_mcp 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE xiaohongshu_mcp;

-- 账号管理表
CREATE TABLE IF NOT EXISTS idea_xiaohongshu_accounts (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL COMMENT '小红书用户名',
    phone VARCHAR(20) COMMENT '绑定手机号',
    email VARCHAR(100) COMMENT '绑定邮箱',
    nickname VARCHAR(100) COMMENT '昵称',
    avatar_url TEXT COMMENT '头像URL',
    proxy_id BIGINT COMMENT '关联代理ID',
    fingerprint_id BIGINT COMMENT '关联指纹ID',
    status ENUM('active', 'banned', 'suspended', 'login_required') DEFAULT 'active',
    login_status BOOLEAN DEFAULT FALSE COMMENT '登录状态',
    last_login_time DATETIME COMMENT '最后登录时间',
    cookies_encrypted TEXT COMMENT '加密存储的Cookies',
    user_agent TEXT COMMENT '用户代理字符串',
    session_data JSON COMMENT '会话数据',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_status (status)
) COMMENT='小红书账号管理表';

-- 代理IP管理表
CREATE TABLE IF NOT EXISTS idea_xiaohongshu_proxies (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    type ENUM('http', 'socks5') NOT NULL COMMENT '代理类型',
    host VARCHAR(255) NOT NULL COMMENT '代理服务器地址',
    port INT NOT NULL COMMENT '代理端口',
    username VARCHAR(100) COMMENT '代理用户名',
    password VARCHAR(255) COMMENT '代理密码',
    country VARCHAR(10) COMMENT '代理所在国家',
    region VARCHAR(50) COMMENT '代理所在地区',
    city VARCHAR(50) COMMENT '代理所在城市',
    isp VARCHAR(100) COMMENT 'ISP供应商',
    status ENUM('active', 'inactive', 'banned') DEFAULT 'active',
    success_rate DECIMAL(5,2) DEFAULT 100.00 COMMENT '成功率',
    avg_response_time INT DEFAULT 0 COMMENT '平均响应时间(ms)',
    last_checked DATETIME COMMENT '最后检查时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_country_city (country, city),
    INDEX idx_status (status)
) COMMENT='代理IP管理表';

-- 浏览器指纹表
CREATE TABLE IF NOT EXISTS idea_xiaohongshu_fingerprints (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    fingerprint_id VARCHAR(32) UNIQUE NOT NULL COMMENT '指纹唯一标识',
    user_agent TEXT NOT NULL COMMENT '用户代理字符串',
    viewport_width INT NOT NULL COMMENT '视口宽度',
    viewport_height INT NOT NULL COMMENT '视口高度',
    screen_width INT NOT NULL COMMENT '屏幕宽度',
    screen_height INT NOT NULL COMMENT '屏幕高度',
    device_memory INT COMMENT '设备内存GB',
    hardware_concurrency INT COMMENT 'CPU核心数',
    timezone VARCHAR(50) COMMENT '时区',
    language VARCHAR(10) COMMENT '语言',
    platform VARCHAR(20) COMMENT '平台',
    webgl_vendor VARCHAR(100) COMMENT 'WebGL厂商',
    webgl_renderer VARCHAR(200) COMMENT 'WebGL渲染器',
    canvas_fingerprint VARCHAR(64) COMMENT 'Canvas指纹',
    audio_fingerprint VARCHAR(64) COMMENT 'Audio指纹',
    fonts_list JSON COMMENT '字体列表',
    plugins_list JSON COMMENT '插件列表',
    webrtc_ip VARCHAR(45) COMMENT 'WebRTC本地IP',
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='浏览器指纹表';

-- 笔记/帖子表
CREATE TABLE IF NOT EXISTS idea_xiaohongshu_posts (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id BIGINT NOT NULL COMMENT '发布账号ID',
    post_id VARCHAR(50) COMMENT '小红书笔记ID',
    title VARCHAR(200) NOT NULL COMMENT '笔记标题',
    content TEXT COMMENT '笔记内容',
    type ENUM('image', 'video', 'text') DEFAULT 'image' COMMENT '笔记类型',
    status ENUM('draft', 'published', 'failed', 'deleted') DEFAULT 'draft',
    images_data JSON COMMENT '图片信息',
    video_data JSON COMMENT '视频信息',
    tags JSON COMMENT '标签列表',
    topic VARCHAR(100) COMMENT '话题',
    scheduled_time DATETIME COMMENT '计划发布时间',
    published_time DATETIME COMMENT '实际发布时间',
    view_count INT DEFAULT 0 COMMENT '浏览量',
    like_count INT DEFAULT 0 COMMENT '点赞数',
    comment_count INT DEFAULT 0 COMMENT '评论数',
    collect_count INT DEFAULT 0 COMMENT '收藏数',
    share_count INT DEFAULT 0 COMMENT '分享数',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_account_id (account_id),
    INDEX idx_post_id (post_id),
    INDEX idx_status (status)
) COMMENT='笔记/帖子表';

-- 用户表
CREATE TABLE IF NOT EXISTS idea_xiaohongshu_users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(50) UNIQUE NOT NULL COMMENT '小红书用户ID',
    nickname VARCHAR(100) COMMENT '用户昵称',
    avatar_url TEXT COMMENT '头像URL',
    description TEXT COMMENT '个人简介',
    follower_count INT DEFAULT 0 COMMENT '粉丝数',
    following_count INT DEFAULT 0 COMMENT '关注数',
    post_count INT DEFAULT 0 COMMENT '笔记数',
    like_count INT DEFAULT 0 COMMENT '获赞数',
    is_verified BOOLEAN DEFAULT FALSE COMMENT '是否认证',
    verification_type VARCHAR(20) COMMENT '认证类型',
    location VARCHAR(100) COMMENT '所在地区',
    gender ENUM('male', 'female', 'unknown') DEFAULT 'unknown',
    age_range VARCHAR(20) COMMENT '年龄段',
    last_active DATETIME COMMENT '最后活跃时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_nickname (nickname)
) COMMENT='用户信息表';

-- 评论表
CREATE TABLE IF NOT EXISTS idea_xiaohongshu_comments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    comment_id VARCHAR(50) UNIQUE COMMENT '评论ID',
    post_id VARCHAR(50) NOT NULL COMMENT '笔记ID',
    user_id VARCHAR(50) NOT NULL COMMENT '评论用户ID',
    parent_comment_id VARCHAR(50) COMMENT '父评论ID',
    content TEXT NOT NULL COMMENT '评论内容',
    like_count INT DEFAULT 0 COMMENT '点赞数',
    reply_count INT DEFAULT 0 COMMENT '回复数',
    created_time DATETIME COMMENT '评论时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_post_id (post_id),
    INDEX idx_user_id (user_id),
    INDEX idx_parent_comment_id (parent_comment_id)
) COMMENT='评论表';

-- 任务表
CREATE TABLE IF NOT EXISTS idea_xiaohongshu_tasks (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    task_type VARCHAR(50) NOT NULL COMMENT '任务类型',
    account_id BIGINT COMMENT '关联账号ID',
    task_data JSON COMMENT '任务数据',
    cron_expression VARCHAR(100) COMMENT 'Cron表达式',
    status ENUM('pending', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    priority INT DEFAULT 1 COMMENT '优先级',
    retry_count INT DEFAULT 0 COMMENT '重试次数',
    max_retries INT DEFAULT 3 COMMENT '最大重试次数',
    scheduled_time DATETIME COMMENT '计划执行时间',
    started_time DATETIME COMMENT '开始执行时间',
    completed_time DATETIME COMMENT '完成时间',
    error_message TEXT COMMENT '错误信息',
    result_data JSON COMMENT '执行结果',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_task_type (task_type),
    INDEX idx_account_id (account_id),
    INDEX idx_status (status)
) COMMENT='任务调度表';

-- 数据分析表
CREATE TABLE IF NOT EXISTS idea_xiaohongshu_analytics (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id BIGINT NOT NULL COMMENT '账号ID',
    date DATE NOT NULL COMMENT '统计日期',
    metric_type VARCHAR(50) NOT NULL COMMENT '指标类型',
    metric_value DECIMAL(15,2) DEFAULT 0 COMMENT '指标值',
    additional_data JSON COMMENT '附加数据',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_account_date_metric (account_id, date, metric_type),
    INDEX idx_account_id (account_id),
    INDEX idx_date (date)
) COMMENT='数据分析表';

-- 系统配置表
CREATE TABLE IF NOT EXISTS idea_xiaohongshu_settings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) UNIQUE NOT NULL COMMENT '配置键',
    setting_value TEXT COMMENT '配置值',
    setting_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description TEXT COMMENT '配置描述',
    is_system BOOLEAN DEFAULT FALSE COMMENT '是否系统配置',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_setting_key (setting_key)
) COMMENT='系统配置表';

-- 操作日志表
CREATE TABLE IF NOT EXISTS idea_xiaohongshu_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    level ENUM('error', 'warn', 'info', 'debug') NOT NULL,
    source VARCHAR(50) NOT NULL COMMENT '日志来源',
    message TEXT NOT NULL,
    context JSON COMMENT '上下文信息',
    user_id BIGINT COMMENT '操作用户ID',
    ip_address VARCHAR(45) COMMENT 'IP地址',
    user_agent TEXT COMMENT '用户代理',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_level (level),
    INDEX idx_source (source),
    INDEX idx_created_at (created_at)
) COMMENT='操作日志表';

-- 插入默认配置
INSERT INTO idea_xiaohongshu_settings (setting_key, setting_value, setting_type, description, is_system) VALUES
('app_name', '小红书MCP服务器', 'string', '应用名称', true),
('app_version', '1.0.0', 'string', '应用版本', true),
('max_concurrent_tasks', '10', 'number', '最大并发任务数', false),
('task_retry_attempts', '3', 'number', '任务重试次数', false),
('task_retry_delay', '2000', 'number', '任务重试延迟(毫秒)', false),
('browser_headless', 'true', 'boolean', '是否无头浏览器模式', false),
('browser_timeout', '30000', 'number', '浏览器超时时间(毫秒)', false),
('proxy_check_interval', '300000', 'number', '代理检查间隔(毫秒)', false),
('fingerprint_enabled', 'true', 'boolean', '是否启用指纹伪造', false),
('log_level', 'info', 'string', '日志级别', false);

-- 插入示例代理数据
INSERT INTO idea_xiaohongshu_proxies (type, host, port, country, region, city, isp, status) VALUES
('http', '127.0.0.1', 8080, 'CN', 'Beijing', 'Beijing', 'Local ISP', 'active'),
('socks5', '127.0.0.1', 1080, 'CN', 'Shanghai', 'Shanghai', 'Local ISP', 'active');

-- 插入示例指纹数据
INSERT INTO idea_xiaohongshu_fingerprints (
    fingerprint_id, user_agent, viewport_width, viewport_height, 
    screen_width, screen_height, device_memory, hardware_concurrency,
    timezone, language, platform, webgl_vendor, webgl_renderer,
    canvas_fingerprint, audio_fingerprint, fonts_list, plugins_list
) VALUES
('default_fingerprint_1', 
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
 1920, 1080, 1920, 1080, 8, 8, 'Asia/Shanghai', 'zh-CN', 'Win32', 
 'Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)',
 'default_canvas_hash_1', 'default_audio_hash_1', 
 '[]', '[]');

-- 创建视图：账号统计
CREATE OR REPLACE VIEW view_account_stats AS
SELECT 
    a.id,
    a.username,
    a.nickname,
    a.status,
    a.login_status,
    a.last_login_time,
    p.host as proxy_host,
    p.port as proxy_port,
    p.country as proxy_country,
    f.user_agent,
    COUNT(DISTINCT p2.id) as total_posts,
    COUNT(DISTINCT t.id) as total_tasks,
    MAX(p2.published_time) as last_post_time
FROM idea_xiaohongshu_accounts a
LEFT JOIN idea_xiaohongshu_proxies p ON a.proxy_id = p.id
LEFT JOIN idea_xiaohongshu_fingerprints f ON a.fingerprint_id = f.id
LEFT JOIN idea_xiaohongshu_posts p2 ON a.id = p2.account_id
LEFT JOIN idea_xiaohongshu_tasks t ON a.id = t.account_id
GROUP BY a.id;

-- 创建视图：任务统计
CREATE OR REPLACE VIEW view_task_stats AS
SELECT 
    t.id,
    t.task_type,
    t.status,
    t.priority,
    t.retry_count,
    t.max_retries,
    t.scheduled_time,
    t.started_time,
    t.completed_time,
    a.username as account_username,
    TIMESTAMPDIFF(SECOND, t.started_time, t.completed_time) as duration_seconds,
    CASE 
        WHEN t.status = 'completed' THEN 'success'
        WHEN t.status = 'failed' THEN 'failed'
        WHEN t.status = 'cancelled' THEN 'cancelled'
        ELSE 'pending'
    END as result_status
FROM idea_xiaohongshu_tasks t
LEFT JOIN idea_xiaohongshu_accounts a ON t.account_id = a.id;

-- 创建视图：内容分析
CREATE OR REPLACE VIEW view_content_analytics AS
SELECT 
    p.id,
    p.post_id,
    p.title,
    p.type,
    p.status,
    p.published_time,
    p.view_count,
    p.like_count,
    p.comment_count,
    p.collect_count,
    p.share_count,
    a.username as account_username,
    CASE 
        WHEN p.view_count > 10000 THEN 'high'
        WHEN p.view_count > 1000 THEN 'medium'
        ELSE 'low'
    END as engagement_level,
    (p.like_count + p.comment_count + p.collect_count + p.share_count) as total_engagement
FROM idea_xiaohongshu_posts p
LEFT JOIN idea_xiaohongshu_accounts a ON p.account_id = a.id;