package settings

import "testing"

func TestDefByKeyReturnsImageStorageModeSelect(t *testing.T) {
	def, ok := DefByKey(StorageImageMode)
	if !ok {
		t.Fatal("expected storage.image_storage_mode to be registered")
	}
	if def.Type != "select" {
		t.Fatalf("expected select type, got %s", def.Type)
	}
	if def.Category != "storage" {
		t.Fatalf("expected storage category, got %s", def.Category)
	}
	if def.Default != "local" {
		t.Fatalf("expected local default, got %s", def.Default)
	}
	if len(def.Options) != 2 {
		t.Fatalf("expected 2 options, got %d", len(def.Options))
	}
	local, cloud := def.Options[0], def.Options[1]
	if local.Value != "local" || local.Disabled {
		t.Fatalf("unexpected local option: %#v", local)
	}
	if cloud.Value != "cloud" || cloud.Disabled {
		t.Fatalf("unexpected cloud option: %#v", cloud)
	}
}

func TestDefByKeyRegistersCloudConfig(t *testing.T) {
	def, ok := DefByKey(StorageCloudConfig)
	if !ok {
		t.Fatal("expected storage.cloud_config to be registered")
	}
	if def.Type != "sanyue_img_hub" {
		t.Fatalf("expected sanyue_img_hub type, got %s", def.Type)
	}
	if def.Category != "storage" {
		t.Fatalf("expected storage category, got %s", def.Category)
	}
	if def.Default != DefaultSanyueImgHubConfigJSON {
		t.Fatalf("unexpected default config: %s", def.Default)
	}
}

func TestParseSanyueImgHubConfigUsesDefaultWhenEmpty(t *testing.T) {
	cfg, err := ParseSanyueImgHubConfig("")
	if err != nil {
		t.Fatalf("ParseSanyueImgHubConfig: %v", err)
	}
	if cfg.UploadURL != "https://img2.oaiapis.com/upload" {
		t.Fatalf("UploadURL = %q", cfg.UploadURL)
	}
	if cfg.AuthCode != "" {
		t.Fatalf("AuthCode = %q", cfg.AuthCode)
	}
	if cfg.ServerCompress {
		t.Fatal("ServerCompress should default to false")
	}
	if cfg.ReturnFormat != "full" {
		t.Fatalf("ReturnFormat = %q", cfg.ReturnFormat)
	}
	if cfg.UploadChannel != "telegram" {
		t.Fatalf("UploadChannel = %q", cfg.UploadChannel)
	}
}

func TestServiceStorageHelpers(t *testing.T) {
	svc := NewService(nil)

	if got := svc.ImageStorageMode(); got != "local" {
		t.Fatalf("ImageStorageMode() = %q", got)
	}
	if got := svc.CloudConfig(); got != DefaultSanyueImgHubConfigJSON {
		t.Fatalf("CloudConfig() default = %q", got)
	}

	svc.cache = map[string]string{
		StorageImageMode:   "cloud",
		StorageCloudConfig: `{"upload_url":"https://example.test/upload","auth_code":"abc","server_compress":true,"return_format":"full","upload_channel":"huggingface"}`,
	}
	if got := svc.ImageStorageMode(); got != "cloud" {
		t.Fatalf("ImageStorageMode() override = %q", got)
	}
	if got := svc.CloudConfig(); got != `{"upload_url":"https://example.test/upload","auth_code":"abc","server_compress":true,"return_format":"full","upload_channel":"huggingface"}` {
		t.Fatalf("CloudConfig() override = %q", got)
	}
}

func TestValidateStorageSnapshotRequiresCloudFields(t *testing.T) {
	cases := []struct {
		name     string
		config   string
		wantPart string
	}{
		{
			name:     "missing auth code",
			config:   `{"upload_url":"https://example.test/upload","auth_code":"","server_compress":false,"return_format":"full"}`,
			wantPart: "auth_code",
		},
		{
			name:     "invalid upload url",
			config:   `{"upload_url":"ftp://example.test/upload","auth_code":"abc","server_compress":false,"return_format":"full"}`,
			wantPart: "upload_url",
		},
		{
			name:     "empty return format",
			config:   `{"upload_url":"https://example.test/upload","auth_code":"abc","server_compress":false,"return_format":""}`,
			wantPart: "return_format",
		},
		{
			name:     "invalid server compress",
			config:   `{"upload_url":"https://example.test/upload","auth_code":"abc","server_compress":"bad","return_format":"full"}`,
			wantPart: "server_compress",
		},
		{
			name:     "invalid upload channel",
			config:   `{"upload_url":"https://example.test/upload","auth_code":"abc","server_compress":false,"return_format":"full","upload_channel":"bad"}`,
			wantPart: "upload_channel",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateStorageSnapshot(map[string]string{
				StorageImageMode:   "cloud",
				StorageCloudConfig: tc.config,
			})
			if err == nil {
				t.Fatal("expected validation error")
			}
			if got := err.Error(); got == "" || !contains(got, tc.wantPart) {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestValidateStorageSnapshotUsesMergedMode(t *testing.T) {
	snapshot := map[string]string{
		StorageImageMode:   "local",
		StorageCloudConfig: `{"upload_url":"https://example.test/upload","auth_code":"","server_compress":false,"return_format":"full"}`,
	}
	if err := ValidateStorageSnapshot(snapshot); err != nil {
		t.Fatalf("local snapshot should allow incomplete cloud config: %v", err)
	}

	merged := map[string]string{
		StorageImageMode:   "cloud",
		StorageCloudConfig: snapshot[StorageCloudConfig],
	}
	if err := ValidateStorageSnapshot(merged); err == nil {
		t.Fatal("expected merged cloud snapshot to fail")
	}

	backToLocal := map[string]string{
		StorageImageMode:   "local",
		StorageCloudConfig: `{"upload_url":"bad","auth_code":"","server_compress":"bad","return_format":"","upload_channel":"bad"}`,
	}
	if err := ValidateStorageSnapshot(backToLocal); err != nil {
		t.Fatalf("local snapshot should skip cloud validation: %v", err)
	}
}

func TestValidateStorageSnapshotAllowsLegacyConfigWithoutUploadChannel(t *testing.T) {
	err := ValidateStorageSnapshot(map[string]string{
		StorageImageMode:   "cloud",
		StorageCloudConfig: `{"upload_url":"https://example.test/upload","auth_code":"abc","server_compress":false,"return_format":"full"}`,
	})
	if err != nil {
		t.Fatalf("legacy cloud config should stay valid: %v", err)
	}
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && (s == sub || contains(s[1:], sub) || s[:len(sub)] == sub))
}
