package settings

import "testing"

func TestPublicSnapshotIncludesImageNotice(t *testing.T) {
	svc := &Service{cache: map[string]string{}}

	snap := svc.PublicSnapshot()
	if _, ok := snap[SiteImageNotice]; !ok {
		t.Fatalf("expected %s in public snapshot", SiteImageNotice)
	}
}

func TestDefByKeyReturnsPublicImageNotice(t *testing.T) {
	def, ok := DefByKey("site.image_notice")
	if !ok {
		t.Fatal("expected site.image_notice to be registered")
	}
	if !def.Public {
		t.Fatal("expected site.image_notice to be public")
	}
}

func TestPublicSnapshotIncludesRequireEmailVerify(t *testing.T) {
	svc := &Service{cache: map[string]string{}}

	snap := svc.PublicSnapshot()
	if _, ok := snap[AuthRequireEmailVerify]; !ok {
		t.Fatalf("expected %s in public snapshot", AuthRequireEmailVerify)
	}
}

func TestDefByKeyReturnsPublicRequireEmailVerify(t *testing.T) {
	def, ok := DefByKey(AuthRequireEmailVerify)
	if !ok {
		t.Fatal("expected auth.require_email_verify to be registered")
	}
	if !def.Public {
		t.Fatal("expected auth.require_email_verify to be public")
	}
}
