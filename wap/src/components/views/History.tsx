import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore, type HistoryRecord } from '../../store/useStore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

function parseImageSize(size?: string | null) {
  const raw = size?.trim() || '';
  const matched = raw.match(/^(\d+)\s*x\s*(\d+)$/i);

  if (!matched) {
    return null;
  }

  const width = Number(matched[1]);
  const height = Number(matched[2]);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function formatImageSize(size?: string | null) {
  const raw = size?.trim() || '';
  const parsed = parseImageSize(raw);

  if (parsed) {
    return `${parsed.width} × ${parsed.height}`;
  }

  return raw || '未知';
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

function getReferenceImages(item: HistoryRecord | null) {
  const referenceUrls = item?.reference_urls || [];
  const referenceThumbUrls = item?.reference_thumb_urls || [];
  const count = Math.max(referenceUrls.length, referenceThumbUrls.length);

  if (count === 0) {
    return [];
  }

  const images: Array<{ originalUrl: string; previewUrl: string }> = [];

  for (let index = 0; index < count; index += 1) {
    const originalUrl = referenceUrls[index] || '';
    const previewUrl = referenceThumbUrls[index] || originalUrl;

    if (!originalUrl && !previewUrl) {
      continue;
    }

    images.push({
      originalUrl: originalUrl || previewUrl,
      previewUrl: previewUrl || originalUrl,
    });
  }

  return images;
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
  const { user, history, historyLoading, fetchHistory, imageModels, deleteHistoryRecord } = useStore();
  const [selectedImage, setSelectedImage] = useState<HistoryRecord | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<HistoryRecord | null>(null);
  const [deletingTaskID, setDeletingTaskID] = useState<string | null>(null);
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
  const selectedReferenceImages = getReferenceImages(selectedImage);
  const selectedPreviewUrl = selectedPreviewUrls[previewIndex] || null;
  const selectedOriginalUrl = selectedOriginalUrls[previewIndex] || null;
  const selectedDisplayUrl = selectedOriginalUrl || selectedPreviewUrl;
  const selectedImageSizeLabel = formatImageSize(selectedImage?.size);
  const hasMultiplePreviewImages = selectedPreviewUrls.length > 1;
  const isFirstPreviewImage = previewIndex === 0;
  const isLastPreviewImage = previewIndex >= selectedPreviewUrls.length - 1;
  const selectedImageModelLabel = selectedImage
    ? imageModels.find((item) => item.id === selectedImage.model_id)?.slug?.trim() || '未知'
    : '未知';
  const deleteTargetImageCount = deleteTarget
    ? Math.max(
        getOriginalImageUrls(deleteTarget).length,
        getPreviewImageUrls(deleteTarget).length,
        deleteTarget.n || 0,
      )
    : 0;
  const deleteTargetImageCountLabel = deleteTargetImageCount > 0 ? `${deleteTargetImageCount} 张` : '未知';
  const deleteTargetSizeLabel = formatImageSize(deleteTarget?.size);
  const deleteTargetCreatedAtLabel = deleteTarget ? new Date(deleteTarget.created_at).toLocaleString() : '';

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

  function requestDeleteHistoryRecord(item: HistoryRecord) {
    setDeleteTarget(item);
  }

  async function handleConfirmDeleteHistoryRecord() {
    if (!deleteTarget || deletingTaskID) {
      return;
    }

    const item = deleteTarget;
    setDeletingTaskID(item.task_id);

    try {
      await deleteHistoryRecord(item.task_id);
      setDeleteTarget(null);
      if (selectedImage?.task_id === item.task_id) {
        closeImageDetail();
      }
      toast.success('历史记录已删除');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除记录失败，请稍后重试');
    } finally {
      setDeletingTaskID(null);
    }
  }

  function showPreviousPreviewImage() {
    if (!hasMultiplePreviewImages) {
      return;
    }

    setPreviewIndex((current) => Math.max(0, current - 1));
  }

  function showNextPreviewImage() {
    if (!hasMultiplePreviewImages) {
      return;
    }

    setPreviewIndex((current) => Math.min(selectedPreviewUrls.length - 1, current + 1));
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
      showNextPreviewImage();
      return;
    }

    showPreviousPreviewImage();
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
            const previewUrls = getPreviewImageUrls(item);
            const resultImageCount = Math.max(getOriginalImageUrls(item).length, previewUrls.length);
            const previewUrl = previewUrls[0] || null;
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
                {resultImageCount > 1 ? (
                  <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/65 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-black/25 backdrop-blur-md">
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>共 {resultImageCount} 张</span>
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label={`删除记录 ${item.prompt}`}
                  disabled={deletingTaskID === item.task_id}
                  onClick={(event) => {
                    event.stopPropagation();
                    requestDeleteHistoryRecord(item);
                  }}
                  className="absolute right-3 top-3 z-10 h-11 w-11 rounded-full border border-white/20 bg-black/60 text-white shadow-lg shadow-black/25 backdrop-blur-md hover:bg-black/75 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
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
              className="w-[calc(100vw-2rem)] max-w-lg shrink-0 bg-card rounded-3xl overflow-hidden shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div
                className="relative flex h-[min(68vh,32rem)] min-h-[16rem] w-full items-center justify-center overflow-hidden bg-black"
                onTouchStart={handlePreviewTouchStart}
                onTouchEnd={handlePreviewTouchEnd}
                onTouchCancel={() => {
                  touchStartXRef.current = null;
                }}
              >
                {selectedDisplayUrl ? (
                  <img src={selectedDisplayUrl} className="h-full w-full object-contain" alt="Detail" />
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
                  <div className="absolute inset-x-4 bottom-4 z-10 flex flex-col items-center gap-2">
                    <div className="rounded-full border border-white/20 bg-black/65 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-black/25 backdrop-blur-md">
                      第 {previewIndex + 1} 张 / 共 {selectedPreviewUrls.length} 张
                    </div>
                    <div className="rounded-full border border-white/15 bg-black/50 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-md">
                      左右滑动或点击箭头切换
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2.5 py-1.5 backdrop-blur-md">
                      {selectedPreviewUrls.map((url, index) => (
                        <span
                          key={`${url}-${index}`}
                          aria-hidden="true"
                          className={`h-1.5 rounded-full transition-all ${
                            index === previewIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/45'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {hasMultiplePreviewImages ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label="上一张"
                      disabled={isFirstPreviewImage}
                      onClick={(event) => {
                        event.stopPropagation();
                        showPreviousPreviewImage();
                      }}
                      className="absolute left-3 top-1/2 z-10 h-11 w-11 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 text-white shadow-lg shadow-black/25 backdrop-blur-md hover:bg-black/75 disabled:opacity-35"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label="下一张"
                      disabled={isLastPreviewImage}
                      onClick={(event) => {
                        event.stopPropagation();
                        showNextPreviewImage();
                      }}
                      className="absolute right-3 top-1/2 z-10 h-11 w-11 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 text-white shadow-lg shadow-black/25 backdrop-blur-md hover:bg-black/75 disabled:opacity-35"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </>
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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={deletingTaskID === selectedImage.task_id}
                    onClick={() => {
                      requestDeleteHistoryRecord(selectedImage);
                    }}
                    className="rounded-2xl h-12 gap-2 font-bold border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deletingTaskID === selectedImage.task_id ? '删除中' : '删除记录'}
                  </Button>
                </div>

                {selectedReferenceImages.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground gap-3">
                      <span>参考图</span>
                      <span className="font-mono text-foreground font-bold">{selectedReferenceImages.length} 张</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedReferenceImages.map((item, index) => (
                        <a
                          key={`${item.originalUrl}-${index}`}
                          href={item.originalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group block overflow-hidden rounded-2xl border border-border/50 bg-secondary/20"
                        >
                          <img
                            src={item.previewUrl}
                            alt={`参考图 ${index + 1}`}
                            className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

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
                    <span>完整尺寸</span>
                    <span className="font-mono text-foreground font-bold">
                      {selectedImageSizeLabel}
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

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deletingTaskID) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-sm overflow-hidden rounded-[28px] border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur" showCloseButton={false}>
          <DialogHeader className="px-6 pt-6">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive shadow-sm">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <DialogTitle className="text-xl font-black tracking-tight">删除历史记录</DialogTitle>
                <DialogDescription className="space-y-1 leading-5">
                  <span className="block">删除后该记录会从时间轴中移除，生成图片记录也会同步删除。</span>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {deleteTarget ? (
            <div className="mx-6 space-y-3 rounded-3xl border border-destructive/15 bg-destructive/[0.03] p-4 text-xs text-muted-foreground ring-1 ring-destructive/5">
              <div className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
                <span className="font-bold">即将删除</span>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/80 p-3">
                <div className="line-clamp-3 whitespace-pre-wrap break-words text-sm font-semibold leading-5 text-foreground">
                  {deleteTarget.prompt}
                </div>
                <div className="mt-2 font-mono text-[11px]">{deleteTargetCreatedAtLabel}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-border/50 bg-background/70 p-3">
                  <div className="text-[11px] font-medium text-muted-foreground">图片数量</div>
                  <div className="mt-1 font-mono text-sm font-black text-foreground">{deleteTargetImageCountLabel}</div>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/70 p-3">
                  <div className="text-[11px] font-medium text-muted-foreground">完整尺寸</div>
                  <div className="mt-1 font-mono text-sm font-black text-foreground">{deleteTargetSizeLabel}</div>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="mx-0 mb-0 mt-5 flex flex-col gap-3 rounded-b-[28px] border-border/60 bg-secondary/20 px-6 py-4 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(deletingTaskID)}
              onClick={() => setDeleteTarget(null)}
              className="h-12 w-full rounded-2xl font-bold sm:flex-1"
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={Boolean(deletingTaskID)}
              onClick={() => {
                void handleConfirmDeleteHistoryRecord();
              }}
              className="h-12 w-full rounded-2xl bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 hover:bg-destructive/90 disabled:opacity-60 sm:flex-1"
            >
              <Trash2 className="h-4 w-4" />
              {deletingTaskID ? '删除中' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
