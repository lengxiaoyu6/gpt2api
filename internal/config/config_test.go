package config

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestLoadImageConfig(t *testing.T) {
	t.Cleanup(func() {
		global = nil
		once = sync.Once{}
	})

	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	raw := `app:
  name: demo
scheduler:
  min_interval_sec: 60
upstream:
  base_url: "https://chatgpt.com"
image:
  same_conversation_max_turns: 3
  poll_max_wait_sec: 120
  poll_interval_sec: 3
  poll_stable_rounds: 2
  preview_wait_sec: 15
`
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.Image.SameConversationMaxTurns != 3 {
		t.Fatalf("same_conversation_max_turns = %d", cfg.Image.SameConversationMaxTurns)
	}
	if cfg.Image.PollMaxWaitSec != 120 {
		t.Fatalf("poll_max_wait_sec = %d", cfg.Image.PollMaxWaitSec)
	}
	if cfg.Image.PreviewWaitSec != 15 {
		t.Fatalf("preview_wait_sec = %d", cfg.Image.PreviewWaitSec)
	}
}
