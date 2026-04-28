import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Wand2, Image as ImageIcon, ChevronRight, Video } from 'lucide-react';
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
      badge: '文字创作',
      desc: '输入描述词，AI 为场景、人物与风格提供完整画面。',
      icon: Wand2,
      iconClassName: 'from-indigo-500 to-violet-500 shadow-indigo-500/25',
      surfaceClassName: 'from-indigo-500/12 via-violet-500/8 to-transparent',
      actionLabel: '开始生成',
      onClick: onStartGeneration,
    },
    {
      title: '图生图',
      badge: '参考图创作',
      desc: '上传参考图，继续增强细节、重绘风格与画面质感。',
      icon: ImageIcon,
      iconClassName: 'from-emerald-500 to-teal-500 shadow-emerald-500/25',
      surfaceClassName: 'from-emerald-500/12 via-teal-500/8 to-transparent',
      actionLabel: '上传参考图',
      onClick: onStartGeneration,
    },
    {
      title: '生成视频',
      badge: '即将开放',
      desc: '视频生成功能正在蓄力中，很快就能把你的想法变成动态画面啦✨',
      icon: Video,
      iconClassName: 'from-rose-500 to-orange-500 shadow-rose-500/25',
      surfaceClassName: 'from-rose-500/12 via-orange-500/8 to-transparent',
      actionLabel: '查看预告',
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

      <section className="space-y-6" aria-labelledby="core-features-title">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h2 id="core-features-title" className="flex items-center gap-2 text-xl font-black tracking-tight lg:text-2xl">
              核心功能
              <span className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                {features.length} 个功能
              </span>
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              选择功能入口，文生图与图生图将进入统一创作台，视频入口保留预告弹窗。
            </p>
          </div>
        </div>

        <div role="region" aria-label="核心功能列表" className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3 lg:gap-6">
          {features.map((feature) => (
            <Card
              key={feature.title}
              role="button"
              tabIndex={0}
              aria-label={`${feature.title}，${feature.actionLabel}`}
              onClick={feature.onClick}
              onKeyDown={(event) => handleFeatureKeyDown(event, feature.onClick)}
              className="group relative h-full min-h-[156px] cursor-pointer overflow-hidden rounded-[2rem] border-border/60 bg-background/80 p-0 text-left shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:bg-background hover:shadow-2xl hover:shadow-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
            >
              <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${feature.surfaceClassName}`} />
              <div className="relative flex h-full flex-col gap-5 p-5 lg:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.iconClassName} text-white shadow-lg lg:h-14 lg:w-14`}>
                    <feature.icon className="h-6 w-6 lg:h-7 lg:w-7" />
                  </div>
                  <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-bold text-muted-foreground shadow-sm backdrop-blur">
                    {feature.badge}
                  </span>
                </div>

                <div className="min-h-[86px] flex-1 space-y-2">
                  <h3 className="text-lg font-black tracking-tight lg:text-xl">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
                </div>

                <div
                  aria-hidden="true"
                  className="flex min-h-[44px] items-center justify-between rounded-2xl border border-border/70 bg-secondary/40 px-4 text-sm font-bold text-foreground transition-colors group-hover:border-primary/20 group-hover:bg-primary/10 group-hover:text-primary"
                >
                  <span>{feature.actionLabel}</span>
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
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
