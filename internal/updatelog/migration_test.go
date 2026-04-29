package updatelog

import (
	"os"
	"strings"
	"testing"
)

func TestUpdateLogMigrationCreatesPublicManagementTable(t *testing.T) {
	body, err := os.ReadFile("../../sql/migrations/20260429000002_system_update_logs.sql")
	if err != nil {
		t.Fatalf("read update log migration: %v", err)
	}
	sql := string(body)
	checks := []string{
		"CREATE TABLE IF NOT EXISTS `system_update_logs`",
		"`version` VARCHAR(64) NOT NULL DEFAULT ''",
		"`title` VARCHAR(160) NOT NULL",
		"`content` TEXT NOT NULL",
		"`published_at` DATETIME NULL",
		"KEY `idx_system_update_logs_public` (`enabled`, `sort_order`, `published_at`, `id`)",
	}
	for _, check := range checks {
		if !strings.Contains(sql, check) {
			t.Fatalf("update log migration missing %q", check)
		}
	}
}
