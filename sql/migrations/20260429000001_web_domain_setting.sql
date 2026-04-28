-- +goose Up
-- +goose StatementBegin

-- 用户端入口已由 WAP 调整为 Web，保留旧 site.wap_domain 数据并迁移到新 key。
INSERT INTO `system_settings` (`k`, `v`, `description`)
SELECT
    'site.web_domain',
    COALESCE((
        SELECT `v`
        FROM (SELECT `v` FROM `system_settings` WHERE `k` = 'site.wap_domain' LIMIT 1) AS legacy_wap_domain
    ), ''),
    'Web 端入口域名,如 img.domain.com'
ON DUPLICATE KEY UPDATE `k` = VALUES(`k`);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- 保留 system_settings 数据，避免回滚迁移时丢失已填写域名。
-- +goose StatementEnd
