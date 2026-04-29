import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wand2, Image as ImageIcon, RefreshCw, Sparkles, AlertCircle, X, Check, ChevronDown, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import PageShell from '@/components/PageShell';
import { cn, formatCredit } from '@/lib/utils';
import { useStore } from '../../store/useStore';
import {
  IMAGE_RATIO_OPTIONS,
  OUTPUT_QUALITY_OPTIONS,
  getRatioPreviewStyle,
  type AspectRatio,
  type OutputQualityValue,
} from '../../features/image/options';

const IMAGE_COUNT_OPTIONS = [1, 2, 3, 4] as const;
const MAX_SOURCE_IMAGES = 4;

interface SourceImage {
  file: File;
  preview: string;
}

interface GeneratedImage {
  originalUrl: string;
  displayUrl: string;
}

const getSourceImageGridClass = (count: number) => {
  if (count === 1) {
    return 'grid-cols-1 grid-rows-1';
  }
  if (count === 2) {
    return 'grid-cols-2 grid-rows-1';
  }
  if (count === 3) {
    return 'grid-cols-[minmax(0,2fr)_minmax(0,1fr)] grid-rows-2';
  }
  return 'grid-cols-2 grid-rows-2';
};

const getSourceImageTileClass = (count: number, index: number) => (
  count === 3 && index === 0 ? 'row-span-2' : ''
);

const resolveImageUnitPrice = (
  model: {
    image_price_per_call: number;
    image_price_per_call_2k?: number;
    image_price_per_call_4k?: number;
  } | undefined,
  quality: OutputQualityValue,
  supportsOutputSize: boolean,
) => {
  if (!model) {
    return 0;
  }
  if (!supportsOutputSize) {
    return model.image_price_per_call ?? 0;
  }
  if (quality === '2K' && (model.image_price_per_call_2k ?? 0) > 0) {
    return model.image_price_per_call_2k ?? 0;
  }
  if (quality === '4K' && (model.image_price_per_call_4k ?? 0) > 0) {
    return model.image_price_per_call_4k ?? 0;
  }
  return model.image_price_per_call ?? 0;
};

const getModelPrimaryLabel = (
  model:
    | {
        slug?: string | null;
      }
    | undefined,
) => model?.slug?.trim() || '暂无可用模型';

const getModelSecondaryLabel = (
  model:
    | {
        slug?: string | null;
        description?: string | null;
      }
    | undefined,
) => {
  const description = model?.description?.trim();
  const slug = model?.slug?.trim();
  if (!description || description === slug) {
    return '';
  }
  return description;
};

export default function GenerateView() {
  const {
    generateImage,
    editImage,
    imageModels,
    siteInfo,
    selectedImageModel,
    setSelectedImageModel,
  } = useStore();
  const [mode, setMode] = useState<'txt' | 'img'>('txt');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImages, setResultImages] = useState<GeneratedImage[]>([]);
  const [isPreviewResult, setIsPreviewResult] = useState(false);
  const [textAspectRatio, setTextAspectRatio] = useState<AspectRatio>('1:1');
  const [imageAspectRatio, setImageAspectRatio] = useState<AspectRatio>('1:1');
  const [textOutputQuality, setTextOutputQuality] = useState<OutputQualityValue>('1K');
  const [imageOutputQuality, setImageOutputQuality] = useState<OutputQualityValue>('1K');
  const [imageCount, setImageCount] = useState<1 | 2 | 3 | 4>(1);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);
  const [sourceImages, setSourceImages] = useState<SourceImage[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const sourceImagesRef = useRef<SourceImage[]>([]);

  const currentModel = imageModels.find((item) => item.slug === selectedImageModel);
  const supportsMultiImage = currentModel?.supports_multi_image ?? true;
  const supportsOutputSize = currentModel?.supports_output_size ?? true;
  const currentModelTitle = getModelPrimaryLabel(currentModel);
  const currentModelSubtitle = getModelSecondaryLabel(currentModel);
  const imageNotice = siteInfo['site.image_notice']?.trim() || '';
  const activeAspectRatio = mode === 'txt' ? textAspectRatio : imageAspectRatio;
  const activeOutputQuality = mode === 'txt' ? textOutputQuality : imageOutputQuality;
  const currentQualityPrice = resolveImageUnitPrice(currentModel, activeOutputQuality, supportsOutputSize);
  const effectiveImageCount = supportsMultiImage ? imageCount : 1;
  const totalPrice = currentQualityPrice * effectiveImageCount;

  useEffect(() => {
    sourceImagesRef.current = sourceImages;
  }, [sourceImages]);

  useEffect(() => {
    return () => {
      sourceImagesRef.current.forEach((image) => {
        if (image.preview.startsWith('blob:')) {
          URL.revokeObjectURL(image.preview);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!isModelPickerOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!modelPickerRef.current?.contains(event.target as Node)) {
        setIsModelPickerOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsModelPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModelPickerOpen]);

  const clearResults = () => {
    setResultImages([]);
    setIsPreviewResult(false);
  };

  const handleGenerate = async () => {
    const nextPrompt = prompt.trim();

    if (!selectedImageModel) {
      toast.error('当前暂无可用图像模型');
      return;
    }
    if (!nextPrompt && mode === 'txt') {
      toast.error('请输入提示词');
      return;
    }
    if (sourceImages.length === 0 && mode === 'img') {
      toast.error('请上传参考图');
      return;
    }

    setIsGenerating(true);
    setSubmissionDialogOpen(true);
    clearResults();
    try {
      const response = mode === 'txt'
        ? await generateImage({
            prompt: nextPrompt,
            aspectRatio: textAspectRatio,
            quality: textOutputQuality,
            count: effectiveImageCount,
          })
        : await editImage({
            prompt: nextPrompt || '增强细节，提升画面质感',
            aspectRatio: imageAspectRatio,
            quality: imageOutputQuality,
            files: sourceImages.map((image) => image.file),
            count: effectiveImageCount,
          });

      const images = (response.data || [])
        .filter((item) => Boolean(item.url))
        .map((item) => ({
          originalUrl: item.url,
          displayUrl: item.thumb_url || item.url,
        }));
      if (images.length === 0) {
        throw new Error('当前任务尚未返回图像结果');
      }

      setResultImages(images);
      setIsPreviewResult(!!response.is_preview);
      if (response.is_preview) {
        toast.message('当前结果为预览图，稍后可在记录页查看任务状态');
      } else {
        toast.success(`创作完成，共 ${images.length} 张`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成失败，请稍后重试');
    } finally {
      setSubmissionDialogOpen(false);
      setIsGenerating(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFiles: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (pickedFiles.length === 0) {
      return;
    }

    const availableSlots = Math.max(0, MAX_SOURCE_IMAGES - sourceImages.length);
    const acceptedFiles = pickedFiles.slice(0, availableSlots);
    if (acceptedFiles.length < pickedFiles.length) {
      toast.warning(`最多上传 ${MAX_SOURCE_IMAGES} 张参考图`);
    }
    if (acceptedFiles.length === 0) {
      e.target.value = '';
      return;
    }

    const nextImages = acceptedFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setSourceImages((prev) => [...prev, ...nextImages]);
    e.target.value = '';
  };

  const handleCancelSourceImage = (index: number, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    setSourceImages((prev) => {
      const target = prev[index];
      if (target?.preview.startsWith('blob:')) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAspectRatioChange = (ratio: AspectRatio) => {
    if (mode === 'txt') {
      setTextAspectRatio(ratio);
      return;
    }
    setImageAspectRatio(ratio);
  };

  const handleOutputQualityChange = (value: OutputQualityValue) => {
    if (mode === 'txt') {
      setTextOutputQuality(value);
      return;
    }
    setImageOutputQuality(value);
  };

  return (
    <PageShell width="wide" className="space-y-6 lg:space-y-8">
      <Dialog open={submissionDialogOpen} onOpenChange={setSubmissionDialogOpen}>
        <DialogContent className="rounded-3xl p-5" showCloseButton={false}>
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-lg font-black">任务已经提交</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                可以关闭弹窗，任务完成后可以到记录查询
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full rounded-2xl font-bold"
              onClick={() => setSubmissionDialogOpen(false)}
            >
              关闭提示
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {imageNotice ? (
        <Card className="rounded-3xl border-amber-500/25 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm leading-6 text-foreground/90">{imageNotice}</p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight lg:text-3xl">创意实验室</h1>
          <p className="text-xs font-medium text-muted-foreground lg:text-sm">释放视觉想象力</p>
        </div>
        <div className="rounded-[1.75rem] border border-primary/20 bg-primary/10 px-4 py-3 text-right text-[10px] font-bold text-primary shadow-sm shadow-primary/10 lg:min-w-[18rem] lg:text-xs">
          <p>当前质量价格：{formatCredit(currentQualityPrice)} 积分 / 张</p>
          {supportsMultiImage ? (
            <p className="mt-1 text-[9px] font-medium text-foreground/80">多张生成会按张数累计扣费</p>
          ) : null}
          <p className="mt-1 text-[9px] font-medium text-foreground/80">当前 {effectiveImageCount} 张，预计消耗 {formatCredit(totalPrice)} 积分</p>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] xl:gap-8">
        <section aria-label="生成参数区" className="space-y-4 lg:sticky lg:top-28">
          <Tabs
            value={mode}
            onValueChange={(val) => setMode(val as 'txt' | 'img')}
            className="w-full"
          >
            <TabsList className="grid h-12 w-full grid-cols-2 rounded-2xl bg-secondary/50 p-1">
              <TabsTrigger value="txt" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Wand2 className="mr-2 h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">文生图</span>
              </TabsTrigger>
              <TabsTrigger value="img" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <ImageIcon className="mr-2 h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">图生图</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Card className="space-y-4 rounded-[2rem] border-border/50 bg-secondary/20 p-4 lg:p-5">
            {mode === 'img' && (
              <Card className="rounded-2xl border-primary/20 bg-primary/8 px-4 py-3 lg:hidden">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm leading-6 text-foreground/90">图生图建议在 PC 端操作，上传和结果对照体验更好</p>
                  </div>
                </div>
              </Card>
            )}

            {mode === 'img' && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group relative aspect-video cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-border/50 bg-background/50 transition-colors hover:border-primary/50"
              >
                {sourceImages.length > 0 ? (
                  <div className="relative h-full w-full">
                    <div className={cn('grid h-full w-full gap-2.5 p-2.5', getSourceImageGridClass(sourceImages.length))}>
                      {sourceImages.map((sourceImage, index) => (
                        <div
                          key={`${sourceImage.file.name}-${index}`}
                          className={cn(
                            'group/source relative min-h-0 overflow-hidden rounded-2xl border border-white/15 bg-background/70 shadow-lg shadow-black/10',
                            getSourceImageTileClass(sourceImages.length, index),
                          )}
                        >
                          <img
                            src={sourceImage.preview}
                            decoding="async"
                            className="h-full w-full object-cover lg:transition-transform lg:duration-300 lg:group-hover/source:scale-105"
                            alt={`参考图 ${index + 1}`}
                          />
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" />
                          <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white shadow-sm lg:backdrop-blur">
                            参考图 {index + 1}
                          </span>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            aria-label={sourceImages.length === 1 ? '取消参考图' : `取消参考图 ${index + 1}`}
                            className="absolute right-2 top-2 z-10 h-11 w-11 rounded-full bg-black/55 text-white shadow-lg shadow-black/25 hover:bg-black/70 lg:backdrop-blur"
                            onClick={(event) => handleCancelSourceImage(index, event)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/50 px-3 py-1.5 text-[10px] font-bold text-white shadow-lg shadow-black/20 lg:backdrop-blur">
                      已选择 {sourceImages.length}/{MAX_SOURCE_IMAGES} 张
                    </div>
                    {sourceImages.length < MAX_SOURCE_IMAGES && (
                      <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-2 rounded-full border border-primary/30 bg-primary/90 px-3 py-2 text-[10px] font-black text-primary-foreground shadow-lg shadow-primary/20 lg:backdrop-blur lg:transition-transform lg:group-hover:scale-105">
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>继续添加</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center">
                    <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 lg:transition-transform lg:group-hover:scale-110">
                      <ImageIcon className="h-6 w-6 text-primary" />
                    </div>
                    <p className="text-xs font-bold">点击上传参考图</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">支持 PNG, JPG, WEBP，最多 {MAX_SOURCE_IMAGES} 张</p>
                  </div>
                )}
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" multiple className="hidden" />
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-3">
                <p className="block pl-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  图片模型
                </p>
                <div ref={modelPickerRef} className="relative">
                  {imageModels.length === 0 ? (
                    <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-muted-foreground">
                      暂无可用模型
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label={`图片模型 ${currentModelTitle}`}
                        aria-haspopup="listbox"
                        aria-expanded={isModelPickerOpen}
                        onClick={() => setIsModelPickerOpen((open) => !open)}
                        className={cn(
                          'flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all outline-none ring-inset',
                          'focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15',
                          isModelPickerOpen
                            ? 'border-primary/80 bg-card shadow-[0_14px_34px_-22px_rgba(0,0,0,0.75)] ring-2 ring-primary/35'
                            : 'border-border/60 bg-card/70 shadow-sm shadow-black/5 hover:border-primary/45 hover:bg-card',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {currentModelTitle}
                          </span>
                          {currentModelSubtitle ? (
                            <span className="mt-1 block truncate text-[10px] font-medium tracking-wide text-muted-foreground/90">
                              {currentModelSubtitle}
                            </span>
                          ) : null}
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                            isModelPickerOpen && 'rotate-180 text-primary',
                          )}
                        />
                      </button>
                      {isModelPickerOpen ? (
                        <div
                          data-model-picker-panel="true"
                          className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-full overflow-hidden rounded-2xl border border-primary/30 bg-popover p-2 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.85)] ring-1 ring-primary/20 backdrop-blur"
                        >
                          <ScrollArea className="max-h-72">
                            <div aria-label="图片模型列表" role="listbox" className="space-y-2 pr-2">
                              {imageModels.map((model) => {
                                const isActive = selectedImageModel === model.slug;
                                const modelTitle = getModelPrimaryLabel(model);
                                const modelSubtitle = getModelSecondaryLabel(model);

                                return (
                                  <button
                                    key={model.slug}
                                    type="button"
                                    aria-selected={isActive}
                                    onClick={() => {
                                      setSelectedImageModel(model.slug);
                                      setIsModelPickerOpen(false);
                                    }}
                                    className={cn(
                                      'flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all outline-none',
                                      'focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15',
                                      isActive
                                        ? 'border-primary/70 bg-primary/18 shadow-lg shadow-primary/15 ring-1 ring-primary/25'
                                        : 'border-border/60 bg-card/80 shadow-sm shadow-black/5 hover:border-primary/45 hover:bg-primary/8',
                                    )}
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-semibold text-foreground">
                                        {modelTitle}
                                      </span>
                                      {modelSubtitle ? (
                                        <span className="mt-1 block truncate text-[10px] font-medium tracking-wide text-muted-foreground/90">
                                          {modelSubtitle}
                                        </span>
                                      ) : null}
                                    </span>
                                    <span
                                      aria-hidden="true"
                                      className={cn(
                                        'h-2.5 w-2.5 shrink-0 rounded-full border transition-colors',
                                        isActive
                                          ? 'border-primary bg-primary shadow-[0_0_0_4px_rgba(124,58,237,0.14)]'
                                          : 'border-border bg-muted/20',
                                      )}
                                    />
                                  </button>
                                );
                              })}
                            </div>
                          </ScrollArea>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              <div className="relative">
                <Textarea
                  rows={5}
                  placeholder={mode === 'txt' ? '描述想看到的画面...' : '描述想要修改、增强或重绘的部分...'}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="prompt-scrollbar field-sizing-fixed h-[140px] min-h-[140px] max-h-[140px] resize-none overflow-y-auto overscroll-contain rounded-2xl border-none bg-background/50 p-4 pr-5 text-sm leading-relaxed focus-visible:ring-primary/20"
                />
              </div>

              <div className="space-y-3">
                <p className="pl-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">画布比例</p>
                <div className="grid grid-cols-5 gap-2">
                  {IMAGE_RATIO_OPTIONS.map((option) => {
                    const isActive = activeAspectRatio === option.ratio;
                    return (
                      <button
                        type="button"
                        key={option.ratio}
                        aria-label={`${option.ratio} ${option.label}`}
                        onClick={() => handleAspectRatioChange(option.ratio)}
                        className={cn(
                          'flex flex-col items-center justify-center rounded-xl border px-1 py-2.5 transition-all',
                          isActive
                            ? 'border-primary/50 bg-primary/15 text-foreground shadow-lg shadow-primary/10'
                            : 'bg-background/50 border-border/50 hover:border-primary/30',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mb-1 rounded-sm border transition-colors',
                            isActive ? 'border-primary/60 bg-primary/20' : 'border-border/80 bg-muted/30',
                          )}
                          style={getRatioPreviewStyle(option)}
                        />
                        <span className="text-[10px] font-black">{option.ratio}</span>
                        <span className="text-[9px] font-semibold leading-tight">{option.label}</span>
                        <span className={cn('mt-0.5 text-[8px]', isActive ? 'text-foreground/80 opacity-80' : 'text-muted-foreground opacity-60')}>
                          {option.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {supportsOutputSize ? (
                <div className="space-y-3">
                  <p className="pl-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">输出质量</p>
                  <div className="grid grid-cols-3 gap-2">
                    {OUTPUT_QUALITY_OPTIONS.map((option) => {
                      const isActive = activeOutputQuality === option.value;
                      return (
                        <button
                          key={option.label}
                          type="button"
                          aria-label={option.label}
                          onClick={() => handleOutputQualityChange(option.value)}
                          className={cn(
                            'rounded-2xl border px-2 py-3 text-center transition-all',
                            isActive
                              ? 'border-primary/50 bg-primary/15 text-foreground shadow-lg shadow-primary/10'
                              : 'border-border/50 bg-background/50 hover:border-primary/30',
                          )}
                        >
                          <span className="block text-[11px] font-bold">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {supportsMultiImage ? (
                <div className="space-y-3">
                  <p className="pl-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">生成张数</p>
                  <div className="grid grid-cols-4 gap-2">
                    {IMAGE_COUNT_OPTIONS.map((count) => {
                      const isActive = imageCount === count;
                      return (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setImageCount(count)}
                          className={cn(
                            'rounded-2xl border px-3 py-3 text-sm font-bold transition-all',
                            isActive
                              ? 'border-primary/50 bg-primary/15 text-foreground shadow-lg shadow-primary/10'
                              : 'border-border/50 bg-background/50 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                          )}
                        >
                          {count} 张
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <Button
              className="h-14 w-full rounded-2xl bg-primary text-lg font-black text-primary-foreground shadow-xl shadow-primary/25 hover:bg-primary/90 disabled:opacity-50"
              onClick={handleGenerate}
              disabled={isGenerating || !selectedImageModel}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                <span>开始创作</span>
              </div>
            </Button>
          </Card>
        </section>

        <section aria-label="生成结果区" className="space-y-4 lg:min-h-[48rem]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
              生成结果 {resultImages.length > 0 ? <Check className="h-4 w-4 text-green-500" /> : null}
            </h2>
            {resultImages.length > 0 ? (
              <Button variant="secondary" size="sm" onClick={clearResults} className="rounded-xl px-3">
                <X className="mr-1 h-4 w-4" />
                清空结果
              </Button>
            ) : null}
          </div>

          <AnimatePresence>
            {resultImages.length > 0 ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              >
                {resultImages.map((image, index) => (
                  <div key={`${image.originalUrl}-${index}`} className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-card shadow-xl">
                    <img src={image.displayUrl} alt={`Result ${index + 1}`} decoding="async" className="aspect-square w-full object-cover" />
                    {isPreviewResult ? (
                      <div className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
                        预览图
                      </div>
                    ) : null}
                    <a
                      href={image.originalUrl}
                      download
                      target="_blank"
                      rel="noopener"
                      aria-label={`下载原图 ${index + 1}`}
                      className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white shadow-lg lg:backdrop-blur-sm"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </motion.div>
            ) : isGenerating ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex min-h-[28rem] flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-border/40 bg-secondary/10 p-8 text-center"
              >
                <div className="relative mb-6 h-24 w-24">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-0 rounded-full border-t-4 border-primary"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="h-10 w-10 animate-pulse text-primary" />
                  </div>
                </div>
                <h3 className="mb-2 text-xl font-black tracking-tight">图像生成中</h3>
                <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                  当前任务已进入处理队列，生成完成后会在此区域展示结果图。
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex min-h-[28rem] flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-border/30 bg-secondary/5 p-10 text-center"
              >
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-secondary/50 text-muted-foreground">
                  <AlertCircle className="h-10 w-10" />
                </div>
                <h3 className="text-lg font-black tracking-tight">结果将在此显示</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  完成提示词、模型和比例设置后，当前工作台会展示生成图像与下载入口。
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </PageShell>
  );
}
