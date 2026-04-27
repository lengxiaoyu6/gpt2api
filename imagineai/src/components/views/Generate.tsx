import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wand2, Image as ImageIcon, Zap, RefreshCw, Download, Share2, Sparkles, AlertCircle, X, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStore } from '../../store/useStore';
import { generateAIImage, editAIImage, optimizePrompt } from '../../lib/gemini';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function GenerateView() {
  const { user, usePoints, addRecord } = useStore();
  const [mode, setMode] = useState<'txt' | 'img'>('txt');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<any>('1:1');
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ratios = [
    { label: '1:1', value: '1:1', desc: '社交媒体' },
    { label: '4:3', value: '4:3', desc: '经典画幅' },
    { label: '3:4', value: '3:4', desc: '人像摄影' },
    { label: '16:9', value: '16:9', desc: '电影宽屏' },
    { label: '9:16', value: '9:16', desc: '短视频' },
  ];

  const handleOptimize = async () => {
    if (!prompt) return;
    setIsOptimizing(true);
    try {
      const optimized = await optimizePrompt(prompt);
      setPrompt(optimized);
      toast.success('提示词已极致优化');
    } catch (e) {
      toast.error('优化失败');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt && mode === 'txt') {
      toast.error('请输入提示词');
      return;
    }
    if (!sourceImage && mode === 'img') {
      toast.error('请上传参考图');
      return;
    }

    if (!usePoints(5)) {
      toast.error('积分不足，请去个人中心领取');
      return;
    }

    setIsGenerating(true);
    try {
      let imageUrl = '';
      if (mode === 'txt') {
        imageUrl = await generateAIImage(prompt, aspectRatio);
      } else {
        imageUrl = await editAIImage(sourceImage!, prompt || 'enhanced masterpiece portrait');
      }
      
      setResultImage(imageUrl);
      addRecord({
        id: Math.random().toString(36).substring(7),
        prompt: prompt || 'Image to Image Refine',
        imageUrl,
        type: mode === 'txt' ? 'text-to-image' : 'image-to-image',
        createdAt: Date.now(),
        pointsUsed: 5,
      });
      toast.success('创作完成！消耗 5 积分');
    } catch (e) {
      toast.error('生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSourceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="px-4 py-6 lg:py-0 space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">创意实验室</h1>
          <p className="text-xs lg:text-sm text-muted-foreground font-medium">释放你的视觉想象力，开启 AI 艺术发现之旅</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] lg:text-xs font-bold w-fit">
          <Zap className="w-3 h-3 lg:w-4 lg:h-4 fill-current" />
          <span>每次生成消耗 5 积分</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Left: Controls */}
        <div className="w-full lg:w-[400px] space-y-6 shrink-0">
          <Tabs 
            value={mode} 
            onValueChange={(val: any) => setMode(val)} 
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

          <Card className="border-border/50 bg-secondary/20 p-5 rounded-3xl space-y-6">
            {mode === 'img' && (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="relative aspect-video rounded-2xl border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors flex flex-col items-center justify-center bg-background/50 overflow-hidden cursor-pointer group"
              >
                {sourceImage ? (
                  <>
                    <img src={sourceImage} className="w-full h-full object-cover" />
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
                  placeholder={mode === 'txt' ? "描述你想看到的画面..." : "描述你想要修改或增强的部分..."}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[160px] resize-none border-none bg-background/50 focus-visible:ring-primary/20 rounded-2xl p-4 text-sm leading-relaxed"
                />
                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={handleOptimize}
                  disabled={!prompt || isOptimizing}
                  className="absolute bottom-3 right-3 rounded-xl gap-1.5 h-8 px-3 text-[10px] font-bold shadow-sm"
                >
                  {isOptimizing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-primary" />}
                  极致优化
                </Button>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">画布比例</p>
                <div className="grid grid-cols-3 gap-2">
                  {ratios.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setAspectRatio(r.value)}
                      className={cn(
                        "flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all",
                        aspectRatio === r.value 
                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" 
                        : "bg-background/50 border-border/50 hover:border-primary/30"
                      )}
                    >
                      <span className="text-[10px] font-black">{r.label}</span>
                      <span className={cn("text-[8px] mt-0.5 opacity-60", aspectRatio === r.value ? "text-white" : "")}>{r.desc}</span>
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
                  <span>AI 降临中...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  <span>开始创作</span>
                </div>
              )}
            </Button>
          </Card>
        </div>

        {/* Right: Results Section */}
        <div className="flex-1 w-full min-h-[400px]">
          <AnimatePresence mode="wait">
            {resultImage ? (
              <motion.section
                key="result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-4 lg:sticky lg:top-12 pb-12"
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
                
                <div className="relative group overflow-hidden rounded-3xl border-2 border-primary/20 shadow-2xl bg-card">
                  <img src={resultImage} alt="Result" className="w-full h-auto object-cover max-h-[70vh]" />
                  <div className="absolute top-4 right-4">
                    <Button 
                      variant="secondary" 
                      size="icon" 
                      onClick={() => setResultImage(null)}
                      className="rounded-full bg-black/40 backdrop-blur-md border-none text-white hover:bg-black/60 shadow-lg"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.section>
            ) : isGenerating ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full h-full min-h-[500px] rounded-[32px] bg-secondary/10 border-2 border-dashed border-border/50 flex flex-col items-center justify-center p-8 text-center"
              >
                <div className="relative w-24 h-24 mb-6">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 border-t-4 border-primary rounded-full"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-10 h-10 text-primary animate-pulse" />
                  </div>
                </div>
                <h3 className="text-xl font-black mb-2 tracking-tight">灵感碎片正在重构...</h3>
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                  我们的 AI 正在根据您的描述词，跨越时空维度捕捉光影与色彩。请稍候片刻。
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full h-full min-h-[500px] rounded-[32px] bg-secondary/5 border-2 border-dashed border-border/30 flex flex-col items-center justify-center p-12 text-center opacity-40 hover:opacity-100 transition-opacity"
              >
                <div className="w-20 h-20 rounded-3xl bg-secondary/50 flex items-center justify-center mb-6">
                  <AlertCircle className="w-10 h-10" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-widest mb-1">画室就绪</h3>
                <p className="text-[10px] mt-1 max-w-xs">
                  目前服务器运行平稳，支持全球各地的创意请求。在左侧描述你的梦境，在这里捕捉它的真相。
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
