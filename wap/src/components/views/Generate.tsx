import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wand2, Image as ImageIcon, RefreshCw, Sparkles, AlertCircle, X, Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatCredit } from '@/lib/utils';
import { useStore } from '../../store/useStore';
import {
  getRatioPreviewStyle,
  IMAGE_RATIO_OPTIONS,
  OUTPUT_SIZE_OPTIONS,
  type AspectRatio,
  type UpscaleLevel,
} from '../../features/image/options';

const IMAGE_COUNT_OPTIONS = [1, 2, 3, 4] as const;
const UPSCALE_HINT_LEAD = '上游原生出图为 1024 或 1792 px;选择 2K/4K 会在图片加载时用本地';
const UPSCALE_HINT_WARN = '注意:这是传统算法放大,不是 AI 超分,';
const UPSCALE_HINT_TAIL = '不会补出新的纹理或毛发,只会让画面更大更平滑。4K 首次加载约 +0.5~1.5s,之后命中缓存。';

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
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [isPreviewResult, setIsPreviewResult] = useState(false);
  const [textAspectRatio, setTextAspectRatio] = useState<AspectRatio>('1:1');
  const [imageAspectRatio, setImageAspectRatio] = useState<AspectRatio>('1:1');
  const [textUpscale, setTextUpscale] = useState<UpscaleLevel>('');
  const [imageUpscale, setImageUpscale] = useState<UpscaleLevel>('');
  const [imageCount, setImageCount] = useState<1 | 2 | 3 | 4>(1);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [sourceImagePreview, setSourceImagePreview] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  const currentModel = imageModels.find((item) => item.slug === selectedImageModel);
  const currentPrice = currentModel?.image_price_per_call ?? 5;
  const totalPrice = currentPrice * imageCount;
  const currentModelLabel = currentModel?.description?.trim() || currentModel?.slug || '暂无可用模型';
  const imageNotice = siteInfo['site.image_notice']?.trim() || '';
  const activeAspectRatio = mode === 'txt' ? textAspectRatio : imageAspectRatio;
  const activeUpscale = mode === 'txt' ? textUpscale : imageUpscale;

  useEffect(() => {
    return () => {
      if (sourceImagePreview?.startsWith('blob:')) {
        URL.revokeObjectURL(sourceImagePreview);
      }
    };
  }, [sourceImagePreview]);

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
    if (!sourceFile && mode === 'img') {
      toast.error('请上传参考图');
      return;
    }

    setIsGenerating(true);
    clearResults();
    try {
      const response = mode === 'txt'
        ? await generateImage({
            prompt: nextPrompt,
            aspectRatio: textAspectRatio,
            upscale: textUpscale,
            count: imageCount,
          })
        : await editImage({
            prompt: nextPrompt || '增强细节，提升画面质感',
            aspectRatio: imageAspectRatio,
            upscale: imageUpscale,
            file: sourceFile as File,
            count: imageCount,
          });

      const imageUrls = (response.data || [])
        .map((item) => item.url)
        .filter((url): url is string => Boolean(url));
      if (imageUrls.length === 0) {
        throw new Error('当前任务尚未返回图像结果');
      }

      setResultImages(imageUrls);
      setIsPreviewResult(!!response.is_preview);
      if (response.is_preview) {
        toast.message('当前结果为预览图，稍后可在记录页查看任务状态');
      } else {
        toast.success(`创作完成，共 ${imageUrls.length} 张`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成失败，请稍后重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (sourceImagePreview?.startsWith('blob:')) {
      URL.revokeObjectURL(sourceImagePreview);
    }

    setSourceFile(file);
    setSourceImagePreview(URL.createObjectURL(file));
  };

  const handleAspectRatioChange = (ratio: AspectRatio) => {
    if (mode === 'txt') {
      setTextAspectRatio(ratio);
      return;
    }
    setImageAspectRatio(ratio);
  };

  const handleUpscaleChange = (value: UpscaleLevel) => {
    if (mode === 'txt') {
      setTextUpscale(value);
      return;
    }
    setImageUpscale(value);
  };

  return (
    <div className="px-4 py-6 space-y-8 animate-in fade-in duration-500">
      {imageNotice ? (
        <Card className="border-amber-500/25 bg-amber-500/10 px-4 py-3 rounded-3xl">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm leading-6 text-foreground/90">{imageNotice}</p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">创意实验室</h1>
          <p className="text-xs text-muted-foreground font-medium">释放视觉想象力</p>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-right text-[10px] font-bold text-primary">
          <p>单张基准价格：{formatCredit(currentPrice)} 积分 / 张</p>
          <p className="mt-1 text-[9px] font-medium text-foreground/80">多张生成会按张数累计扣费</p>
          <p className="mt-1 text-[9px] font-medium text-foreground/80">当前 {imageCount} 张，预计消耗 {formatCredit(totalPrice)} 积分</p>
        </div>
      </div>

      <Tabs
        value={mode}
        onValueChange={(val) => setMode(val as 'txt' | 'img')}
        className="w-full"
      >
        <TabsList className="w-full grid grid-cols-2 p-1 bg-secondary/50 rounded-2xl h-12">
          <TabsTrigger value="txt" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Wand2 className="w-4 h-4 mr-2" />
            <span className="font-bold text-xs uppercase tracking-wider">文生图</span>
          </TabsTrigger>
          <TabsTrigger value="img" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <ImageIcon className="w-4 h-4 mr-2" />
            <span className="font-bold text-xs uppercase tracking-wider">图生图</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="border-border/50 bg-secondary/20 p-4 rounded-3xl space-y-4">
        {mode === 'img' && (
          <Card className="border-primary/20 bg-primary/8 px-4 py-3 rounded-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <AlertCircle className="w-4 h-4" />
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
            className="relative aspect-video rounded-2xl border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors flex flex-col items-center justify-center bg-background/50 overflow-hidden cursor-pointer group"
          >
            {sourceImagePreview ? (
              <>
                <img src={sourceImagePreview} className="w-full h-full object-cover" alt="Source" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Button variant="secondary" size="sm" className="gap-2">
                    <RefreshCw className="w-3 h-3" />
                    更换图片
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <ImageIcon className="w-6 h-6 text-primary" />
                </div>
                <p className="text-xs font-bold">点击上传参考图</p>
                <p className="text-[10px] text-muted-foreground mt-1">支持 PNG, JPG, WEBP</p>
              </>
            )}
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-3">
            <p className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">
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
                    aria-label={`图片模型 ${currentModelLabel}`}
                    aria-haspopup="listbox"
                    aria-expanded={isModelPickerOpen}
                    onClick={() => setIsModelPickerOpen((open) => !open)}
                    className={cn(
                      'flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all outline-none',
                      'focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15',
                      isModelPickerOpen
                        ? 'border-primary/50 bg-primary/12 shadow-lg shadow-primary/10'
                        : 'border-border/50 bg-background/55 hover:border-primary/30 hover:bg-background/70',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {currentModelLabel}
                      </span>
                      {currentModel?.description?.trim() && currentModel.description.trim() !== currentModel.slug ? (
                        <span className="mt-1 block truncate text-[10px] font-medium tracking-wide text-muted-foreground/90">
                          {currentModel.slug}
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
                    <div className="absolute left-0 top-[calc(100%+0.5rem)] z-20 w-full overflow-hidden rounded-2xl border border-border/60 bg-background/95 p-2 shadow-2xl shadow-black/20 backdrop-blur">
                      <ScrollArea className="max-h-72">
                        <div aria-label="图片模型列表" role="listbox" className="space-y-2 pr-2">
                          {imageModels.map((model) => {
                            const isActive = selectedImageModel === model.slug;
                            const modelLabel = model.description?.trim() || model.slug;

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
                                    ? 'border-primary/50 bg-primary/15 shadow-lg shadow-primary/10'
                                    : 'border-border/50 bg-background/60 hover:border-primary/30 hover:bg-background/80',
                                )}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-foreground">
                                    {modelLabel}
                                  </span>
                                  {model.description?.trim() && model.description.trim() !== model.slug ? (
                                    <span className="mt-1 block truncate text-[10px] font-medium tracking-wide text-muted-foreground/90">
                                      {model.slug}
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
              placeholder={mode === 'txt' ? '描述想看到的画面...' : '描述想要修改、增强或重绘的部分...'}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[140px] resize-none border-none bg-background/50 focus-visible:ring-primary/20 rounded-2xl p-4 text-sm leading-relaxed"
            />
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">画布比例</p>
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
                    <span className={cn('mt-0.5 text-[8px]', isActive ? 'opacity-80 text-foreground/80' : 'opacity-60 text-muted-foreground')}>
                      {option.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">输出尺寸</p>
            <div className="grid grid-cols-3 gap-2">
              {OUTPUT_SIZE_OPTIONS.map((option) => {
                const isActive = activeUpscale === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-label={option.label}
                    onClick={() => handleUpscaleChange(option.value)}
                    className={cn(
                      'rounded-2xl border px-2 py-3 text-center transition-all',
                      isActive
                        ? 'border-primary/50 bg-primary/15 text-foreground shadow-lg shadow-primary/10'
                        : 'border-border/50 bg-background/50 hover:border-primary/30',
                    )}
                  >
                    <span className="block text-[11px] font-bold">{option.label}</span>
                    <span className={cn('mt-1 block text-[9px]', isActive ? 'text-foreground/80' : 'text-muted-foreground')}>
                      {option.desc}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-[10px] leading-5 text-foreground/80">
              <p>
                {UPSCALE_HINT_LEAD}
                <b className="font-semibold text-foreground">Catmull-Rom 插值</b>
                放大并以 PNG 输出。
              </p>
              <p className="mt-1">
                <span className="font-semibold text-amber-700 dark:text-amber-300">{UPSCALE_HINT_WARN}</span>
                {UPSCALE_HINT_TAIL}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">生成张数</p>
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
        </div>

        <Button
          className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-lg shadow-xl shadow-primary/25 disabled:opacity-50"
          onClick={handleGenerate}
          disabled={isGenerating || !selectedImageModel}
        >
          {isGenerating ? (
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>AI 处理中...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              <span>开始创作</span>
            </div>
          )}
        </Button>
      </Card>

      <AnimatePresence>
        {resultImages.length > 0 && (
          <motion.section
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4 pb-12"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                生成结果 <Check className="w-4 h-4 text-green-500" />
              </h2>
              <Button variant="secondary" size="sm" onClick={clearResults} className="rounded-xl px-3">
                <X className="w-4 h-4 mr-1" />
                清空结果
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {resultImages.map((imageUrl, index) => (
                <div key={`${imageUrl}-${index}`} className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-xl">
                  <img src={imageUrl} alt={`Result ${index + 1}`} className="aspect-square w-full object-cover" />
                  {isPreviewResult && (
                    <div className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
                      预览图
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {resultImages.length === 0 && !isGenerating && (
        <div className="flex flex-col items-center justify-center py-12 opacity-30 text-center space-y-3">
          <AlertCircle className="w-8 h-8" />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest">等待灵感输入</p>
            <p className="text-[10px] mt-1">生成完成后会自动同步到记录页</p>
          </div>
        </div>
      )}
    </div>
  );
}
