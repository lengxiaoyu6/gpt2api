import React from 'react'
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
          <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
            {current.content}
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="h-10 flex-1 rounded-2xl" onClick={() => setListOpen(true)}>
              公告列表
            </Button>
            <Button className="h-10 flex-1 rounded-2xl" onClick={acknowledge}>
              知道了
            </Button>
          </div>
        </AnnouncementDialog>
      )}

      {listOpen && (
        <AnnouncementDialog title="公告列表" onClose={() => setListOpen(false)}>
          <div className={cn('max-h-[62vh] space-y-3 overflow-y-auto', loading && 'opacity-60')}>
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <section className="w-full max-w-sm rounded-[28px] border border-border/70 bg-background p-5 text-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black tracking-tight">{title}</h2>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </section>
    </div>
  )
}

