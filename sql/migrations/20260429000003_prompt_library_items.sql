-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS `prompt_library_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(160) NOT NULL,
  `content` TEXT NOT NULL,
  `category` VARCHAR(80) NOT NULL DEFAULT '通用',
  `preview_image_url` VARCHAR(2048) NOT NULL DEFAULT '',
  `tags` JSON NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_prompt_library_public` (`enabled`, `category`, `sort_order`, `id`),
  KEY `idx_prompt_library_sort` (`sort_order`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS `prompt_library_items`;

-- +goose StatementEnd
