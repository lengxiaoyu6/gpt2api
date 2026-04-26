package announcement

import (
	"os"
	"strings"
	"testing"
)

func TestAnnouncementMigrationsKeepExistingTableAndAddSortOrder(t *testing.T) {
	baseMigration, err := os.ReadFile("../../sql/migrations/20260426000004_announcements.sql")
	if err != nil {
		t.Fatalf("read base announcement migration: %v", err)
	}
	if strings.Contains(string(baseMigration), "DROP TABLE IF EXISTS `announcements`") {
		t.Fatalf("announcement migration must preserve pre-existing announcements table on rollback")
	}

	compatMigration, err := os.ReadFile("../../sql/migrations/20260426000005_announcements_sort_order_compat.sql")
	if err != nil {
		t.Fatalf("read compatibility migration: %v", err)
	}
	sql := string(compatMigration)
	checks := []string{
		"information_schema.COLUMNS",
		"TABLE_NAME   = 'announcements'",
		"COLUMN_NAME  = 'sort_order'",
		"ALTER TABLE `announcements` ADD COLUMN `sort_order` INT NOT NULL DEFAULT 0",
		"information_schema.STATISTICS",
		"INDEX_NAME   = 'idx_announcements_enabled_sort'",
		"ALTER TABLE `announcements` ADD KEY `idx_announcements_enabled_sort` (`enabled`, `sort_order`, `id`)",
	}
	for _, check := range checks {
		if !strings.Contains(sql, check) {
			t.Fatalf("compatibility migration missing %q", check)
		}
	}
}
