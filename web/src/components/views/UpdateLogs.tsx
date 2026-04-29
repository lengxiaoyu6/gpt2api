import React from 'react'
import { ArrowLeft, CalendarDays, FileClock, Loader2, Sparkles } from 'lucide-react'

import { listPublicUpdateLogs, type UpdateLog } from '@/api/update-log'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  pageSize?: number
  onBackHome?: () => void
}

function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function getDisplayDate(item: UpdateLog) {
  return formatDate(item.published_at || item.created_at)
}

export default function UpdateLogsView({ pageSize = 20, onBackHome }: Props) {
  const [items, setItems] = React.useState<UpdateLog[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)

  const loadPage = React.useCallback(async (offset: number, append: boolean) => {
    setLoading(true)
    try {
      const data = await listPublicUpdateLogs({ limit: pageSize, offset })
      const nextItems = data.items || []
      setItems((current) => (append ? [...current, ...nextItems] : nextItems))
      setTotal(Number.isFinite(data.total) ? data.total : nextItems.length)
    } catch {
      if (!append) {
        setItems([])
        setTotal(0)
      }
    } finally {
      setLoaded(true)
      setLoading(false)
    }
  }, [pageSize])

  React.useEffect(() => {
    void loadPage(0, false)
  }, [loadPage])

  const handleBackHome = () => {
    if (onBackHome) {
      onBackHome()
      return
    }
    window.history.back()
  }

  const loadMore = () => {
    if (loading) return
    void loadPage(items.length, true)
  }

  const hasMore = items.length < total

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 sm:px-6 lg:px-0 lg:py-8">

      <section
        aria-label="系统更新日志时间线"
        className="mt-5 rounded-[2rem] border border-border/60 bg-card/55 p-4 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.45)] sm:p-6 lg:mt-6 lg:p-8"
      >
        {items.length === 0 && loading && (
          <div className="flex min-h-48 items-center justify-center rounded-3xl border border-dashed border-border bg-secondary/25 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在加载更新日志
          </div>
        )}

        {items.length === 0 && loaded && !loading && (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-secondary/25 px-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-8 ring-primary/5">
              <FileClock className="h-5 w-5" />
            </div>
            <div className="text-base font-bold">暂无更新日志</div>
            <p className="mt-2 text-sm text-muted-foreground">系统记录发布后会显示在此页面。</p>
          </div>
        )}

        {items.length > 0 && (
          <ol role="list" aria-label="更新日志时间线" className="relative space-y-5 before:absolute before:bottom-8 before:left-[1.05rem] before:top-8 before:w-px before:bg-gradient-to-b before:from-primary/50 before:via-border before:to-transparent sm:before:left-[1.2rem]">
            {items.map((item, index) => {
              const date = getDisplayDate(item)
              return (
                <li key={item.id} className="relative pl-10 sm:pl-12">
                  <div className="absolute left-0 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-background text-primary shadow-sm ring-4 ring-primary/5 sm:h-10 sm:w-10">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_6px_color-mix(in_oklab,var(--primary)_14%,transparent)]" />
                  </div>
                  <article className={cn(
                    'rounded-[1.5rem] border border-border/70 bg-background/72 p-4 text-left shadow-sm shadow-black/5 transition-transform duration-200 sm:p-5',
                    index === 0 && 'ring-1 ring-primary/15',
                  )}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.version ? (
                          <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-xs font-semibold text-primary">
                            {item.version}
                          </span>
                        ) : null}
                        {index === 0 ? (
                          <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-bold text-primary">
                            最新
                          </span>
                        ) : null}
                      </div>
                      {date ? (
                        <time className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {date}
                        </time>
                      ) : null}
                    </div>
                    <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground sm:text-[15px]">
                      {item.content}
                    </p>
                  </article>
                </li>
              )
            })}
          </ol>
        )}

        {hasMore && (
          <Button
            type="button"
            aria-label="加载更多更新日志"
            variant="outline"
            onClick={loadMore}
            disabled={loading}
            className="mt-6 h-12 w-full rounded-2xl font-bold"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            加载更多更新日志
          </Button>
        )}
      </section>
    </div>
  )
}
