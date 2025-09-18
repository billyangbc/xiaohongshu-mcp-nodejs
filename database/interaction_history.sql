-- 互动历史记录表
CREATE TABLE IF NOT EXISTS idea_xiaohongshu_interactions (
    id VARCHAR(36) PRIMARY KEY COMMENT '互动记录ID',
    account_id BIGINT NOT NULL COMMENT '账号ID',
    interaction_type VARCHAR(20) NOT NULL COMMENT '互动类型(like, comment, follow)',
    target_id VARCHAR(50) COMMENT '目标ID(笔记ID或用户ID)',
    target_type VARCHAR(20) COMMENT '目标类型(post, user)',
    content TEXT COMMENT '互动内容(评论内容等)',
    success BOOLEAN DEFAULT FALSE COMMENT '是否成功',
    error_message TEXT COMMENT '错误信息',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_account_id (account_id),
    INDEX idx_interaction_type (interaction_type),
    INDEX idx_target_id (target_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (account_id) REFERENCES idea_xiaohongshu_accounts(id)
) COMMENT='互动历史记录表';

-- 互动统计视图
CREATE VIEW idea_xiaohongshu_interaction_stats AS
SELECT 
    account_id,
    interaction_type,
    DATE(created_at) as interaction_date,
    COUNT(*) as total_count,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure_count
FROM idea_xiaohongshu_interactions
GROUP BY account_id, interaction_type, DATE(created_at);

-- 24小时互动统计
CREATE VIEW idea_xiaohongshu_daily_interactions AS
SELECT 
    account_id,
    interaction_type,
    COUNT(*) as count_24h,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count_24h
FROM idea_xiaohongshu_interactions
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY account_id, interaction_type;

-- 1小时互动统计
CREATE VIEW idea_xiaohongshu_hourly_interactions AS
SELECT 
    account_id,
    interaction_type,
    COUNT(*) as count_1h,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count_1h
FROM idea_xiaohongshu_interactions
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY account_id, interaction_type;