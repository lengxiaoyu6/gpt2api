import { useEffect, useState } from 'react'
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

    const load = async () => {
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

    void load()

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="返回个人中心"
          onClick={onBack}
          className="rounded-full"
        >
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

      {loading ? (
        <div className="rounded-3xl border border-border/50 bg-secondary/20 px-4 py-10 text-center text-sm text-muted-foreground">
          积分记录加载中
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-border/50 bg-secondary/20 px-4 py-10 text-center text-sm text-muted-foreground">
          暂无积分记录
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const amount = formatSignedCredit(item.amount)
            const title = item.remark || TYPE_LABEL[item.type] || '积分变动'
            const typeLabel = TYPE_LABEL[item.type] || item.type
            const amountClassName = item.amount > 0 ? 'text-emerald-600' : item.amount < 0 ? 'text-rose-600' : 'text-foreground'

            return (
              <div key={item.id} className="rounded-3xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-bold">{title}</div>
                    <div className="text-xs text-muted-foreground">{typeLabel}</div>
                  </div>
                  <div className={`text-sm font-black ${amountClassName}`}>{amount}</div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>余额 {formatCredit(item.balance_after)}</span>
                  <span>{item.created_at}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
