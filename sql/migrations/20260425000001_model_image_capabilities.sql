-- +goose Up
-- +goose StatementBegin

-- 为图片模型增加能力开关:
--   supports_multi_image: 是否允许单次请求多张输出
--   supports_output_size: 是否允许向上游传递 size 输出尺寸
--
-- 该迁移保持幂等,兼容两类数据库:
--   1. 旧库:20260417000001 已执行,models 表尚无这两个字段;
--   2. 新库:20260417000001 已包含这两个字段,本迁移只登记版本。
SET @has_supports_multi_image := (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'models'
       AND COLUMN_NAME  = 'supports_multi_image'
);

SET @sql := IF(@has_supports_multi_image = 0,
    'ALTER TABLE `models` ADD COLUMN `supports_multi_image` TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''是否支持单请求多张生图'' AFTER `image_price_per_call`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_supports_output_size := (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'models'
       AND COLUMN_NAME  = 'supports_output_size'
);

SET @sql := IF(@has_supports_output_size = 0,
    'ALTER TABLE `models` ADD COLUMN `supports_output_size` TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''是否支持输出尺寸参数'' AFTER `supports_multi_image`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

SET @has_supports_output_size := (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'models'
       AND COLUMN_NAME  = 'supports_output_size'
);

SET @sql := IF(@has_supports_output_size > 0,
    'ALTER TABLE `models` DROP COLUMN `supports_output_size`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_supports_multi_image := (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'models'
       AND COLUMN_NAME  = 'supports_multi_image'
);

SET @sql := IF(@has_supports_multi_image > 0,
    'ALTER TABLE `models` DROP COLUMN `supports_multi_image`',
    'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- +goose StatementEnd
