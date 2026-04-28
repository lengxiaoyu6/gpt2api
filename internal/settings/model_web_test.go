package settings

import "testing"

func TestPublicSnapshotIncludesWebDomain(t *testing.T) {
	svc := &Service{cache: map[string]string{}}

	snap := svc.PublicSnapshot()
	if _, ok := snap[SiteWebDomain]; !ok {
		t.Fatalf("expected %s in public snapshot", SiteWebDomain)
	}
	if _, ok := snap[SiteLegacyWAPDomain]; ok {
		t.Fatalf("legacy %s should not be returned by public snapshot", SiteLegacyWAPDomain)
	}
}

func TestDefByKeyReturnsPublicWebDomain(t *testing.T) {
	def, ok := DefByKey(SiteWebDomain)
	if !ok {
		t.Fatal("expected site.web_domain to be registered")
	}
	if !def.Public {
		t.Fatal("expected site.web_domain to be public")
	}
	if def.Category != "site" {
		t.Fatalf("expected site category, got %s", def.Category)
	}
	if def.Label != "Web 端域名" {
		t.Fatalf("unexpected label: %s", def.Label)
	}
}

func TestLegacyWAPDomainIsCompatibilityOnly(t *testing.T) {
	if _, ok := DefByKey(SiteLegacyWAPDomain); ok {
		t.Fatal("legacy site.wap_domain should not be editable")
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
