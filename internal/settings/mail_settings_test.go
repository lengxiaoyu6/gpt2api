package settings

import "testing"

func TestMailSMTPSettingsAreRegistered(t *testing.T) {
	cases := []struct {
		key      string
		typ      string
		category string
		def      string
	}{
		{MailSMTPEnabled, "bool", "mail", "false"},
		{MailSMTPHost, "string", "mail", ""},
		{MailSMTPPort, "int", "mail", "465"},
		{MailSMTPUsername, "string", "mail", ""},
		{MailSMTPPassword, "password", "mail", ""},
		{MailSMTPFrom, "email", "mail", ""},
		{MailSMTPFromName, "string", "mail", "GPT2API"},
		{MailSMTPUseTLS, "bool", "mail", "true"},
	}

	for _, tc := range cases {
		t.Run(tc.key, func(t *testing.T) {
			def, ok := DefByKey(tc.key)
			if !ok {
				t.Fatalf("expected %s to be registered", tc.key)
			}
			if def.Type != tc.typ {
				t.Fatalf("expected type %s, got %s", tc.typ, def.Type)
			}
			if def.Category != tc.category {
				t.Fatalf("expected category %s, got %s", tc.category, def.Category)
			}
			if def.Default != tc.def {
				t.Fatalf("expected default %q, got %q", tc.def, def.Default)
			}
		})
	}
}

func TestServiceMailerConfigReadsSMTPSettings(t *testing.T) {
	svc := NewService(nil)
	svc.cache = map[string]string{
		MailSMTPEnabled:  "true",
		MailSMTPHost:     "smtp.example.test",
		MailSMTPPort:     "587",
		MailSMTPUsername: "mailer@example.test",
		MailSMTPPassword: "secret",
		MailSMTPFrom:     "noreply@example.test",
		MailSMTPFromName: "Example Mail",
		MailSMTPUseTLS:   "false",
	}

	cfg := svc.MailerConfig()
	if cfg.Host != "smtp.example.test" {
		t.Fatalf("Host = %q", cfg.Host)
	}
	if cfg.Port != 587 {
		t.Fatalf("Port = %d", cfg.Port)
	}
	if cfg.Username != "mailer@example.test" {
		t.Fatalf("Username = %q", cfg.Username)
	}
	if cfg.Password != "secret" {
		t.Fatalf("Password = %q", cfg.Password)
	}
	if cfg.From != "noreply@example.test" {
		t.Fatalf("From = %q", cfg.From)
	}
	if cfg.FromName != "Example Mail" {
		t.Fatalf("FromName = %q", cfg.FromName)
	}
	if cfg.UseTLS {
		t.Fatal("UseTLS should be false")
	}
}

func TestServiceMailerConfigDisabledBySwitch(t *testing.T) {
	svc := NewService(nil)
	svc.cache = map[string]string{
		MailSMTPEnabled:  "false",
		MailSMTPHost:     "smtp.example.test",
		MailSMTPPort:     "465",
		MailSMTPUsername: "mailer@example.test",
		MailSMTPPassword: "secret",
		MailSMTPFrom:     "noreply@example.test",
		MailSMTPUseTLS:   "true",
	}

	cfg := svc.MailerConfig()
	if cfg.Host != "" {
		t.Fatalf("disabled mail config should hide host, got %q", cfg.Host)
	}
}
