# WAP 积分使用记录局部详情页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 WAP 端“我的”页面中增加可用积分入口，进入带返回按钮的积分使用记录局部详情页并展示全部积分流水。

**Architecture:** 保持 `App` 与底部导航结构不变，仅在 `Profile` 组件内部增加局部视图状态。积分流水通过新的 `wap/src/api/credit.ts` 请求后端 `GET /api/me/credit-logs`，由新的 `ProfileCreditLogs` 子组件负责渲染加载态、空态与列表。

**Tech Stack:** React, TypeScript, Zustand, Vitest, Testing Library, Sonner, lucide-react

---

## 文件结构

### 新增文件

`wap/src/api/credit.ts`
负责定义积分流水类型与接口请求函数。

`wap/src/components/views/ProfileCreditLogs.tsx`
负责请求并渲染积分流水局部详情页。

### 修改文件

`wap/src/components/views/Profile.tsx`
负责维护个人中心主页与积分流水详情页之间的局部切换。

`wap/src/components/app.integration.test.tsx`
负责补充从个人中心进入积分流水详情页并返回的集成测试。

### 可复用上下文

`wap/src/lib/utils.ts`
可复用 `formatCredit`。

`web/src/views/personal/Usage.vue`
参考积分流水类型映射。

## Task 1: 先补充失败的集成测试

**Files:**
Modify: `wap/src/components/app.integration.test.tsx`
Test: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`

- [ ] **Step 1: 为积分流水接口增加 mock，并新增失败测试**

```ts
vi.mock('../api/credit', () => ({
  listMyCreditLogs: vi.fn(),
}))

const creditApi = await import('../api/credit')

test('profile available credits card opens credit log detail and can navigate back', async () => {
  vi.mocked(creditApi.listMyCreditLogs).mockResolvedValue({
    items: [
      {
        id: 1,
        user_id: 1,
        key_id: 0,
        type: 'consume',
        amount: -120000,
        balance_after: 89900,
        ref_id: 'img_task_1',
        remark: '图片生成消费',
        created_at: '2026-04-23 10:00:00',
      },
    ],
    total: 1,
    limit: 20,
    offset: 0,
  })

  useStore.setState({
    activeTab: 'profile',
    user: {
      id: 1,
      email: 'demo@example.com',
      nickname: 'Demo',
      role: 'user',
      status: 'active',
      group_id: 1,
      credit_balance: 89900,
      credit_frozen: 0,
    },
    history: [],
    checkin: {
      enabled: true,
      today: '2026-04-22',
      checked_in: false,
      today_reward_credits: 0,
      checked_at: '',
      last_checked_at: '',
      balance_after: 0,
      awarded_credits: 0,
    },
    bootstrapApp: vi.fn().mockResolvedValue(undefined),
  } as any)

  render(<App />)

  fireEvent.click(screen.getByRole('button', { name: '查看可用积分使用记录' }))

  await waitFor(() => {
    expect(screen.getByText('积分使用记录')).toBeInTheDocument()
  })
  expect(creditApi.listMyCreditLogs).toHaveBeenCalledWith({ limit: 20, offset: 0 })
  expect(screen.getByText('图片生成消费')).toBeInTheDocument()
  expect(screen.getByText('-12.00')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '返回个人中心' }))

  await waitFor(() => {
    expect(screen.getByText('个人中心')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`
Expected: FAIL，提示找不到 `../api/credit` mock、缺少“查看可用积分使用记录”按钮，或缺少“积分使用记录”页面内容。

## Task 2: 增加积分流水接口封装与详情页组件

**Files:**
Create: `wap/src/api/credit.ts`
Create: `wap/src/components/views/ProfileCreditLogs.tsx`
Test: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`

- [ ] **Step 1: 新建积分流水 API 封装**

```ts
import { http } from './http'

export interface CreditLogItem {
  id: number
  user_id: number
  key_id: number
  type: string
  amount: number
  balance_after: number
  ref_id: string
  remark: string
  created_at: string
}

export interface CreditLogListResp {
  items: CreditLogItem[]
  total: number
  limit: number
  offset: number
}

export function listMyCreditLogs(params: { limit?: number; offset?: number } = {}) {
  return http.get('/api/me/credit-logs', { params }) as Promise<CreditLogListResp>
}
```

- [ ] **Step 2: 新建积分流水详情页组件，先满足测试需要的最小行为**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Coins } from 'lucide-react'
import { toast } from 'sonner'
import * as creditApi from '../../api/credit'
import { Button } from '@/components/ui/button'
import { formatCredit } from '@/lib/utils'

interface ProfileCreditLogsProps {
  balance: number
  onBack: () => void
}

const TYPE_LABEL: Record<string, string> = {
  recharge: '充值',
  consume: '消费',
  refund: '退款',
  admin_adjust: '调账',
  redeem: '兑换码',
  checkin: '签到',
  freeze: '冻结',
  unfreeze: '解冻',
}

function formatSignedCredit(value: number) {
  const prefix = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${prefix}${formatCredit(Math.abs(value))}`
}

export default function ProfileCreditLogs({ balance, onBack }: ProfileCreditLogsProps) {
  const [items, setItems] = useState<creditApi.CreditLogItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const run = async () => {
      setLoading(true)
      try {
        const result = await creditApi.listMyCreditLogs({ limit: 20, offset: 0 })
        if (active) {
          setItems(result.items)
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '积分记录加载失败，请稍后重试')
        if (active) {
          setItems([])
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void run()
    return () => {
      active = false
    }
  }, [])

  const content = useMemo(() => {
    if (loading) {
      return <div className="rounded-3xl border border-border/50 bg-secondary/20 px-4 py-10 text-center text-sm text-muted-foreground">积分记录加载中</div>
    }

    if (items.length === 0) {
      return <div className="rounded-3xl border border-border/50 bg-secondary/20 px-4 py-10 text-center text-sm text-muted-foreground">暂无积分记录</div>
    }

    return (
      <div className="space-y-3">
        {items.map((item) => {
          const amountText = formatSignedCredit(item.amount)
          const isIncrease = item.amount > 0
          return (
            <div key={item.id} className="rounded-3xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-bold">{item.remark || TYPE_LABEL[item.type] || '积分变动'}</div>
                  <div className="text-xs text-muted-foreground">{TYPE_LABEL[item.type] || item.type}</div>
                </div>
                <div className={`text-sm font-black ${isIncrease ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {amountText}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>余额 {formatCredit(item.balance_after)}</span>
                <span>{item.created_at}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }, [items, loading])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" aria-label="返回个人中心" onClick={onBack} className="rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-black tracking-tight">积分使用记录</h2>
          <p className="text-xs text-muted-foreground">查看当前账号的全部积分流水</p>
        </div>
      </div>

      <div className="rounded-[28px] border border-border/50 bg-card/60 p-5 shadow-xl backdrop-blur">
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
          <Coins className="h-4 w-4 text-yellow-500" />
          <span>当前可用积分</span>
        </div>
        <div className="mt-3 text-3xl font-black tracking-tight">{formatCredit(balance)}</div>
      </div>

      {content}
    </div>
  )
}
```

- [ ] **Step 3: 运行测试并确认仍有失败点只剩入口切换**

Run: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`
Expected: FAIL，提示 `Profile.tsx` 尚未渲染“查看可用积分使用记录”按钮或尚未切换详情页。

## Task 3: 修改个人中心页入口与局部切换

**Files:**
Modify: `wap/src/components/views/Profile.tsx`
Test: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`

- [ ] **Step 1: 在 `Profile.tsx` 中增加局部视图状态并接入详情页**

```tsx
import ProfileCreditLogs from './ProfileCreditLogs'

type ProfileSection = 'profile' | 'creditLogs'

const [activeSection, setActiveSection] = useState<ProfileSection>('profile')

if (!user) return null

if (activeSection === 'creditLogs') {
  return (
    <div className="px-4 py-8">
      <ProfileCreditLogs
        balance={user.credit_balance}
        onBack={() => setActiveSection('profile')}
      />
    </div>
  )
}
```

- [ ] **Step 2: 将“可用积分”卡片改为按钮并添加无障碍名称**

```tsx
<section className="grid grid-cols-2 gap-4">
  <div className="bg-secondary/30 rounded-2xl p-4 text-center space-y-1">
    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">今日奖励</span>
    <div className="flex items-baseline justify-center gap-0.5">
      <span className="text-lg font-black">{formattedTodayReward}</span>
      <span className="text-[10px] opacity-50 font-bold">分</span>
    </div>
  </div>

  <button
    type="button"
    aria-label="查看可用积分使用记录"
    onClick={() => setActiveSection('creditLogs')}
    className="bg-secondary/30 rounded-2xl p-4 text-center space-y-1 transition-colors hover:bg-secondary/50"
  >
    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">可用积分</span>
    <div className="flex items-baseline justify-center gap-0.5">
      <span className="text-lg font-black">{formattedBalance}</span>
      <span className="text-[10px] opacity-50 font-bold">点</span>
    </div>
  </button>
</section>
```

- [ ] **Step 3: 运行测试并确认通过**

Run: `cd wap && npm run test -- --run src/components/app.integration.test.tsx`
Expected: PASS，新增积分记录详情页测试通过，原有集成测试继续通过。

## Task 4: 完整校验

**Files:**
Modify: `wap/src/components/app.integration.test.tsx`
Create: `wap/src/api/credit.ts`
Create: `wap/src/components/views/ProfileCreditLogs.tsx`
Modify: `wap/src/components/views/Profile.tsx`

- [ ] **Step 1: 运行与本次改动相关的测试集合**

Run: `cd wap && npm run test -- --run src/components/app.integration.test.tsx src/lib/utils.test.ts`
Expected: PASS，显示全部测试通过。

- [ ] **Step 2: 查看变更范围**

Run: `git diff -- wap/src/components/app.integration.test.tsx wap/src/api/credit.ts wap/src/components/views/Profile.tsx wap/src/components/views/ProfileCreditLogs.tsx docs/superpowers/specs/2026-04-23-wap-credit-log-detail-design.md docs/superpowers/plans/2026-04-23-wap-credit-log-detail.md`
Expected: diff 仅包含积分记录详情页相关前端改动与设计、计划文档。
