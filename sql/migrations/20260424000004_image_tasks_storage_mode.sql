-- +goose Up
-- +goose StatementBegin
ALTER TABLE `image_tasks`
    ADD COLUMN `storage_mode` VARCHAR(16) NOT NULL DEFAULT 'local' AFTER `upscale`;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE `image_tasks` DROP COLUMN `storage_mode`;
-- +goose StatementEnd
