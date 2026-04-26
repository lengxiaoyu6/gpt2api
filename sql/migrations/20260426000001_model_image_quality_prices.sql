-- +goose Up
-- +goose StatementBegin

SET @has_image_price_per_call_2k := (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'models'
       AND COLUMN_NAME  = 'image_price_per_call_2k'
);

SET @sql := IF(@has_image_price_per_call_2k = 0,
    'ALTER TABLE `models` ADD COLUMN `image_price_per_call_2k` BIGINT NOT NULL DEFAULT 0 COMMENT ''2K 生图积分价(厘),0 表示沿用 1K'' AFTER `image_price_per_call`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_image_price_per_call_4k := (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'models'
       AND COLUMN_NAME  = 'image_price_per_call_4k'
);

SET @sql := IF(@has_image_price_per_call_4k = 0,
    'ALTER TABLE `models` ADD COLUMN `image_price_per_call_4k` BIGINT NOT NULL DEFAULT 0 COMMENT ''4K 生图积分价(厘),0 表示沿用 1K'' AFTER `image_price_per_call_2k`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE `models`
   SET `image_price_per_call_2k` = `image_price_per_call`
 WHERE `image_price_per_call_2k` = 0;

UPDATE `models`
   SET `image_price_per_call_4k` = `image_price_per_call`
 WHERE `image_price_per_call_4k` = 0;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

SET @has_image_price_per_call_4k := (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'models'
       AND COLUMN_NAME  = 'image_price_per_call_4k'
);

SET @sql := IF(@has_image_price_per_call_4k > 0,
    'ALTER TABLE `models` DROP COLUMN `image_price_per_call_4k`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_image_price_per_call_2k := (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'models'
       AND COLUMN_NAME  = 'image_price_per_call_2k'
);

SET @sql := IF(@has_image_price_per_call_2k > 0,
    'ALTER TABLE `models` DROP COLUMN `image_price_per_call_2k`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- +goose StatementEnd
