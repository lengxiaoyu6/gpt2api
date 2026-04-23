package settings

import "testing"

func TestPublicSnapshotIncludesWAPDomain(t *testing.T) {
	svc := &Service{cache: map[string]string{}}

	snap := svc.PublicSnapshot()
	if _, ok := snap[SiteWAPDomain]; !ok {
		t.Fatalf("expected %s in public snapshot", SiteWAPDomain)
	}
}

func TestDefByKeyReturnsPublicWAPDomain(t *testing.T) {
	def, ok := DefByKey(SiteWAPDomain)
	if !ok {
		t.Fatal("expected site.wap_domain to be registered")
	}
	if !def.Public {
		t.Fatal("expected site.wap_domain to be public")
	}
	if def.Category != "site" {
		t.Fatalf("expected site category, got %s", def.Category)
	}
}

func TestPublicSnapshotIncludesShowcaseURLs(t *testing.T) {
	svc := &Service{cache: map[string]string{}}

	snap := svc.PublicSnapshot()
	if _, ok := snap[SiteShowcaseURLs]; !ok {
		t.Fatalf("expected %s in public snapshot", SiteShowcaseURLs)
	}
}

func TestDefByKeyReturnsPublicShowcaseURLs(t *testing.T) {
	def, ok := DefByKey(SiteShowcaseURLs)
	if !ok {
		t.Fatal("expected site.showcase_urls to be registered")
	}
	if !def.Public {
		t.Fatal("expected site.showcase_urls to be public")
	}
	if def.Category != "site" {
		t.Fatalf("expected site category, got %s", def.Category)
	}
	if def.Type != "string" {
		t.Fatalf("expected site.showcase_urls type string, got %s", def.Type)
	}
}
