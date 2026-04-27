-- +goose Up
ALTER TABLE `proxies`
ADD COLUMN `last_used_at` DATETIME NULL AFTER `health_score`;

-- +goose Down
ALTER TABLE `proxies`
DROP COLUMN `last_used_at`;
