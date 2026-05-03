# Announcement Single Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 调整首页公告中心，在首次进入首页时仅弹出一个窗口，并在窗口内顺序浏览多条未读公告，同时消除双挂载带来的重复请求。

**Architecture:** 将公告数据读取与弹窗状态收敛到单一提供器实例中，按钮外观拆分为可复用触发器，以便桌面和移动头部共用同一套状态。公告弹窗维护未读公告集合与当前位置，通过本地已读集合计算自动提醒内容，并在确认后顺序推进。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Vite

---

### Task 1: 补充公告多条弹窗测试

**Files:**
Create: 无
Modify: `web/src/components/announcement-center.test.tsx`
Test: `web/src/components/announcement-center.test.tsx`

- [ ] **Step 1: 写失败测试，覆盖单弹窗多公告浏览与关闭行为**

```tsx
test('shows one popup and lets unread announcements switch inside the same dialog', async () => {
  vi.mocked(api.listPublicAnnouncements).mockResolvedValue({
    items: [
      { id: 11, title: '公告一', content: '内容一', enabled: true, sort_order: 10, created_at: '2026-05-03T00:00:00Z', updated_at: '2026-05-03T00:00:00Z' },
      { id: 12, title: '公告二', content: '内容二', enabled: true, sort_order: 20, created_at: '2026-05-03T00:00:00Z', updated_at: '2026-05-03T00:00:00Z' },
      { id: 13, title: '公告三', content: '内容三', enabled: true, sort_order: 30, created_at: '2026-05-03T00:00:00Z', updated_at: '2026-05-03T00:00:00Z' },
    ],
    total: 3,
  })

  render(<AnnouncementCenter active />)

  const dialog = await screen.findByRole('dialog', { name: '公告一' })
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(within(dialog).getByText('第 1 条，共 3 条')).toBeInTheDocument()

  fireEvent.click(within(dialog).getByRole('button', { name: '下一条' }))
  expect(await screen.findByRole('dialog', { name: '公告二' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '知道了' }))
  await waitFor(() => expect(localStorage.getItem('gpt2api.announcement.read.ids')).toContain('12'))
  expect(screen.getByRole('dialog', { name: '公告三' })).toBeInTheDocument()
})

test('closing popup keeps unread announcements unconfirmed for the next activation', async () => {
  vi.mocked(api.listPublicAnnouncements).mockResolvedValue({
    items: [
      { id: 21, title: '关闭测试公告', content: '内容', enabled: true, sort_order: 10, created_at: '2026-05-03T00:00:00Z', updated_at: '2026-05-03T00:00:00Z' },
    ],
    total: 1,
  })

  const { rerender } = render(<AnnouncementCenter active />)
  expect(await screen.findByRole('dialog', { name: '关闭测试公告' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(localStorage.getItem('gpt2api.announcement.read.ids')).toBe('[]')

  rerender(<AnnouncementCenter active={false} />)
  rerender(<AnnouncementCenter active />)
  expect(await screen.findByRole('dialog', { name: '关闭测试公告' })).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd web && npm test -- src/components/announcement-center.test.tsx`
Expected: 新增用例失败，失败原因应为当前组件只支持单条自动提醒或激活切换后未重新弹出。

- [ ] **Step 3: 写最小实现，支持多条未读公告与激活重开**

```tsx
const [unreadItems, setUnreadItems] = React.useState<Announcement[]>([])
const [popupIndex, setPopupIndex] = React.useState(0)

const openUnreadPopup = React.useCallback((sourceItems: Announcement[]) => {
  const read = new Set(readIDs())
  const nextUnread = sourceItems.filter((item) => !read.has(item.id))
  setUnreadItems(nextUnread)
  setPopupIndex(0)
  setPopupOpen(nextUnread.length > 0)
}, [])

const acknowledge = () => {
  const current = unreadItems[popupIndex]
  if (!current) return

  writeIDs([...readIDs(), current.id])
  const nextUnread = unreadItems.filter((item) => item.id !== current.id)
  if (nextUnread.length === 0) {
    setUnreadItems([])
    setPopupIndex(0)
    setPopupOpen(false)
    return
  }

  setUnreadItems(nextUnread)
  setPopupIndex((index) => Math.min(index, nextUnread.length - 1))
}
```

- [ ] **Step 4: 再次运行测试并确认通过**

Run: `cd web && npm test -- src/components/announcement-center.test.tsx`
Expected: `announcement-center.test.tsx` 全部通过。

- [ ] **Step 5: 提交当前阶段修改**

```bash
git add web/src/components/announcement-center.test.tsx web/src/components/AnnouncementCenter.tsx
git commit -m "feat: support browsing unread announcements in one popup"
```

### Task 2: 拆分公告按钮与单实例提供器

**Files:**
Create: 无
Modify: `web/src/components/AnnouncementCenter.tsx`, `web/src/App.tsx`
Test: `web/src/components/app.integration.test.tsx`

- [ ] **Step 1: 写失败测试，覆盖 App 中公告接口只请求一次**

```tsx
test('home header reuses one announcement manager for desktop and mobile entries', async () => {
  useStore.setState({
    activeTab: 'home',
    bootstrapApp: vi.fn().mockResolvedValue(undefined),
  })

  render(<App />)

  await waitFor(() => expect(announcementApi.listPublicAnnouncements).toHaveBeenCalledTimes(1))
  expect(screen.getAllByRole('button', { name: '公告' })).toHaveLength(2)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd web && npm test -- src/components/app.integration.test.tsx -t "home header reuses one announcement manager for desktop and mobile entries"`
Expected: 失败原因应为当前 `AnnouncementCenter` 被挂载两次，接口请求次数为 `2`。

- [ ] **Step 3: 写最小实现，拆分提供器与触发按钮**

```tsx
export function AnnouncementProvider({ active, children }: { active: boolean; children?: React.ReactNode }) {
  return <AnnouncementContext.Provider value={value}>{children}{dialogs}</AnnouncementContext.Provider>
}

export function AnnouncementTriggerButton() {
  const context = React.useContext(AnnouncementContext)
  return (
    <Button aria-label="公告" onClick={context?.openList}>
      <Bell className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">公告</span>
    </Button>
  )
}
```

并在 `App.tsx` 中改为：

```tsx
<AnnouncementProvider active={activeTab === 'home'}>
  <header>...<AnnouncementTriggerButton />...</header>
  <section>...<AnnouncementTriggerButton />...</section>
  <main>...</main>
</AnnouncementProvider>
```

- [ ] **Step 4: 再次运行测试并确认通过**

Run: `cd web && npm test -- src/components/app.integration.test.tsx -t "home header reuses one announcement manager for desktop and mobile entries"`
Expected: 用例通过，公告请求次数为 `1`。

- [ ] **Step 5: 提交当前阶段修改**

```bash
git add web/src/components/AnnouncementCenter.tsx web/src/App.tsx web/src/components/app.integration.test.tsx
git commit -m "refactor: share one announcement manager across app headers"
```

### Task 3: 补充失败重试与回归验证

**Files:**
Create: 无
Modify: `web/src/components/announcement-center.test.tsx`, `web/src/components/AnnouncementCenter.tsx`, `web/src/components/app.integration.test.tsx`
Test: `web/src/components/announcement-center.test.tsx`, `web/src/components/app.integration.test.tsx`

- [ ] **Step 1: 写失败测试，覆盖接口失败后手动打开再次读取**

```tsx
test('manual announcement open retries loading after initial request failure', async () => {
  vi.mocked(api.listPublicAnnouncements)
    .mockRejectedValueOnce(new Error('公告接口异常'))
    .mockResolvedValueOnce({
      items: [
        { id: 31, title: '重试公告', content: '重试成功', enabled: true, sort_order: 10, created_at: '2026-05-03T00:00:00Z', updated_at: '2026-05-03T00:00:00Z' },
      ],
      total: 1,
    })

  render(<AnnouncementCenter active />)
  await waitFor(() => expect(api.listPublicAnnouncements).toHaveBeenCalledTimes(1))

  fireEvent.click(screen.getByRole('button', { name: '公告' }))

  await waitFor(() => expect(api.listPublicAnnouncements).toHaveBeenCalledTimes(2))
  expect(await screen.findByText('重试成功')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd web && npm test -- src/components/announcement-center.test.tsx -t "manual announcement open retries loading after initial request failure"`
Expected: 失败原因应为当前失败后 `loaded` 状态阻止再次读取，或手动打开未触发新的请求。

- [ ] **Step 3: 写最小实现，允许失败后手动重试并整理回归细节**

```tsx
const [loadFailed, setLoadFailed] = React.useState(false)

const load = React.useCallback(async ({ force = false, openPopup = false } = {}) => {
  if (!active || loading) return
  if (!force && loaded) return

  setLoading(true)
  try {
    const data = await listPublicAnnouncements()
    setLoadFailed(false)
    setLoaded(true)
    setItems(data.items || [])
    if (openPopup) {
      openUnreadPopup(data.items || [])
    }
  } catch {
    setLoadFailed(true)
    setLoaded(false)
  } finally {
    setLoading(false)
  }
}, [active, loaded, loading, openUnreadPopup])

const openList = () => {
  setListOpen(true)
  void load({ force: loadFailed || !loaded })
}
```

- [ ] **Step 4: 运行相关测试并确认通过**

Run: `cd web && npm test -- src/components/announcement-center.test.tsx src/components/app.integration.test.tsx`
Expected: 两个测试文件全部通过。

- [ ] **Step 5: 提交当前阶段修改**

```bash
git add web/src/components/AnnouncementCenter.tsx web/src/components/announcement-center.test.tsx web/src/components/app.integration.test.tsx
git commit -m "test: cover announcement retry and shared manager behavior"
```

### Task 4: 完整验证

**Files:**
Create: 无
Modify: 无
Test: `web/src/components/announcement-center.test.tsx`, `web/src/components/app.integration.test.tsx`

- [ ] **Step 1: 运行针对性组件测试**

Run: `cd web && npm test -- src/components/announcement-center.test.tsx src/components/app.integration.test.tsx`
Expected: 全部通过。

- [ ] **Step 2: 运行前端类型检查**

Run: `cd web && npm run lint`
Expected: TypeScript 检查通过。

- [ ] **Step 3: 运行前端构建**

Run: `cd web && npm run build`
Expected: Vite 构建通过。

- [ ] **Step 4: 记录验证结果并准备交付**

```text
记录已执行命令、通过的测试文件、若存在环境依赖问题则附上失败输出与原因。
```

- [ ] **Step 5: 提交当前阶段修改**

```bash
git status --short
```
