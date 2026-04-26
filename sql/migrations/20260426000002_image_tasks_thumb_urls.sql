-- +goose Up
-- +goose StatementBegin
ALTER TABLE `image_tasks`
    ADD COLUMN `thumb_urls` JSON NULL AFTER `result_urls`;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE `image_tasks` DROP COLUMN `thumb_urls`;
-- +goose StatementEnd
