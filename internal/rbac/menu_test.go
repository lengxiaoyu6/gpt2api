package rbac

import "testing"

func TestMenuForRoleIncludesPersonalSecurity(t *testing.T) {
	menus := MenuForRole("user")
	for _, menu := range menus {
		if menu.Key != "personal" {
			continue
		}
		for _, child := range menu.Children {
			if child.Key == "personal.security" {
				if child.Title != "安全中心" {
					t.Fatalf("title = %q", child.Title)
				}
				if child.Path != "/personal/security" {
					t.Fatalf("path = %q", child.Path)
				}
				if len(child.Perms) != 1 || child.Perms[0] != PermSelfProfile {
					t.Fatalf("perms = %#v", child.Perms)
				}
				return
			}
		}
	}
	t.Fatal("personal.security not found in user menu")
}

func TestMenuForRoleIncludesAdminRequestLogs(t *testing.T) {
	menus := MenuForRole("admin")
	for _, menu := range menus {
		if menu.Key != "admin" {
			continue
		}
		for _, child := range menu.Children {
			if child.Key == "admin.request-logs" {
				if child.Title != "请求记录" {
					t.Fatalf("title = %q", child.Title)
				}
				if child.Path != "/admin/request-logs" {
					t.Fatalf("path = %q", child.Path)
				}
				if len(child.Perms) != 1 || child.Perms[0] != PermUsageReadAll {
					t.Fatalf("perms = %#v", child.Perms)
				}
				return
			}
		}
	}
	t.Fatal("admin.request-logs not found in admin menu")
}
