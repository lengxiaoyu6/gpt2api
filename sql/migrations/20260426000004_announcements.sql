-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS `announcements` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(128) NOT NULL,
    `content` TEXT NOT NULL,
    `level` VARCHAR(16) NOT NULL DEFAULT 'info' COMMENT 'info | warn | danger',
    `enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `sort_order` INT NOT NULL DEFAULT 0,
    `start_at` DATETIME NULL,
    `end_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_enabled_time` (`enabled`, `start_at`, `end_at`),
    KEY `idx_announcements_enabled_sort` (`enabled`, `sort_order`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

SET @has_enabled_sort_idx := (
    SELECT COUNT(*)
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'announcements'
       AND INDEX_NAME   = 'idx_announcements_enabled_sort'
);

SET @sql := IF(@has_enabled_sort_idx > 0,
    'ALTER TABLE `announcements` DROP INDEX `idx_announcements_enabled_sort`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_sort_order := (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'announcements'
       AND COLUMN_NAME  = 'sort_order'
);

SET @sql := IF(@has_sort_order > 0,
    'ALTER TABLE `announcements` DROP COLUMN `sort_order`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- +goose StatementEnd
