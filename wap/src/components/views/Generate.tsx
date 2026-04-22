import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wand2, Image as ImageIcon, Zap, RefreshCw, Download, Share2, Sparkles, AlertCircle, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCredit } from '@/lib/utils';
import { useStore, type AspectRatio } from '../../store/useStore';

export default function GenerateView() {
  const { generateImage, editImage, imageModels, selectedImageModel } = useStore();
  const [mode, setMode] = useState<'txt' | 'img'>('txt');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [sourceImagePreview, setSourceImagePreview] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const ratios: ReadonlyArray<{ label: AspectRatio; value: AspectRatio; desc: string }> = [
    { label: '1:1', value: '1:1', desc: '社交媒体' },
    { label: '4:3', value: '4:3', desc: '经典画幅' },
    { label: '3:4', value: '3:4', desc: '人像摄影' },
    { label: '16:9', value: '16:9', desc: '电影宽屏' },
    { label: '9:16', value: '9:16', desc: '短视频' },
  ];

  const currentModel = imageModels.find((item) => item.slug === selectedImageModel);
  const currentPrice = currentModel?.image_price_per_call ?? 5;

  useEffect(() => {
    return () => {
      if (sourceImagePreview?.startsWith('blob:')) {
        URL.revokeObjectURL(sourceImagePreview);
      }
    };
  }, [sourceImagePreview]);

  const handleGenerate = async () => {
    const nextPrompt = prompt.trim();

    if (!nextPrompt && mode === 'txt') {
      toast.error('请输入提示词');
      return;
    }
    if (!sourceFile && mode === 'img') {
      toast.error('请上传参考图');
      return;
    }

    setIsGenerating(true);
    try {
      const response = mode === 'txt'
        ? await generateImage({ prompt: nextPrompt, aspectRatio })
        : await editImage({
            prompt: nextPrompt || '增强细节，提升画面质感',
            aspectRatio,
            file: sourceFile as File,
          });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error('当前任务尚未返回图像结果');
      }

      setResultImage(imageUrl);
      if (response.is_preview) {
        toast.message('当前结果为预览图，稍后可在记录页查看任务状态');
      } else {
        toast.success('创作完成');
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

  return (
    <div className="px-4 py-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">创意实验室</h1>
          <p className="text-xs text-muted-foreground font-medium">释放视觉想象力</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold">
          <Zap className="w-3 h-3 fill-current" />
          <span>每次生成消耗 {formatCredit(currentPrice)} 积分</span>
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
              {ratios.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setAspectRatio(r.value)}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all ${
                    aspectRatio === r.value
                      ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
                      : 'bg-background/50 border-border/50 hover:border-primary/30'
                  }`}
                >
                  <span className="text-[10px] font-black">{r.label}</span>
                  <span className={`text-[8px] mt-0.5 opacity-60 ${aspectRatio === r.value ? 'text-white' : ''}`}>{r.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <Button
          className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black text-lg shadow-xl shadow-primary/25 disabled:opacity-50"
          onClick={handleGenerate}
          disabled={isGenerating}
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
        {resultImage && (
          <motion.section
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4 pb-12"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                生成结果 <Check className="w-4 h-4 text-green-500" />
              </h2>
              <div className="flex gap-2">
                <Button variant="secondary" size="icon" className="rounded-xl h-9 w-9">
                  <Download className="w-4 h-4" />
                </Button>
                <Button variant="secondary" size="icon" className="rounded-xl h-9 w-9">
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="relative group overflow-hidden rounded-3xl border-2 border-primary/20 shadow-2xl">
              <img src={resultImage} alt="Result" className="w-full h-auto object-cover" />
              <div className="absolute top-4 right-4">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setResultImage(null)}
                  className="rounded-full bg-black/40 backdrop-blur-md border-none text-white hover:bg-black/60"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {!resultImage && !isGenerating && (
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
