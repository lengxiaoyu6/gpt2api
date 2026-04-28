import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Wand2, Image as ImageIcon, ChevronRight, Play, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageShell from '@/components/PageShell';
import homeHero from '@/assets/home-hero.jpg';

interface HomeViewProps {
  onStartGeneration: () => void;
  siteName?: string;
}

export default function HomeView({ onStartGeneration, siteName = 'GPT2API' }: HomeViewProps) {
  const [videoDialogOpen, setVideoDialogOpen] = React.useState(false);

  const handleFeatureKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, onClick: () => void) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    onClick();
  };

  const features = [
    {
      title: '文生图',
      desc: '输入描述词，AI 为场景、人物与风格提供完整画面。',
      icon: Wand2,
      color: 'bg-indigo-500',
      onClick: onStartGeneration,
    },
    {
      title: '图生图',
      desc: '上传参考图，继续增强细节、重绘风格与画面质感。',
      icon: ImageIcon,
      color: 'bg-emerald-500',
      onClick: onStartGeneration,
    },
    {
      title: '生成视频',
      desc: '视频生成功能正在蓄力中，很快就能把你的想法变成动态画面啦✨',
      icon: Video,
      color: 'bg-rose-500',
      onClick: () => setVideoDialogOpen(true),
    },
  ];

  return (
    <PageShell width="wide" className="space-y-12 lg:space-y-16">
      <section className="group relative h-[320px] overflow-hidden rounded-3xl lg:min-h-[460px] lg:h-[520px] lg:rounded-[2.5rem] lg:shadow-2xl">
        <img
          src={homeHero}
          alt="Hero"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
        />
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black via-black/40 to-transparent p-8 lg:p-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-2xl space-y-4 lg:space-y-6"
          >
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/20 px-3 py-1 text-xs font-bold text-primary-foreground backdrop-blur-md lg:px-4 lg:py-1.5 lg:text-sm">
              <Sparkles className="h-3 w-3 lg:h-4 lg:w-4" />
              <span>多模型图像引擎实时驱动</span>
            </div>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tighter text-white lg:text-6xl lg:leading-[0.95]">
              想象，<br />正在发生
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-gray-300 lg:text-base lg:text-gray-200">
              将脑海中的构想转换为高质量图像，文生图与图生图都可在同一入口完成。
            </p>
            <Button
              size="lg"
              onClick={onStartGeneration}
              className="group w-fit rounded-2xl bg-white font-bold text-black shadow-xl hover:bg-gray-200 lg:h-14 lg:px-8 lg:text-base"
            >
              立刻开始创作
              <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1 lg:h-5 lg:w-5" />
            </Button>
          </motion.div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-black tracking-tight lg:text-2xl">
            核心功能 <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">{features.length}</span>
          </h2>
        </div>

        <div role="region" aria-label="核心功能列表" className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {features.map((feature, index) => (
            <Card
              key={index}
              role="button"
              tabIndex={0}
              aria-label={feature.title}
              onClick={feature.onClick}
              onKeyDown={(event) => handleFeatureKeyDown(event, feature.onClick)}
              className="group cursor-pointer overflow-hidden rounded-[2rem] border-border/50 bg-secondary/30 text-left backdrop-blur-sm transition-all hover:bg-secondary/50 hover:shadow-xl hover:shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <div className="flex items-start gap-4 p-5 lg:flex-col lg:gap-6 lg:p-6">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${feature.color} text-white shadow-lg lg:h-14 lg:w-14`}>
                  <feature.icon className="h-6 w-6 lg:h-7 lg:w-7" />
                </div>
                <div className="space-y-1 lg:flex-1 lg:space-y-2">
                  <h3 className="font-bold lg:text-lg">{feature.title}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground lg:text-sm">{feature.desc}</p>
                </div>
                <div
                  aria-hidden="true"
                  className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-primary/20 group-hover:text-primary lg:ml-0 lg:h-10 lg:w-10"
                >
                  <Play className="h-4 w-4 fill-current" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
        <DialogContent className="max-w-sm rounded-[28px] border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur" showCloseButton={false}>
          <DialogHeader className="px-6 pt-6 text-center">
            <DialogTitle className="text-xl font-black tracking-tight">生成视频</DialogTitle>
            <DialogDescription className="pt-2 text-sm">
              视频生成功能正在蓄力中，很快就能把你的想法变成动态画面啦✨
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-2 rounded-b-[28px] border-border/60 bg-secondary/20 px-6 py-4">
            <Button className="h-11 w-full rounded-2xl" onClick={() => setVideoDialogOpen(false)}>
              知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-1 pb-8 pt-2 text-center opacity-50 lg:pb-10 lg:pt-6">
        <p className="text-[10px] font-medium uppercase tracking-widest">{siteName}</p>
        <p className="text-[8px]">© {siteName}</p>
      </div>
    </PageShell>
  );
}
