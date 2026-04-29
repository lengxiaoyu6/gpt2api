-- +goose Up
-- +goose StatementBegin

SET @has_preview_image_url := (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'prompt_library_items'
       AND COLUMN_NAME  = 'preview_image_url'
);

SET @sql := IF(@has_preview_image_url = 0,
    'ALTER TABLE `prompt_library_items` ADD COLUMN `preview_image_url` VARCHAR(2048) NOT NULL DEFAULT '''' AFTER `category`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

SET @has_preview_image_url := (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'prompt_library_items'
       AND COLUMN_NAME  = 'preview_image_url'
);

SET @sql := IF(@has_preview_image_url > 0,
    'ALTER TABLE `prompt_library_items` DROP COLUMN `preview_image_url`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- +goose StatementEnd
