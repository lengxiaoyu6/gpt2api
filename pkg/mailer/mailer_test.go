package mailer

import (
	"strings"
	"testing"

	"go.uber.org/zap"
)

func TestDynamicProviderChangesDisabledState(t *testing.T) {
	cfg := Config{}
	m := NewWithProvider(func() Config { return cfg }, zap.NewNop())
	defer m.Close()

	if !m.Disabled() {
		t.Fatal("expected mailer to start disabled")
	}

	cfg = Config{Host: "smtp.example.test", Port: 465, Username: "u", Password: "p", From: "noreply@example.test", UseTLS: true}
	if m.Disabled() {
		t.Fatal("expected mailer to become enabled after provider config changes")
	}

	cfg = Config{}
	if !m.Disabled() {
		t.Fatal("expected mailer to become disabled again")
	}
}

func TestDynamicSendSyncReturnsDisabledWhenProviderHasNoHost(t *testing.T) {
	m := NewWithProvider(func() Config { return Config{} }, zap.NewNop())
	defer m.Close()

	err := m.SendSync(Message{To: "user@example.test", Subject: "hello", HTML: "<p>hello</p>"})
	if err == nil {
		t.Fatal("expected disabled error")
	}
	if !strings.Contains(err.Error(), "SMTP not configured") {
		t.Fatalf("unexpected error: %v", err)
	}
}
