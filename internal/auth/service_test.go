package auth

import (
	"errors"
	"reflect"
	"testing"
	"unsafe"

	"golang.org/x/crypto/bcrypt"

	"github.com/432539/gpt2api/internal/settings"
)

func TestHashPasswordUsesDynamicMinLength(t *testing.T) {
	t.Helper()

	cfg := settings.NewService(nil)
	setSettingsCache(cfg, map[string]string{settings.AuthPasswordMinLength: "12"})

	svc := NewService(nil, nil, bcrypt.MinCost)
	svc.SetSettings(cfg)

	if _, err := svc.HashPassword("short123"); !errors.Is(err, ErrPasswordTooShort) {
		t.Fatalf("expected ErrPasswordTooShort, got %v", err)
	}

	hash, err := svc.HashPassword("123456789012")
	if err != nil {
		t.Fatalf("HashPassword returned error: %v", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte("123456789012")); err != nil {
		t.Fatalf("hash does not match plaintext: %v", err)
	}
}

func setSettingsCache(svc *settings.Service, values map[string]string) {
	field := reflect.ValueOf(svc).Elem().FieldByName("cache")
	reflect.NewAt(field.Type(), unsafe.Pointer(field.UnsafeAddr())).Elem().Set(reflect.ValueOf(values))
}
