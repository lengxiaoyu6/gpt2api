package rbac

import "testing"

func findMenuByKey(items []Menu, key string) *Menu {
	for i := range items {
		item := &items[i]
		if item.Key == key {
			return item
		}
		if child := findMenuByKey(item.Children, key); child != nil {
			return child
		}
	}
	return nil
}

func findDirectChild(menu *Menu, key string) *Menu {
	if menu == nil {
		return nil
	}
	for i := range menu.Children {
		child := &menu.Children[i]
		if child.Key == key {
			return child
		}
	}
	return nil
}

func TestMenuForRoleIncludesPersonalSecurity(t *testing.T) {
	menus := MenuForRole("user")
	child := findMenuByKey(menus, "personal.security")
	if child == nil {
		t.Fatal("personal.security not found in user menu")
	}
	if child.Title != "安全中心" {
		t.Fatalf("title = %q", child.Title)
	}
	if child.Path != "/personal/security" {
		t.Fatalf("path = %q", child.Path)
	}
	if len(child.Perms) != 1 || child.Perms[0] != PermSelfProfile {
		t.Fatalf("perms = %#v", child.Perms)
	}
}

func TestMenuForUserHidesAdminMenu(t *testing.T) {
	menus := MenuForRole("user")
	if menu := findMenuByKey(menus, "admin"); menu != nil {
		t.Fatalf("unexpected admin menu for user role: %#v", menu)
	}
}

func TestMenuForRoleGroupsAdminMenus(t *testing.T) {
	menus := MenuForRole("admin")
	adminMenu := findMenuByKey(menus, "admin")
	if adminMenu == nil {
		t.Fatal("admin menu not found")
	}

	dashboard := findDirectChild(adminMenu, "admin.dashboard")
	if dashboard == nil {
		t.Fatal("admin.dashboard not found in admin menu")
	}
	if dashboard.Title != "后台概览" {
		t.Fatalf("title of admin.dashboard = %q", dashboard.Title)
	}
	if dashboard.Path != "/admin/dashboard" {
		t.Fatalf("path of admin.dashboard = %q", dashboard.Path)
	}
	if len(dashboard.Children) != 0 {
		t.Fatalf("children of admin.dashboard = %#v", dashboard.Children)
	}

	cases := []struct {
		key   string
		title string
	}{
		{key: "admin.user-billing", title: "用户与计费"},
		{key: "admin.models-resources", title: "模型与资源"},
		{key: "admin.data-records", title: "数据与记录"},
		{key: "admin.content-system", title: "内容与系统"},
	}

	for _, tc := range cases {
		group := findDirectChild(adminMenu, tc.key)
		if group == nil {
			t.Fatalf("%s not found in admin menu", tc.key)
		}
		if group.Title != tc.title {
			t.Fatalf("title of %s = %q", tc.key, group.Title)
		}
		if len(group.Children) == 0 {
			t.Fatalf("children of %s is empty", tc.key)
		}
	}
}

func TestNavigationMenuForRoleReturnsTopLevelAdminDashboard(t *testing.T) {
	menus := NavigationMenuForRole("admin")
	if len(menus) == 0 {
		t.Fatal("navigation menu is empty")
	}

	first := menus[0]
	if first.Key != "admin.dashboard" {
		t.Fatalf("first key = %q", first.Key)
	}
	if first.Title != "后台概览" {
		t.Fatalf("first title = %q", first.Title)
	}
	if first.Path != "/admin/dashboard" {
		t.Fatalf("first path = %q", first.Path)
	}
	if len(first.Children) != 0 {
		t.Fatalf("first children = %#v", first.Children)
	}

	for _, item := range menus {
		if item.Key == "admin" || item.Key == "admin.overview" {
			t.Fatalf("unexpected wrapper menu in navigation: %q", item.Key)
		}
	}
}

func TestMenuForRoleIncludesAdminRequestLogs(t *testing.T) {
	menus := MenuForRole("admin")
	group := findMenuByKey(menus, "admin.data-records")
	if group == nil {
		t.Fatal("admin.data-records not found in admin menu")
	}
	child := findDirectChild(group, "admin.request-logs")
	if child == nil {
		t.Fatal("admin.request-logs not found in admin.data-records")
	}
	if child.Title != "请求记录" {
		t.Fatalf("title = %q", child.Title)
	}
	if child.Path != "/admin/request-logs" {
		t.Fatalf("path = %q", child.Path)
	}
	if len(child.Perms) != 1 || child.Perms[0] != PermUsageReadAll {
		t.Fatalf("perms = %#v", child.Perms)
	}
}

func TestMenuForRoleIncludesAdminPrompts(t *testing.T) {
	menus := MenuForRole("admin")
	group := findMenuByKey(menus, "admin.content-system")
	if group == nil {
		t.Fatal("admin.content-system not found in admin menu")
	}
	child := findDirectChild(group, "admin.prompts")
	if child == nil {
		t.Fatal("admin.prompts not found in admin.content-system")
	}
	if child.Title != "Prompt库" {
		t.Fatalf("title = %q", child.Title)
	}
	if child.Path != "/admin/prompts" {
		t.Fatalf("path = %q", child.Path)
	}
	if len(child.Perms) != 1 || child.Perms[0] != PermSystemSetting {
		t.Fatalf("perms = %#v", child.Perms)
	}
}
