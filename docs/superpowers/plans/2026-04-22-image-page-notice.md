# Image Page Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Web 与移动端生图页增加一条由后台系统设置维护的公告文案。

**Architecture:** 复用现有 `system_settings` 白名单与公开站点信息接口，在后端新增公开键 `site.image_notice`，后台系统设置页按键名切换为多行输入框，Web 与移动端分别从已有站点信息状态中读取并渲染公告。

**Tech Stack:** Go, Gin, Vue 3, Pinia, React, Zustand, Vitest, node:test

---

### Task 1: 先补失败测试

**Files:**
Create: `internal/settings/service_test.go`
Create: `web/tests/image-page-notice.node.test.mjs`
Create: `wap/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: 编写后端失败测试**

```go
func TestPublicSnapshotIncludesImageNotice(t *testing.T) {
    svc := &Service{cache: map[string]string{}}
    snap := svc.PublicSnapshot()
    if _, ok := snap[SiteImageNotice]; !ok {
        t.Fatalf("expected %s in public snapshot", SiteImageNotice)
    }
}
```

- [ ] **Step 2: 编写 Web 静态失败测试**

```js
test('系统设置声明生图公告键并在后台使用多行输入', () => {
  const modelGo = read('internal/settings/model.go')
  const settingsVue = read('web/src/views/admin/Settings.vue')
  assert.match(modelGo, /SiteImageNotice\s+=\s+"site\.image_notice"/)
  assert.match(modelGo, /Label:\s*"生图页公告"/)
  assert.match(modelGo, /Public:\s*true/)
  assert.match(settingsVue, /function isTextarea\(it: SettingItem\)/)
  assert.match(settingsVue, /it\.key === 'site\.image_notice'/)
  assert.match(settingsVue, /type="textarea"/)
})
```

```js
test('Web 生图页读取并展示生图公告', () => {
  const playVue = read('web/src/views/personal/OnlinePlay.vue')
  assert.match(playVue, /useSiteStore/)
  assert.match(playVue, /site\.image_notice/)
  assert.match(playVue, /noticeText/)
})
```

- [ ] **Step 3: 编写移动端失败测试**

```tsx
test('generate page renders image notice from site info', () => {
  useStore.setState({
    siteInfo: {
      'site.name': 'GPT2API',
      'site.description': 'AI 创作平台',
      'site.logo_url': '',
      'site.footer': '',
      'auth.allow_register': 'true',
      'site.image_notice': '当前高峰期生成速度可能波动',
    },
  })

  render(<GenerateView />)

  expect(screen.getByText('当前高峰期生成速度可能波动')).toBeInTheDocument()
})
```

- [ ] **Step 4: 运行测试确认失败**

Run: `go test ./internal/settings -run TestPublicSnapshotIncludesImageNotice -v`
Expected: FAIL，提示 `SiteImageNotice` 尚未定义或公告键未进入公开快照。

Run: `cd web && node --test tests/image-page-notice.node.test.mjs`
Expected: FAIL，断言指向设置键、后台多行输入或页面公告逻辑缺失。

Run: `cd wap && npm run test -- --run src/components/generate.image-notice.test.tsx`
Expected: FAIL，断言指向 `GenerateView` 尚未渲染公告。

### Task 2: 实现后端设置键与后台配置输入

**Files:**
Modify: `internal/settings/model.go`
Modify: `web/src/views/admin/Settings.vue`
Test: `go test ./internal/settings -run TestPublicSnapshotIncludesImageNotice -v`
Test: `cd web && node --test tests/image-page-notice.node.test.mjs`

- [ ] **Step 1: 在设置模型中新增公开字符串键**
- [ ] **Step 2: 在后台设置页为公告键切换到多行输入框**
- [ ] **Step 3: 运行定向测试并确认通过**

### Task 3: 实现 Web 与移动端公告展示

**Files:**
Modify: `web/src/stores/site.ts`
Modify: `web/src/views/personal/OnlinePlay.vue`
Modify: `wap/src/store/useStore.ts`
Modify: `wap/src/components/views/Generate.tsx`
Test: `cd web && node --test tests/image-page-notice.node.test.mjs`
Test: `cd wap && npm run test -- --run src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: 为站点默认信息补充公告键默认值**
- [ ] **Step 2: 在 Web 生图页读取并渲染公告**
- [ ] **Step 3: 在移动端生图页读取并渲染公告**
- [ ] **Step 4: 运行定向测试并确认通过**

### Task 4: 完整验证

**Files:**
Modify: `internal/settings/model.go`
Modify: `internal/settings/service_test.go`
Modify: `web/src/stores/site.ts`
Modify: `web/src/views/admin/Settings.vue`
Modify: `web/src/views/personal/OnlinePlay.vue`
Modify: `web/tests/image-page-notice.node.test.mjs`
Modify: `wap/src/store/useStore.ts`
Modify: `wap/src/components/views/Generate.tsx`
Modify: `wap/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: 运行后端测试**

Run: `go test ./internal/settings -v`
Expected: PASS。

- [ ] **Step 2: 运行 Web 静态测试**

Run: `cd web && node --test tests/image-page-notice.node.test.mjs`
Expected: PASS。

- [ ] **Step 3: 运行移动端测试**

Run: `cd wap && npm run test -- --run src/components/generate.image-notice.test.tsx`
Expected: PASS。
