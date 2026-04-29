import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Wand2, Image as ImageIcon, ChevronRight, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageShell from '@/components/PageShell';

interface HomeViewProps {
  onStartGeneration: () => void;
  siteName?: string;
}

const HERO_PARTICLES = [
  { left: '6%', top: '18%', size: 5, delay: 0, duration: 7, color: 'bg-cyan-200/90' },
  { left: '12%', top: '58%', size: 3, delay: 0.6, duration: 6, color: 'bg-blue-200/80' },
  { left: '18%', top: '32%', size: 7, delay: 1.1, duration: 8, color: 'bg-primary/80' },
  { left: '24%', top: '72%', size: 4, delay: 0.4, duration: 6.8, color: 'bg-violet-200/80' },
  { left: '31%', top: '16%', size: 3, delay: 1.4, duration: 7.6, color: 'bg-white/90' },
  { left: '36%', top: '46%', size: 6, delay: 0.2, duration: 7.2, color: 'bg-fuchsia-200/85' },
  { left: '42%', top: '78%', size: 3, delay: 1.8, duration: 6.6, color: 'bg-cyan-100/80' },
  { left: '47%', top: '26%', size: 4, delay: 0.9, duration: 7.8, color: 'bg-primary/80' },
  { left: '53%', top: '64%', size: 8, delay: 0.1, duration: 8.2, color: 'bg-blue-200/80' },
  { left: '58%', top: '12%', size: 3, delay: 1.6, duration: 6.9, color: 'bg-white/85' },
  { left: '64%', top: '38%', size: 5, delay: 0.5, duration: 7.4, color: 'bg-violet-100/90' },
  { left: '68%', top: '82%', size: 4, delay: 1.2, duration: 6.4, color: 'bg-cyan-200/80' },
  { left: '73%', top: '22%', size: 7, delay: 0.3, duration: 8.4, color: 'bg-fuchsia-200/80' },
  { left: '78%', top: '56%', size: 3, delay: 1.5, duration: 6.7, color: 'bg-white/90' },
  { left: '84%', top: '14%', size: 4, delay: 0.8, duration: 7.1, color: 'bg-primary/85' },
  { left: '88%', top: '70%', size: 6, delay: 1.9, duration: 8.1, color: 'bg-blue-100/80' },
  { left: '92%', top: '34%', size: 3, delay: 0.7, duration: 7.5, color: 'bg-cyan-100/90' },
  { left: '96%', top: '50%', size: 5, delay: 1.3, duration: 6.5, color: 'bg-violet-200/80' },
  { left: '9%', top: '84%', size: 3, delay: 2.1, duration: 7.7, color: 'bg-white/80' },
  { left: '29%', top: '88%', size: 5, delay: 1.7, duration: 8.3, color: 'bg-primary/70' },
  { left: '51%', top: '90%', size: 3, delay: 2.3, duration: 7.3, color: 'bg-cyan-200/80' },
  { left: '71%', top: '92%', size: 4, delay: 2.5, duration: 6.9, color: 'bg-fuchsia-100/80' },
  { left: '86%', top: '88%', size: 3, delay: 2.7, duration: 7.9, color: 'bg-white/75' },
  { left: '40%', top: '8%', size: 4, delay: 2.9, duration: 8.5, color: 'bg-blue-200/80' },
];

function useDesktopAnimationEnabled() {
  const [enabled, setEnabled] = React.useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }

    return window.matchMedia('(min-width: 1024px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateEnabled = () => {
      setEnabled(mediaQuery.matches && !reducedMotionQuery.matches);
    };

    updateEnabled();
    mediaQuery.addEventListener?.('change', updateEnabled);
    reducedMotionQuery.addEventListener?.('change', updateEnabled);

    return () => {
      mediaQuery.removeEventListener?.('change', updateEnabled);
      reducedMotionQuery.removeEventListener?.('change', updateEnabled);
    };
  }, []);

  return enabled;
}

export default function HomeView({ onStartGeneration, siteName = 'OAI Hub' }: HomeViewProps) {
  const [videoDialogOpen, setVideoDialogOpen] = React.useState(false);
  const desktopAnimationEnabled = useDesktopAnimationEnabled();

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
    <PageShell width="wide" className="space-y-10 pt-3 lg:space-y-16 lg:pt-8">
      <section
        role="region"
        aria-label="首页创作横幅"
        className="group relative h-[280px] overflow-hidden rounded-3xl bg-slate-950 ring-1 ring-white/10 lg:h-[520px] lg:min-h-[460px] lg:rounded-[2.5rem] lg:shadow-2xl lg:shadow-primary/10"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(56,189,248,0.34),transparent_28%),radial-gradient(circle_at_78%_18%,rgba(168,85,247,0.35),transparent_30%),radial-gradient(circle_at_62%_82%,rgba(34,211,238,0.22),transparent_34%),linear-gradient(135deg,rgba(2,6,23,1),rgba(15,23,42,0.96)_46%,rgba(30,41,59,0.92))]" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
        <motion.div
          data-testid="home-hero-desktop-effect"
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 hidden h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/10 lg:block"
          animate={desktopAnimationEnabled ? { rotate: 360 } : undefined}
          transition={desktopAnimationEnabled ? { duration: 42, repeat: Infinity, ease: 'linear' } : undefined}
        />
        <motion.div
          data-testid="home-hero-desktop-effect"
          aria-hidden="true"
          className="absolute right-[-10%] top-[-18%] hidden h-72 w-72 rounded-full bg-fuchsia-500/25 blur-3xl lg:block"
          animate={desktopAnimationEnabled ? { scale: [1, 1.16, 1], opacity: [0.55, 0.82, 0.55] } : undefined}
          transition={desktopAnimationEnabled ? { duration: 8, repeat: Infinity, ease: 'easeInOut' } : undefined}
        />
        <motion.div
          data-testid="home-hero-desktop-effect"
          aria-hidden="true"
          className="absolute bottom-[-22%] left-[24%] hidden h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl lg:block"
          animate={desktopAnimationEnabled ? { scale: [1.08, 0.92, 1.08], opacity: [0.45, 0.76, 0.45] } : undefined}
          transition={desktopAnimationEnabled ? { duration: 9, repeat: Infinity, ease: 'easeInOut' } : undefined}
        />
        <div data-testid="home-hero-particle-field" aria-hidden="true" className="mobile-static-particle-field absolute inset-0">
          <svg className="absolute inset-0 h-full w-full opacity-35" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M6 18 C22 34 30 10 47 26 S70 18 84 14" fill="none" stroke="rgba(125, 211, 252, 0.45)" strokeWidth="0.22" />
            <path d="M12 58 C31 46 38 82 53 64 S74 74 92 34" fill="none" stroke="rgba(216, 180, 254, 0.38)" strokeWidth="0.18" />
            <path d="M18 32 C35 47 53 64 68 82 S82 62 96 50" fill="none" stroke="rgba(255, 255, 255, 0.22)" strokeWidth="0.16" />
          </svg>
          {HERO_PARTICLES.map((particle, index) => {
            const particleProps = {
              className: `hero-particle absolute rounded-full ${particle.color} shadow-[0_0_18px_currentColor]`,
              style: {
                left: particle.left,
                top: particle.top,
                width: particle.size,
                height: particle.size,
              },
            };

            return desktopAnimationEnabled ? (
              <motion.span
                key={`${particle.left}-${particle.top}`}
                {...particleProps}
                animate={{
                  x: [0, index % 2 === 0 ? 18 : -16, 0],
                  y: [0, index % 3 === 0 ? -22 : 18, 0],
                  opacity: [0.35, 1, 0.35],
                  scale: [0.9, 1.35, 0.9],
                }}
                transition={{
                  duration: particle.duration,
                  delay: particle.delay,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            ) : (
              <span key={`${particle.left}-${particle.top}`} {...particleProps} />
            );
          })}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/34 to-transparent" />
        <div
          data-testid="home-hero-content"
          className="absolute inset-0 flex flex-col justify-center px-6 py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center lg:gap-10 lg:p-12"
        >
          <motion.div
            initial={desktopAnimationEnabled ? { opacity: 0, y: 20 } : false}
            animate={desktopAnimationEnabled ? { opacity: 1, y: 0 } : undefined}
            transition={desktopAnimationEnabled ? { delay: 0.2 } : undefined}
            className="max-w-2xl space-y-3 lg:space-y-6"
          >
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-200/25 bg-white/10 px-3 py-1 text-xs font-bold text-cyan-50 shadow-lg shadow-cyan-500/10 lg:px-4 lg:py-1.5 lg:text-sm lg:backdrop-blur-md">
              <Sparkles className="h-3 w-3 lg:h-4 lg:w-4" />
              <span>OAI Hub 绘影</span>
            </div>
            <h1 className="whitespace-nowrap text-[clamp(1.75rem,8vw,3.75rem)] font-black leading-[0.95] tracking-tight text-white lg:text-6xl lg:leading-[0.98]">
              超越想象&nbsp;
              <span className="bg-gradient-to-r from-primary via-blue-400 to-indigo-500 bg-clip-text text-transparent">
                触手可及
              </span>
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-slate-200/85 lg:text-base">
              在神经元网络的宏大共鸣中，将您的奇思妙想转化为独一无二的数字艺术杰作。
            </p>
            <Button
              size="lg"
              onClick={onStartGeneration}
              className="group w-fit rounded-2xl bg-white font-bold text-slate-950 shadow-xl shadow-cyan-500/15 hover:bg-cyan-50 lg:h-14 lg:px-8 lg:text-base"
            >
              立刻开始创作
              <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1 lg:h-5 lg:w-5" />
            </Button>
          </motion.div>

          {desktopAnimationEnabled && (
            <motion.div
              data-testid="home-hero-render-panel"
              aria-hidden="true"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.34, duration: 0.5 }}
              className="hidden rounded-[2rem] border border-white/14 bg-white/[0.08] p-4 shadow-2xl shadow-black/20 backdrop-blur-2xl lg:block"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                </div>
                <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100">
                  Live Render
                </span>
              </div>
              <div className="relative h-56 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.32),transparent_34%),radial-gradient(circle_at_36%_64%,rgba(168,85,247,0.26),transparent_28%)]" />
                <div className="absolute inset-5 grid grid-cols-6 gap-2 opacity-70">
                  {Array.from({ length: 24 }).map((_, index) => (
                    <motion.span
                      key={index}
                      className="rounded-lg border border-white/10 bg-white/10"
                      animate={{ opacity: [0.28, 0.9, 0.28] }}
                      transition={{ duration: 2.4, delay: index * 0.08, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  ))}
                </div>
                <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-slate-950/70 p-3 backdrop-blur">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-200">
                    <span>Prompt Matrix</span>
                    <span className="text-cyan-200">96%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-primary to-fuchsia-300"
                      animate={{ width: ['38%', '96%', '38%'] }}
                      transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
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
              className="group relative h-full min-h-[156px] cursor-pointer overflow-hidden rounded-[2rem] border-border/60 bg-background/80 p-0 text-left shadow-sm transition-colors duration-200 lg:backdrop-blur lg:transition-all lg:duration-300 lg:hover:-translate-y-1 lg:hover:border-primary/20 lg:hover:bg-background lg:hover:shadow-2xl lg:hover:shadow-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
            >
              <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${feature.surfaceClassName}`} />
              <div className="relative flex h-full flex-col gap-5 p-5 lg:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.iconClassName} text-white shadow-lg lg:h-14 lg:w-14`}>
                    <feature.icon className="h-6 w-6 lg:h-7 lg:w-7" />
                  </div>
                  <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-bold text-muted-foreground shadow-sm lg:backdrop-blur">
                    {feature.badge}
                  </span>
                </div>

                <div className="min-h-[86px] flex-1 space-y-2">
                  <h3 className="text-lg font-black tracking-tight lg:text-xl">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
                </div>

                <div
                  aria-hidden="true"
                  className="flex min-h-[44px] items-center justify-between rounded-2xl border border-border/70 bg-secondary/40 px-4 text-sm font-bold text-foreground transition-colors lg:group-hover:border-primary/20 lg:group-hover:bg-primary/10 lg:group-hover:text-primary"
                >
                  <span>{feature.actionLabel}</span>
                  <ChevronRight className="h-4 w-4 transition-transform lg:group-hover:translate-x-1" />
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
