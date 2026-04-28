import React from 'react'
import { createPortal } from 'react-dom'
import { Bell, X } from 'lucide-react'

import { listPublicAnnouncements, type Announcement } from '@/api/announcement'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  active: boolean
}

const READ_KEY = 'gpt2api.announcement.read.ids'

function readIDs(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_KEY) || '[]')
    if (Array.isArray(parsed)) {
      return parsed.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    }
  } catch {
    return []
  }
  return []
}

function writeIDs(ids: number[]) {
  const uniq = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)))
  localStorage.setItem(READ_KEY, JSON.stringify(uniq))
}

export default function AnnouncementCenter({ active }: Props) {
  const [items, setItems] = React.useState<Announcement[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [popupOpen, setPopupOpen] = React.useState(false)
  const [listOpen, setListOpen] = React.useState(false)
  const [current, setCurrent] = React.useState<Announcement | null>(null)

  const load = React.useCallback(async () => {
    if (!active || loading || loaded) return
    setLoading(true)
    try {
      const data = await listPublicAnnouncements()
      const nextItems = data.items || []
      setItems(nextItems)
      setLoaded(true)
      const read = new Set(readIDs())
      const firstUnread = nextItems.find((item) => !read.has(item.id))
      if (firstUnread) {
        setCurrent(firstUnread)
        setPopupOpen(true)
      }
    } catch {
      setItems([])
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [active, loaded, loading])

  React.useEffect(() => {
    void load()
  }, [load])

  const acknowledge = () => {
    if (current) {
      writeIDs([...readIDs(), current.id])
    }
    setPopupOpen(false)
  }

  const openList = () => {
    setListOpen(true)
    void load()
  }

  if (!active) return null

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={openList}
        className="h-9 rounded-full border border-border/60 bg-secondary/70 px-3 shadow-sm"
      >
        <Bell className="h-4 w-4" />
        公告
      </Button>

      {popupOpen && current && (
        <AnnouncementDialog title={current.title} onClose={() => setPopupOpen(false)}>
          <div className="max-h-[48vh] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-muted/45 px-4 py-3 text-left text-sm leading-7 text-muted-foreground shadow-inner">
            {current.content}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11 rounded-2xl" onClick={() => setListOpen(true)}>
              公告列表
            </Button>
            <Button className="h-11 rounded-2xl" onClick={acknowledge}>
              知道了
            </Button>
          </div>
        </AnnouncementDialog>
      )}

      {listOpen && (
        <AnnouncementDialog title="公告列表" onClose={() => setListOpen(false)}>
          <div className={cn('max-h-[62vh] space-y-3 overflow-y-auto text-left', loading && 'opacity-60')}>
            {items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                暂无公告
              </div>
            )}
            {items.map((item) => (
              <article key={item.id} className="rounded-2xl border border-border/70 bg-secondary/30 p-4">
                <h3 className="text-sm font-bold leading-6">{item.title}</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
                  {item.content}
                </p>
              </article>
            ))}
          </div>
        </AnnouncementDialog>
      )}
    </>
  )
}

function AnnouncementDialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  const titleId = React.useId()

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[70] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-950/45 px-5 py-8 backdrop-blur-md"
    >
      <section className="relative w-full max-w-[min(92vw,42rem)] overflow-hidden rounded-[2rem] border border-white/70 bg-background/95 p-5 text-center text-foreground shadow-[0_24px_80px_rgba(15,23,42,0.28)] ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-card/95 dark:ring-white/10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="关闭"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-background/70 text-muted-foreground shadow-sm backdrop-blur hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="relative mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-8 ring-primary/5">
          <Bell className="h-5 w-5" />
        </div>
        <div className="relative mb-2 text-xs font-semibold tracking-[0.24em] text-muted-foreground">
          重要公告
        </div>
        <h2 id={titleId} className="relative mb-4 text-xl font-black tracking-tight">
          {title}
        </h2>
        {children}
      </section>
    </div>,
    document.body,
  )
}
