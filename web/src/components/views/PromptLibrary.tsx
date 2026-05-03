import React from 'react'
import { BookOpen, Copy, Loader2, Search, Send, Tags, X, ZoomIn } from 'lucide-react'
import { toast } from 'sonner'

import { listPublicPromptCategories, listPublicPrompts, type PromptLibraryItem } from '@/api/prompt'
import PageShell from '@/components/PageShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useStore } from '@/store/useStore'

interface Props {
  pageSize?: number
}

type ImageDimensions = {
  width: number
  height: number
}

const previewImageSizeCache = new Map<string, ImageDimensions>()

function buildListParams(keyword: string, category: string, limit: number, offset: number) {
  const params: { keyword?: string; category?: string; limit: number; offset: number } = { limit, offset }
  const nextKeyword = keyword.trim()
  const nextCategory = category.trim()
  if (nextKeyword) params.keyword = nextKeyword
  if (nextCategory) params.category = nextCategory
  return params
}

function previewContent(value: string) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= 120) return text
  return `${text.slice(0, 120)}…`
}

type PromptPreviewFields = {
  preview_image_url?: string | null
  preview_url?: string | null
  previewImageUrl?: string | null
  preview?: string | null
  image_url?: string | null
  imageUrl?: string | null
}

function getPromptPreviewImageURL(item: PromptLibraryItem | null) {
  if (!item) return ''
  const source = item as PromptPreviewFields
  const value = [
    source.preview_image_url,
    source.preview_url,
    source.previewImageUrl,
    source.preview,
    source.image_url,
    source.imageUrl,
  ].find((candidate) => typeof candidate === 'string' && candidate.trim())
  return value?.trim() || ''
}

function normalizeImageDimensions(width: number, height: number): ImageDimensions | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }
  return {
    width: Math.round(width),
    height: Math.round(height),
  }
}

function formatImageDimensions(size: ImageDimensions | null) {
  if (!size) return '读取中'
  return `${size.width} × ${size.height} px`
}

function readCachedImageDimensions(url: string) {
  const key = url.trim()
  if (!key) return null
  return previewImageSizeCache.get(key) || null
}

function cacheImageDimensions(url: string, width: number, height: number) {
  const key = url.trim()
  if (!key) return null
  const size = normalizeImageDimensions(width, height)
  if (!size) return null
  previewImageSizeCache.set(key, size)
  return size
}

export default function PromptLibraryView({ pageSize = 20 }: Props) {
  const { user, openAuthForTab, setActiveTab, setPendingPrompt } = useStore()
  const [items, setItems] = React.useState<PromptLibraryItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const [keywordInput, setKeywordInput] = React.useState('')
  const [keyword, setKeyword] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [categories, setCategories] = React.useState<string[]>([])
  const [selected, setSelected] = React.useState<PromptLibraryItem | null>(null)
  const [selectedPreviewSize, setSelectedPreviewSize] = React.useState<ImageDimensions | null>(null)
  const [previewZoomOpen, setPreviewZoomOpen] = React.useState(false)

  const loadPage = React.useCallback(async (offset: number, append: boolean, nextKeyword = keyword, nextCategory = category) => {
    setLoading(true)
    try {
      const data = await listPublicPrompts(buildListParams(nextKeyword, nextCategory, pageSize, offset))
      const nextItems = data.items || []
      setItems((current) => (append ? [...current, ...nextItems] : nextItems))
      setTotal(Number.isFinite(data.total) ? data.total : nextItems.length)
    } catch (error) {
      if (!append) {
        setItems([])
        setTotal(0)
      }
      toast.error(error instanceof Error ? error.message : 'Prompt 加载失败')
    } finally {
      setLoaded(true)
      setLoading(false)
    }
  }, [category, keyword, pageSize])

  React.useEffect(() => {
    let ignore = false
    void listPublicPromptCategories()
      .then((data) => {
        if (!ignore) {
          setCategories(data.items || [])
        }
      })
      .catch(() => {
        if (!ignore) {
          setCategories([])
        }
      })
    setLoading(true)
    void listPublicPrompts({ limit: pageSize, offset: 0 })
      .then((data) => {
        if (ignore) return
        const nextItems = data.items || []
        setItems(nextItems)
        setTotal(Number.isFinite(data.total) ? data.total : nextItems.length)
      })
      .catch((error) => {
        if (ignore) return
        setItems([])
        setTotal(0)
        toast.error(error instanceof Error ? error.message : 'Prompt 加载失败')
      })
      .finally(() => {
        if (ignore) return
        setLoaded(true)
        setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [pageSize])

  const handleSearch = () => {
    const nextKeyword = keywordInput.trim()
    setKeyword(nextKeyword)
    void loadPage(0, false, nextKeyword, category)
  }

  const loadMore = () => {
    if (loading) return
    void loadPage(items.length, true)
  }

  const copySelected = async () => {
    if (!selected) return
    await navigator.clipboard?.writeText(selected.content)
    toast.success('提示词已复制')
  }

  const sendSelectedToGenerate = () => {
    if (!selected) return
    setPendingPrompt(selected.content)
    if (user) {
      setActiveTab('generate')
    } else {
      openAuthForTab('generate')
    }
    toast.success('已带入生图页')
  }

  const hasMore = items.length < total
  const empty = loaded && !loading && items.length === 0
  const selectedPreviewImageURL = getPromptPreviewImageURL(selected)
  const selectedPreviewSizeLabel = formatImageDimensions(selectedPreviewSize)

  React.useEffect(() => {
    setSelectedPreviewSize(readCachedImageDimensions(selectedPreviewImageURL))
    setPreviewZoomOpen(false)
  }, [selected?.id, selectedPreviewImageURL])

  const handlePreviewImageLoad = React.useCallback((imageURL: string, event: React.SyntheticEvent<HTMLImageElement>) => {
    const nextSize = cacheImageDimensions(imageURL, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
    if (imageURL === selectedPreviewImageURL) {
      setSelectedPreviewSize(nextSize)
    }
  }, [selectedPreviewImageURL])

  const handleSelectedPreviewLoad = React.useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    handlePreviewImageLoad(selectedPreviewImageURL, event)
  }, [handlePreviewImageLoad, selectedPreviewImageURL])

  const handleCardPreviewLoad = React.useCallback((imageURL: string) => (event: React.SyntheticEvent<HTMLImageElement>) => {
    handlePreviewImageLoad(imageURL, event)
  }, [handlePreviewImageLoad])

  const handleOpenPromptDetail = React.useCallback((item: PromptLibraryItem) => {
    const nextPreviewImageURL = getPromptPreviewImageURL(item)
    setSelectedPreviewSize(readCachedImageDimensions(nextPreviewImageURL))
    setSelected(item)
  }, [])

  const handleOpenPreviewZoom = React.useCallback(() => {
    setSelectedPreviewSize(readCachedImageDimensions(selectedPreviewImageURL))
    setPreviewZoomOpen(true)
  }, [selectedPreviewImageURL])

  const selectedPreviewFetchPriority = selectedPreviewSize ? 'high' : 'auto'

  return (
    <PageShell width="wide" className="space-y-5 lg:space-y-7">
      <section className="overflow-hidden rounded-[2rem] border border-border/60 bg-card/65 shadow-[0_22px_70px_-44px_rgba(15,23,42,0.5)] backdrop-blur-xl">
        <div className="relative isolate px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.18),transparent_34%),radial-gradient(circle_at_82%_20%,rgba(14,165,233,0.14),transparent_30%)]" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                <BookOpen className="h-3.5 w-3.5" />
                灵感库
              </div>
              <h1 className="text-2xl font-black tracking-tight lg:text-3xl">选择 Prompt 开始创作</h1>
              <p className="text-sm leading-6 text-muted-foreground">提示词收集于网络，仅供学习交流使用。如有侵权请联系删除。</p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm text-muted-foreground shadow-sm shadow-black/5">
              <span className="font-mono font-semibold text-foreground">{total}</span> 条可用 Prompt
            </div>
          </div>
        </div>
      </section>

      <Card className="rounded-[2rem] border-border/60 bg-card/70 p-4 shadow-sm shadow-black/5 sm:p-5 lg:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              role="searchbox"
              aria-label="搜索 Prompt"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch()
              }}
              placeholder="搜索标题、内容或标签"
              className="h-12 rounded-2xl bg-background/70 pl-10"
            />
          </div>
          <Button type="button" onClick={handleSearch} disabled={loading} className="h-12 rounded-2xl px-6 font-bold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            搜索
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" aria-label="Prompt 分类">
          <Button
            type="button"
            variant={category === '' ? 'default' : 'outline'}
            aria-label="分类：全部"
            onClick={() => setCategory('')}
            className="h-9 rounded-full px-4 text-xs font-bold"
          >
            全部
          </Button>
          {categories.map((name) => (
            <Button
              key={name}
              type="button"
              variant={category === name ? 'default' : 'outline'}
              aria-label={`分类：${name}`}
              onClick={() => setCategory(name)}
              className="h-9 rounded-full px-4 text-xs font-bold"
            >
              {name}
            </Button>
          ))}
        </div>
      </Card>

      {items.length > 0 ? (
        <section aria-label="Prompt 卡片列表" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          {items.map((item) => {
            const previewImageURL = getPromptPreviewImageURL(item)
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`查看 Prompt：${item.title}`}
                onClick={() => handleOpenPromptDetail(item)}
                className="group flex min-h-0 flex-col rounded-[1.4rem] border border-border/60 bg-card/70 p-3 text-left shadow-sm shadow-black/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_22px_54px_-36px_rgba(15,23,42,0.55)] focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 sm:min-h-64 sm:rounded-[1.75rem] sm:p-5"
              >
                {previewImageURL ? (
                  <div className="-mx-0.5 -mt-0.5 mb-3 overflow-hidden rounded-[1.1rem] border border-border/60 bg-secondary/30 sm:-mx-1 sm:-mt-1 sm:mb-4 sm:rounded-[1.35rem]">
                    <img
                      src={previewImageURL}
                      alt={`${item.title}预览图`}
                      loading="lazy"
                      decoding="async"
                      onLoad={handleCardPreviewLoad(previewImageURL)}
                      className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                  </div>
                ) : null}
                <div className="flex items-start justify-between gap-2 sm:gap-3">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary sm:px-3 sm:text-xs">{item.category || '通用'}</span>
                  <span className="text-[11px] font-medium text-muted-foreground sm:text-xs">#{item.id}</span>
                </div>
                <h2 className="mt-3 text-[15px] font-black leading-5 tracking-tight text-foreground group-hover:text-primary sm:mt-4 sm:text-lg sm:leading-6">{item.title}</h2>
                <p className="mt-2 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-5 text-muted-foreground truncate sm:mt-3 sm:text-sm sm:leading-6">
                  {previewContent(item.content)}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4 sm:gap-2">
                  {(item.tags || []).slice(0, 4).map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/65 px-2 py-1 text-[10px] font-semibold text-muted-foreground sm:px-2.5 sm:text-[11px]">
                      <Tags className="h-3 w-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </section>
      ) : null}

      {items.length === 0 && loading ? (
        <div className="flex min-h-56 items-center justify-center rounded-[2rem] border border-dashed border-border bg-secondary/20 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载 Prompt
        </div>
      ) : null}

      {empty ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-[2rem] border border-dashed border-border bg-secondary/20 px-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="text-base font-bold">暂无 Prompt</div>
          <p className="mt-2 text-sm text-muted-foreground">后台添加并启用 Prompt 后会显示在此页面。</p>
        </div>
      ) : null}

      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          aria-label="加载更多 Prompt"
          onClick={loadMore}
          disabled={loading}
          className="h-12 w-full rounded-2xl font-bold"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          加载更多 Prompt
        </Button>
      ) : null}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[min(88vh,760px)] overflow-hidden rounded-[2rem] p-0 sm:max-w-2xl">
          {selected ? (
            <div className="flex max-h-[min(88vh,760px)] flex-col">
              <div className="border-b border-border/60 bg-secondary/30 px-5 py-4 sm:px-6">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{selected.category || '通用'}</span>
                  {(selected.tags || []).map((tag) => (
                    <span key={tag} className="rounded-full border border-border/70 bg-background/75 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{tag}</span>
                  ))}
                </div>
                <DialogTitle className="text-xl font-black tracking-tight">{selected.title}</DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6">
                  查看完整 Prompt 内容，可复制或带入生图页继续编辑。
                </DialogDescription>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 prompt-scrollbar">
                {selectedPreviewImageURL ? (
                  <div className="mb-4 space-y-3">
                    <button
                      type="button"
                      aria-label={`放大查看预览图：${selected.title}`}
                      onClick={handleOpenPreviewZoom}
                      className="group block w-full rounded-[1.75rem] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      <div className="mx-auto flex w-full max-w-md items-center justify-center overflow-hidden rounded-[1.6rem] border border-border/60 bg-secondary/35 shadow-sm shadow-black/5">
                        <img
                          src={selectedPreviewImageURL}
                          alt={`${selected.title}预览图`}
                          loading="eager"
                          decoding="async"
                          fetchPriority={selectedPreviewFetchPriority}
                          onLoad={handleSelectedPreviewLoad}
                          className="max-h-[240px] w-full object-contain transition duration-300 group-hover:scale-[1.01]"
                        />
                      </div>
                    </button>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
                      <div className="space-y-1">
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">完整尺寸</div>
                        <div className="font-mono text-sm font-bold text-foreground">{selectedPreviewSizeLabel}</div>
                      </div>
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <ZoomIn className="h-3.5 w-3.5" />
                        点击放大查看
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="whitespace-pre-wrap break-words rounded-2xl border border-border/60 bg-background/80 p-4 text-sm leading-7 text-foreground">
                  {selected.content}
                </div>
              </div>

              <div className="grid gap-2 border-t border-border/60 bg-card px-5 py-4 sm:grid-cols-2 sm:px-6">
                <Button type="button" variant="outline" onClick={copySelected} className="h-11 rounded-2xl font-bold">
                  <Copy className="h-4 w-4" />
                  复制提示词
                </Button>
                <Button type="button" onClick={sendSelectedToGenerate} className="h-11 rounded-2xl font-bold">
                  <Send className="h-4 w-4" />
                  带入生图页
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={previewZoomOpen} onOpenChange={setPreviewZoomOpen}>
        <DialogContent
          showCloseButton={false}
          className="inset-0 top-0 left-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-border/20 bg-slate-950/96 p-0 text-white shadow-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:w-full sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:gap-4 sm:rounded-[2rem] sm:shadow-[0_28px_90px_-36px_rgba(0,0,0,0.85)]"
        >
          {selected && selectedPreviewImageURL ? (
            <div className="flex h-full min-h-0 flex-col sm:max-h-[92vh]">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
                <div className="min-w-0 space-y-1">
                  <DialogTitle className="text-sm font-bold leading-5 text-white sm:truncate sm:text-base">{selected.title}预览图放大查看</DialogTitle>
                  <DialogDescription className="space-y-1 text-sm text-white/65">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                      完整尺寸
                    </span>
                    <span className="block font-mono text-sm font-bold text-white">{selectedPreviewSizeLabel}</span>
                  </DialogDescription>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="关闭预览图放大查看"
                  onClick={() => setPreviewZoomOpen(false)}
                  className="h-10 w-10 shrink-0 rounded-full border border-white/10 bg-white/10 text-white hover:bg-white/15"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-black/50 px-3 py-3 sm:flex sm:min-h-[20rem] sm:items-center sm:justify-center sm:p-6">
                <img
                  src={selectedPreviewImageURL}
                  alt={`${selected.title}预览图放大查看`}
                  loading="eager"
                  decoding="async"
                  fetchPriority={selectedPreviewFetchPriority}
                  onLoad={handleSelectedPreviewLoad}
                  className="mx-auto block max-h-full w-auto max-w-full object-contain sm:max-h-[78vh]"
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
