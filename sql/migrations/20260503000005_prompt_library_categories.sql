-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS `prompt_library_categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(80) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_prompt_library_categories_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `prompt_library_categories` (`name`, `created_at`, `updated_at`)
VALUES ('通用', UTC_TIMESTAMP(), UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`);

INSERT INTO `prompt_library_categories` (`name`, `created_at`, `updated_at`)
SELECT DISTINCT COALESCE(NULLIF(TRIM(`category`), ''), '通用') AS `name`, UTC_TIMESTAMP(), UTC_TIMESTAMP()
FROM `prompt_library_items`
WHERE COALESCE(NULLIF(TRIM(`category`), ''), '通用') <> ''
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS `prompt_library_categories`;
-- +goose StatementEnd
