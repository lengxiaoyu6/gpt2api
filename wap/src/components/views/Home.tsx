import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Wand2, Image as ImageIcon, ChevronRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import homeHero from '@/assets/home-hero.jpg';

interface HomeViewProps {
  onStartGeneration: () => void;
}

export default function HomeView({ onStartGeneration }: HomeViewProps) {
  const features = [
    {
      title: '文生图',
      desc: '输入描述词，AI 为场景、人物与风格提供完整画面。',
      icon: Wand2,
      color: 'bg-indigo-500',
    },
    {
      title: '图生图',
      desc: '上传参考图，继续增强细节、重绘风格与画面质感。',
      icon: ImageIcon,
      color: 'bg-emerald-500',
    },
  ];

  return (
    <div className="px-4 py-6 space-y-12">
      <section className="relative h-[420px] rounded-3xl overflow-hidden group">
        <img
          src={homeHero}
          alt="Hero"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent flex flex-col justify-end p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 backdrop-blur-md border border-primary/30 text-primary-foreground text-xs font-bold">
              <Sparkles className="w-3 h-3" />
              <span>多模型图像引擎实时驱动</span>
            </div>
            <h1 className="text-4xl font-extrabold text-white leading-tight tracking-tighter">
              想象，<br />正在发生
            </h1>
            <p className="text-gray-300 text-sm max-w-[280px] leading-relaxed">
              将脑海中的构想转换为高质量图像，文生图与图生图都可在同一入口完成。
            </p>
            <Button
              size="lg"
              onClick={onStartGeneration}
              className="bg-white text-black hover:bg-gray-200 font-bold rounded-2xl group shadow-xl"
            >
              立刻开始创作
              <ChevronRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </motion.div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
            核心功能 <span className="text-primary text-xs bg-primary/10 px-2 py-0.5 rounded-md">2</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {features.map((f, i) => (
            <Card key={i} className="group overflow-hidden border-border/50 bg-secondary/30 backdrop-blur-sm hover:bg-secondary/50 transition-colors">
              <div className="p-4 flex items-start gap-4">
                <div className={`w-12 h-12 rounded-2xl ${f.color} flex items-center justify-center text-white shrink-0 shadow-lg`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={onStartGeneration} className="ml-auto rounded-full group-hover:bg-primary/20 group-hover:text-primary">
                  <Play className="w-4 h-4 fill-current" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <div className="text-center pb-8 opacity-50 space-y-1">
        <p className="text-[10px] font-medium tracking-widest uppercase">GPT2API • Creative Studio</p>
        <p className="text-[8px]">Powered by GPT2API Image Playground</p>
      </div>
    </div>
  );
}
