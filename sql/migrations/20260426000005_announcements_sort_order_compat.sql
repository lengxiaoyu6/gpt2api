-- +goose Up
-- +goose StatementBegin

-- 兼容已执行 20260426000004 但仍停留在旧 announcements 表结构的数据库。
-- 旧表来自 20260417000001_init_schema.sql，缺少公告管理页使用的 sort_order 字段。
SET @has_sort_order := (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'announcements'
       AND COLUMN_NAME  = 'sort_order'
);

SET @sql := IF(@has_sort_order = 0,
    'ALTER TABLE `announcements` ADD COLUMN `sort_order` INT NOT NULL DEFAULT 0 AFTER `enabled`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_enabled_sort_idx := (
    SELECT COUNT(*)
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'announcements'
       AND INDEX_NAME   = 'idx_announcements_enabled_sort'
);

SET @sql := IF(@has_enabled_sort_idx = 0,
    'ALTER TABLE `announcements` ADD KEY `idx_announcements_enabled_sort` (`enabled`, `sort_order`, `id`)',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- 兼容迁移只补齐字段与索引，回退时保留当前表结构，避免误删历史公告数据。

-- +goose StatementEnd
