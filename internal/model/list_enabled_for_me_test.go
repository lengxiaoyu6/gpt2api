package model

import (
	"context"
	"testing"

	"github.com/jmoiron/sqlx"

	_ "github.com/mattn/go-sqlite3"
)

func TestListEnabledForMeReportsImageChannelAvailability(t *testing.T) {
	db := sqlx.MustOpen("sqlite3", ":memory:")
	t.Cleanup(func() { _ = db.Close() })

	for _, stmt := range []string{
		`CREATE TABLE models (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			slug TEXT NOT NULL,
			type TEXT NOT NULL,
			upstream_model_slug TEXT NOT NULL,
			input_price_per_1m INTEGER NOT NULL DEFAULT 0,
			output_price_per_1m INTEGER NOT NULL DEFAULT 0,
			cache_read_price_per_1m INTEGER NOT NULL DEFAULT 0,
			image_price_per_call INTEGER NOT NULL DEFAULT 0,
			supports_multi_image INTEGER NOT NULL DEFAULT 1,
			supports_output_size INTEGER NOT NULL DEFAULT 1,
			description TEXT NOT NULL DEFAULT '',
			enabled INTEGER NOT NULL DEFAULT 1,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			deleted_at DATETIME NULL
		)`,
		`CREATE TABLE upstream_channels (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			type TEXT NOT NULL,
			base_url TEXT NOT NULL,
			api_key_enc TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1,
			priority INTEGER NOT NULL DEFAULT 100,
			weight INTEGER NOT NULL DEFAULT 1,
			timeout_s INTEGER NOT NULL DEFAULT 120,
			ratio REAL NOT NULL DEFAULT 1,
			extra TEXT NULL,
			status TEXT NOT NULL DEFAULT 'healthy',
			fail_count INTEGER NOT NULL DEFAULT 0,
			last_test_at DATETIME NULL,
			last_test_ok INTEGER NULL,
			last_test_error TEXT NOT NULL DEFAULT '',
			remark TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			deleted_at DATETIME NULL
		)`,
		`CREATE TABLE channel_model_mappings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			channel_id INTEGER NOT NULL,
			local_model TEXT NOT NULL,
			upstream_model TEXT NOT NULL,
			modality TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1,
			priority INTEGER NOT NULL DEFAULT 100,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`INSERT INTO models
			(slug, type, upstream_model_slug, image_price_per_call, supports_output_size, description, enabled)
		VALUES
			('gpt-image-2', 'image', 'gpt-image-2', 10, 0, 'local image', 1),
			('gpt-image-2-api', 'image', 'gpt-5.4', 10, 0, 'upstream image', 1),
			('gpt-5.4', 'chat', 'gpt-5.4', 0, 0, 'chat', 1)`,
		`INSERT INTO upstream_channels
			(name, type, base_url, api_key_enc, enabled)
		VALUES
			('openai-image', 'openai', 'https://example.com/v1/responses', 'enc', 1),
			('disabled-image', 'openai', 'https://disabled.example.com/v1/responses', 'enc', 0)`,
		`INSERT INTO channel_model_mappings
			(channel_id, local_model, upstream_model, modality, enabled)
		VALUES
			(1, 'gpt-image-2-api', 'gpt-5.4', 'image', 1),
			(2, 'gpt-image-2', 'gpt-5.4', 'image', 1)`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("exec %q: %v", stmt, err)
		}
	}

	dao := NewDAO(db)
	rows, err := dao.ListEnabledForMe(context.Background())
	if err != nil {
		t.Fatalf("ListEnabledForMe: %v", err)
	}

	bySlug := make(map[string]*Model, len(rows))
	for _, row := range rows {
		bySlug[row.Slug] = row
	}

	if got := bySlug["gpt-image-2"]; got == nil {
		t.Fatalf("missing gpt-image-2")
	} else if got.HasImageChannel {
		t.Fatalf("gpt-image-2 HasImageChannel = true, want false")
	} else if !got.SupportsOutputSize {
		t.Fatalf("gpt-image-2 SupportsOutputSize = false, want true for local account pool")
	}

	if got := bySlug["gpt-image-2-api"]; got == nil {
		t.Fatalf("missing gpt-image-2-api")
	} else if !got.HasImageChannel {
		t.Fatalf("gpt-image-2-api HasImageChannel = false, want true")
	} else if got.SupportsOutputSize {
		t.Fatalf("gpt-image-2-api SupportsOutputSize = true, want stored false for upstream channel")
	}

	if got := bySlug["gpt-5.4"]; got == nil {
		t.Fatalf("missing gpt-5.4")
	} else if got.HasImageChannel {
		t.Fatalf("gpt-5.4 HasImageChannel = true, want false")
	}
}
