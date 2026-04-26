-- +goose Up
-- +goose StatementBegin

-- SMTP 邮件配置迁移到 system_settings,后台系统设置页可视化维护。
INSERT INTO `system_settings` (`k`, `v`, `description`) VALUES
    ('mail.smtp_enabled',  'false',  '是否启用 SMTP 邮件发送'),
    ('mail.smtp_host',     '',       'SMTP 主机'),
    ('mail.smtp_port',     '465',    'SMTP 端口,常用 465 或 587'),
    ('mail.smtp_username', '',       'SMTP 用户名'),
    ('mail.smtp_password', '',       'SMTP 密码或授权码'),
    ('mail.smtp_from',     '',       'SMTP 发件邮箱'),
    ('mail.smtp_from_name','GPT2API','SMTP 发件人名称'),
    ('mail.smtp_use_tls',  'true',   '是否使用 TLS')
ON DUPLICATE KEY UPDATE `k` = VALUES(`k`);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM `system_settings`
WHERE `k` IN (
    'mail.smtp_enabled',
    'mail.smtp_host',
    'mail.smtp_port',
    'mail.smtp_username',
    'mail.smtp_password',
    'mail.smtp_from',
    'mail.smtp_from_name',
    'mail.smtp_use_tls'
);
-- +goose StatementEnd
