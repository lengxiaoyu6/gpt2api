-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS `system_update_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `version` VARCHAR(64) NOT NULL DEFAULT '',
    `title` VARCHAR(160) NOT NULL,
    `content` TEXT NOT NULL,
    `enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `sort_order` INT NOT NULL DEFAULT 0,
    `published_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_system_update_logs_public` (`enabled`, `sort_order`, `published_at`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS `system_update_logs`;

-- +goose StatementEnd
