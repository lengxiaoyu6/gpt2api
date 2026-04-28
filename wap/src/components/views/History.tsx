import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useStore, type HistoryRecord } from '../../store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PageShell from '@/components/PageShell';

type TaskStateKind = 'success' | 'processing' | 'failed';

const SUCCESS_STATES = new Set(['succeeded', 'success', 'completed']);
const PROCESSING_STATES = new Set(['pending', 'queued', 'processing', 'running']);
const FAILED_STATES = new Set(['failed', 'error', 'cancelled']);
const PREVIEW_SWIPE_THRESHOLD = 48;
const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

function getTaskStateKind(status?: string): TaskStateKind {
  const normalized = status?.trim().toLowerCase() || '';

  if (SUCCESS_STATES.has(normalized)) {
    return 'success';
  }

  if (FAILED_STATES.has(normalized)) {
    return 'failed';
  }

  if (PROCESSING_STATES.has(normalized)) {
    return 'processing';
  }

  return 'processing';
}

function getTaskCardLabel(status?: string) {
  const kind = getTaskStateKind(status);

  if (kind === 'failed') {
    return '生成失败';
  }

  if (kind === 'success') {
    return '创作完成';
  }

  return '生成中';
}

function getTaskDetailLabel(status?: string) {
  const kind = getTaskStateKind(status);

  if (kind === 'failed') {
    return '任务失败';
  }

  if (kind === 'success') {
    return '任务已完成';
  }

  return '处理中';
}

function getTaskDurationLabel(item: HistoryRecord) {
  const startedAtSource = item.started_at || item.created_at;

  if (startedAtSource && item.finished_at) {
    const startedAt = new Date(startedAtSource).getTime();
    const finishedAt = new Date(item.finished_at).getTime();

    if (Number.isFinite(startedAt) && Number.isFinite(finishedAt) && finishedAt >= startedAt) {
      const durationSeconds = Math.max(1, Math.round((finishedAt - startedAt) / 1000));
      return `${durationSeconds} 秒`;
    }
  }

  return '未知';
}

function getTaskBadgeClassName(kind: TaskStateKind) {
  if (kind === 'failed') {
    return 'border-rose-400/30 bg-rose-500/15 text-rose-100';
  }

  if (kind === 'success') {
    return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100';
  }

  return 'border-amber-300/30 bg-amber-400/15 text-amber-50';
}

function getTaskPanelClassName(kind: TaskStateKind) {
  if (kind === 'failed') {
    return 'bg-gradient-to-br from-rose-500/10 via-secondary/60 to-background';
  }

  if (kind === 'success') {
    return 'bg-gradient-to-br from-emerald-500/10 via-secondary/60 to-background';
  }

  return 'bg-gradient-to-br from-primary/15 via-secondary/60 to-background';
}

function TaskStateIcon({ kind, className }: { kind: TaskStateKind; className?: string }) {
  if (kind === 'failed') {
    return <AlertTriangle className={className} />;
  }

  if (kind === 'success') {
    return <CheckCircle2 className={className} />;
  }

  return <LoaderCircle className={className} />;
}

function getImageExtension(url: string, contentType?: string | null) {
  const normalizedType = contentType?.split(';')[0]?.trim().toLowerCase() || '';

  if (normalizedType && IMAGE_EXTENSION_BY_TYPE[normalizedType]) {
    return IMAGE_EXTENSION_BY_TYPE[normalizedType];
  }

  try {
    const parsedUrl = new URL(url, window.location.origin);
    const matched = parsedUrl.pathname.match(/\.([a-z0-9]+)$/i);

    if (matched?.[1]) {
      return matched[1].toLowerCase();
    }
  } catch {
    return 'png';
  }

  return 'png';
}

function getDownloadFileName(item: HistoryRecord, imageUrl: string, contentType?: string | null) {
  const taskId = (item.task_id || `task-${item.id}`).replace(/[^a-zA-Z0-9-_]+/g, '-');
  const timestamp = item.created_at?.replace(/[^\d]/g, '').slice(0, 14) || '';
  const suffix = timestamp ? `-${timestamp.slice(0, 8)}-${timestamp.slice(8)}` : '';
  const extension = getImageExtension(imageUrl, contentType);

  return `${taskId}${suffix}.${extension}`;
}

function triggerLinkDownload(href: string, fileName: string, openInNewTab = false) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  anchor.rel = 'noopener';

  if (openInNewTab) {
    anchor.target = '_blank';
  }

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function getPreviewImageUrls(item: HistoryRecord | null) {
  if (!item) {
    return [];
  }
  return item.thumb_urls?.length ? item.thumb_urls : item.image_urls || [];
}

function getOriginalImageUrls(item: HistoryRecord | null) {
  return item?.image_urls || [];
}

async function downloadOriginalImage(item: HistoryRecord, imageUrl: string) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error('下载图片失败');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const fileName = getDownloadFileName(item, imageUrl, blob.type || response.headers.get('content-type'));

  try {
    triggerLinkDownload(objectUrl, fileName);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function HistoryView() {
  const { user, history, historyLoading, fetchHistory, imageModels } = useStore();
  const [selectedImage, setSelectedImage] = useState<HistoryRecord | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [search, setSearch] = useState('');
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (user) {
      void fetchHistory();
    }
  }, [fetchHistory, user]);

  async function handleRefreshHistory() {
    if (!user || historyLoading) {
      return;
    }

    await fetchHistory(true);
  }

  const filtered = history.filter((item) => item.prompt.toLowerCase().includes(search.toLowerCase()));
  const selectedImageKind = selectedImage ? getTaskStateKind(selectedImage.status) : null;
  const selectedPreviewUrls = getPreviewImageUrls(selectedImage);
  const selectedOriginalUrls = getOriginalImageUrls(selectedImage);
  const selectedPreviewUrl = selectedPreviewUrls[previewIndex] || null;
  const selectedOriginalUrl = selectedOriginalUrls[previewIndex] || null;
  const hasMultiplePreviewImages = selectedPreviewUrls.length > 1;
  const selectedImageModelLabel = selectedImage
    ? imageModels.find((item) => item.id === selectedImage.model_id)?.slug?.trim() || '未知'
    : '未知';

  function openImageDetail(item: HistoryRecord) {
    touchStartXRef.current = null;
    setPreviewIndex(0);
    setSelectedImage(item);
  }

  function closeImageDetail() {
    touchStartXRef.current = null;
    setPreviewIndex(0);
    setSelectedImage(null);
  }

  function handlePreviewTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (!hasMultiplePreviewImages) {
      return;
    }

    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  }

  function handlePreviewTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (!hasMultiplePreviewImages || touchStartXRef.current == null) {
      return;
    }

    const touchEndX = event.changedTouches[0]?.clientX;

    if (typeof touchEndX !== 'number') {
      touchStartXRef.current = null;
      return;
    }

    const deltaX = touchStartXRef.current - touchEndX;
    touchStartXRef.current = null;

    if (Math.abs(deltaX) < PREVIEW_SWIPE_THRESHOLD) {
      return;
    }

    if (deltaX > 0) {
      setPreviewIndex((current) => Math.min(selectedPreviewUrls.length - 1, current + 1));
      return;
    }

    setPreviewIndex((current) => Math.max(0, current - 1));
  }

  async function handleDownloadOriginal() {
    if (!selectedImage || !selectedOriginalUrl) {
      return;
    }

    const fallbackFileName = getDownloadFileName(selectedImage, selectedOriginalUrl);

    try {
      await downloadOriginalImage(selectedImage, selectedOriginalUrl);
    } catch {
      triggerLinkDownload(selectedOriginalUrl, fallbackFileName, true);
    }
  }

  return (
    <PageShell width="wide" className="space-y-8 lg:space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight lg:text-3xl">时间轴</h1>
          <p className="text-xs text-muted-foreground font-medium lg:text-sm">存档所有创意瞬间</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
          <div className="relative flex-1 sm:min-w-[18rem] lg:min-w-[20rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索提示词..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 rounded-2xl border-none bg-secondary/30 pl-10 text-sm"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="刷新记录"
            disabled={historyLoading}
            onClick={() => {
              void handleRefreshHistory();
            }}
            className="h-12 w-12 shrink-0 rounded-2xl bg-secondary/80 text-foreground shadow-sm ring-1 ring-border/60"
          >
            <RefreshCw className={`w-5 h-5 ${historyLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:gap-6">
          {filtered.map((item, i) => {
            const previewUrl = getPreviewImageUrls(item)[0] || null;
            const taskStateKind = getTaskStateKind(item.status);
            const cardStateLabel = getTaskCardLabel(item.status);
            const detailStateLabel = getTaskDetailLabel(item.status);

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => openImageDetail(item)}
                className="group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-[2rem] border border-border/50 bg-secondary/20 shadow-md transition-transform duration-300 lg:hover:-translate-y-1"
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    alt={item.prompt}
                  />
                ) : (
                  <div className={`flex h-full w-full flex-col items-center justify-center gap-3 px-4 ${getTaskPanelClassName(taskStateKind)}`}>
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-sm ${getTaskBadgeClassName(taskStateKind)}`}>
                      <TaskStateIcon
                        kind={taskStateKind}
                        className={`h-5 w-5 ${taskStateKind === 'processing' ? 'animate-spin' : ''}`}
                      />
                    </div>
                    <div className="space-y-1 text-center">
                      <p className="text-sm font-semibold text-foreground">{cardStateLabel}</p>
                      <p className="text-[10px] leading-4 text-muted-foreground line-clamp-2">
                        {taskStateKind === 'failed' && item.error ? item.error : detailStateLabel}
                      </p>
                    </div>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                  <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold backdrop-blur-md ${getTaskBadgeClassName(taskStateKind)}`}>
                    <TaskStateIcon
                      kind={taskStateKind}
                      className={`h-2.5 w-2.5 ${taskStateKind === 'processing' ? 'animate-spin' : ''}`}
                    />
                    <span>{cardStateLabel}</span>
                  </div>
                  <p className="mt-2 text-[10px] text-white/90 line-clamp-2 leading-tight font-medium">
                    {item.prompt}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[8px] text-white/60 font-mono">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                    <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md">
                      <ImageIcon className="w-2.5 h-2.5 text-white/80" />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 rounded-[2rem] border border-border/40 bg-secondary/10 py-20 text-center opacity-40">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
            <ImageIcon className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-bold">暂无历史记录</p>
            <p className="text-xs uppercase tracking-widest mt-1">完成创作后会自动出现在这里</p>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedImage && selectedImageKind && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => closeImageDetail()}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-card rounded-3xl overflow-hidden shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div
                className="relative aspect-square"
                onTouchStart={handlePreviewTouchStart}
                onTouchEnd={handlePreviewTouchEnd}
                onTouchCancel={() => {
                  touchStartXRef.current = null;
                }}
              >
                {selectedPreviewUrl ? (
                  <img src={selectedPreviewUrl} className="w-full h-full object-cover" alt="Detail" />
                ) : (
                  <div className={`flex h-full w-full flex-col items-center justify-center gap-4 px-6 ${getTaskPanelClassName(selectedImageKind)}`}>
                    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur-sm ${getTaskBadgeClassName(selectedImageKind)}`}>
                      <TaskStateIcon
                        kind={selectedImageKind}
                        className={`h-4 w-4 ${selectedImageKind === 'processing' ? 'animate-spin' : ''}`}
                      />
                      <span>{getTaskDetailLabel(selectedImage.status)}</span>
                    </div>
                    <p className="max-w-xs text-center text-sm leading-6 text-muted-foreground">
                      {selectedImageKind === 'failed' && selectedImage.error
                        ? selectedImage.error
                        : selectedImageKind === 'processing'
                          ? '当前任务仍在生成，刷新记录后可查看结果图。'
                          : '当前任务暂无结果图。'}
                    </p>
                  </div>
                )}
                {hasMultiplePreviewImages ? (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-md">
                    {previewIndex + 1} / {selectedPreviewUrls.length}
                  </div>
                ) : null}
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="关闭详情"
                  onClick={() => closeImageDetail()}
                  className="absolute top-4 right-4 rounded-full bg-black/50 text-white border-none hover:bg-black/70"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-6 space-gap-6 flex flex-col gap-6">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-widest">
                    <Calendar className="w-3 h-3" />
                    <span>创建于 {new Date(selectedImage.created_at).toLocaleString()}</span>
                  </div>
                  <h3 className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-lg font-bold leading-tight">
                    {selectedImage.prompt}
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <Button
                    disabled={!selectedOriginalUrl}
                    onClick={() => {
                      void handleDownloadOriginal();
                    }}
                    className="rounded-2xl h-12 gap-2 font-bold shadow-lg shadow-primary/20 disabled:shadow-none"
                  >
                    <Download className="w-4 h-4" />
                    下载原图
                  </Button>
                </div>

                <div className="pt-4 border-t border-border/50 space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground gap-3">
                    <span>任务状态</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${getTaskBadgeClassName(selectedImageKind)}`}>
                      <TaskStateIcon
                        kind={selectedImageKind}
                        className={`h-3.5 w-3.5 ${selectedImageKind === 'processing' ? 'animate-spin' : ''}`}
                      />
                      <span>{getTaskDetailLabel(selectedImage.status)}</span>
                    </span>
                  </div>
                  {selectedImage.error ? (
                    <div className="flex items-start justify-between text-xs text-muted-foreground gap-3">
                      <span>失败原因</span>
                      <span className="max-w-[65%] text-right text-foreground font-medium leading-5">
                        {selectedImage.error}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between text-xs text-muted-foreground gap-3">
                    <span>生成耗时</span>
                    <span className="font-mono text-foreground font-bold">
                      {getTaskDurationLabel(selectedImage)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground gap-3">
                    <span>生成模型</span>
                    <span className="font-mono text-foreground font-bold tracking-tight">
                      {selectedImageModelLabel}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageShell>
  );
}
