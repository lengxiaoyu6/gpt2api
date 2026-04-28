-- +goose Up
-- +goose StatementBegin
ALTER TABLE `image_tasks`
    ADD COLUMN `reference_count` INT NOT NULL DEFAULT 0 AFTER `thumb_urls`,
    ADD COLUMN `reference_urls` JSON NULL AFTER `reference_count`,
    ADD COLUMN `reference_thumb_urls` JSON NULL AFTER `reference_urls`;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE `image_tasks`
    DROP COLUMN `reference_thumb_urls`,
    DROP COLUMN `reference_urls`,
    DROP COLUMN `reference_count`;
-- +goose StatementEnd
