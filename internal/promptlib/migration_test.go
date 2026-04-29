package promptlib

import (
	"os"
	"strings"
	"testing"
)

func TestPromptLibraryMigrationCreatesManagementTable(t *testing.T) {
	body, err := os.ReadFile("../../sql/migrations/20260429000003_prompt_library_items.sql")
	if err != nil {
		t.Fatalf("read prompt library migration: %v", err)
	}
	sql := string(body)
	checks := []string{
		"-- +goose Up",
		"-- +goose StatementBegin",
		"-- +goose StatementEnd",
		"-- +goose Down",
		"CREATE TABLE IF NOT EXISTS `prompt_library_items`",
		"`title` VARCHAR(160) NOT NULL",
		"`content` TEXT NOT NULL",
		"`category` VARCHAR(80) NOT NULL DEFAULT '通用'",
		"`preview_image_url` VARCHAR(2048) NOT NULL DEFAULT ''",
		"`tags` JSON NULL",
		"KEY `idx_prompt_library_public` (`enabled`, `category`, `sort_order`, `id`)",
		"KEY `idx_prompt_library_sort` (`sort_order`, `id`)",
		"DROP TABLE IF EXISTS `prompt_library_items`",
	}
	for _, check := range checks {
		if !strings.Contains(sql, check) {
			t.Fatalf("prompt library migration missing %q", check)
		}
	}
}

func TestPromptLibraryPreviewImageMigrationAddsOptionalURL(t *testing.T) {
	body, err := os.ReadFile("../../sql/migrations/20260429000004_prompt_library_preview_image.sql")
	if err != nil {
		t.Fatalf("read prompt library preview image migration: %v", err)
	}
	sql := string(body)
	checks := []string{
		"-- +goose Up",
		"-- +goose StatementBegin",
		"COLUMN_NAME  = 'preview_image_url'",
		"ALTER TABLE `prompt_library_items` ADD COLUMN `preview_image_url` VARCHAR(2048) NOT NULL DEFAULT '''' AFTER `category`",
		"-- +goose Down",
		"ALTER TABLE `prompt_library_items` DROP COLUMN `preview_image_url`",
	}
	for _, check := range checks {
		if !strings.Contains(sql, check) {
			t.Fatalf("prompt library preview image migration missing %q", check)
		}
	}
}
