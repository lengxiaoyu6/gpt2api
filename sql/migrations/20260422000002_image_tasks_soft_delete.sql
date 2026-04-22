-- +goose Up
-- +goose StatementBegin
ALTER TABLE `image_tasks`
    ADD COLUMN `deleted_at` DATETIME NULL AFTER `finished_at`;

CREATE INDEX `idx_user_deleted_time` ON `image_tasks` (`user_id`, `deleted_at`, `id`);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX `idx_user_deleted_time` ON `image_tasks`;

ALTER TABLE `image_tasks`
    DROP COLUMN `deleted_at`;
-- +goose StatementEnd
