-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS `user_checkins` (
    `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`         BIGINT UNSIGNED NOT NULL,
    `checkin_day`     DATE            NOT NULL COMMENT '按服务端本地时区自然日去重',
    `checked_at`      DATETIME        NOT NULL COMMENT '实际签到时间',
    `awarded_credits` BIGINT          NOT NULL DEFAULT 0 COMMENT '发放积分(厘)',
    `balance_after`   BIGINT          NOT NULL DEFAULT 0 COMMENT '签到后余额(厘)',
    `ref_id`          VARCHAR(64)     NOT NULL DEFAULT '' COMMENT 'checkin:YYYY-MM-DD',
    `remark`          VARCHAR(255)    NOT NULL DEFAULT '',
    `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_day` (`user_id`, `checkin_day`),
    KEY `idx_user_checked_at` (`user_id`, `checked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户每日签到';

INSERT INTO `system_settings` (`k`, `v`, `description`) VALUES
    ('auth.daily_checkin_credits', '0', '每日签到奖励(单位:厘;10000=1 积分;0=关闭)')
ON DUPLICATE KEY UPDATE `k` = VALUES(`k`);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS `user_checkins`;
-- 保留 settings 记录: 即使回滚签到表,该键继续存在也不会影响其它业务。
-- +goose StatementEnd
