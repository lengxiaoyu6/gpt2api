import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Wand2, Image as ImageIcon, Zap, ChevronRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface HomeViewProps {
  onStartGeneration: () => void;
}

export default function HomeView({ onStartGeneration }: HomeViewProps) {
  const features = [
    {
      title: '文生图',
      desc: '输入描述词，AI 为您勾勒梦想中的场景',
      icon: Wand2,
      color: 'bg-indigo-500',
    },
    {
      title: '图生图',
      desc: '上传参考图，让 AI 高级修复或跨界重绘',
      icon: ImageIcon,
      color: 'bg-emerald-500',
    },
    {
      title: '极致优化',
      desc: 'Gemini 智能补完，让简单的词汇变幻出杰作',
      icon: Zap,
      color: 'bg-amber-500',
    }
  ];

  const showcase = [
    'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=800&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=800&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=800&auto=format&fit=crop&q=60',
  ];

  return (
    <div className="px-4 py-6 lg:py-0 space-y-16 max-w-7xl mx-auto">
      {/* Hero Section */}
      <section className="relative h-[420px] lg:h-[600px] rounded-[40px] overflow-hidden group shadow-2xl">
        <img
          src="https://images.unsplash.com/photo-1633167606207-d840b5070fc2?w=1080&auto=format&fit=crop&q=80"
          alt="Hero"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent flex flex-col justify-end p-8 lg:p-16">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6 max-w-2xl"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/20 backdrop-blur-md border border-primary/30 text-primary-foreground text-xs lg:text-sm font-bold w-fit">
              <Sparkles className="w-3 h-3 lg:w-4 lg:h-4" />
              <span>由 Gemini 3.1 极致视觉模型驱动</span>
            </div>
            <h1 className="text-5xl lg:text-7xl font-black text-white leading-[0.9] tracking-tighter">
              想象，<br />正在发生
            </h1>
            <p className="text-gray-200 text-sm lg:text-lg max-w-md leading-relaxed font-medium">
              将您的每一个奇思妙想，通过神经元网络的共鸣，转化为不可思议的视觉艺术，尽在此刻。
            </p>
            <Button 
              size="lg" 
              onClick={onStartGeneration}
              className="bg-white text-black hover:bg-gray-200 font-black rounded-2xl group shadow-xl h-14 px-8 text-lg"
            >
              立刻开始创作
              <ChevronRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Feature Grids */}
      <section className="space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl lg:text-3xl font-black tracking-tight flex items-center gap-3">
            核心能力库 <span className="text-primary text-xs bg-primary/10 px-3 py-1 rounded-lg">Version 3.0</span>
          </h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <Card key={i} className="group overflow-hidden border-border/50 bg-secondary/30 backdrop-blur-sm hover:bg-secondary/50 transition-all hover:shadow-xl hover:-translate-y-1 duration-300 rounded-[32px]">
              <div className="p-6 space-y-6 flex flex-col h-full">
                <div className={`w-14 h-14 rounded-2xl ${f.color} flex items-center justify-center text-white shrink-0 shadow-lg group-hover:scale-110 transition-transform`}>
                  <f.icon className="w-7 h-7" />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-black text-xl">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed font-medium">{f.desc}</p>
                </div>
                <Button variant="ghost" className="w-full justify-between rounded-xl hover:bg-primary/10 hover:text-primary font-bold group/btn">
                  了解详情
                  <Play className="w-4 h-4 fill-current group-hover/btn:translate-x-1 transition-transform" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Inspiration Showcase */}
      <section className="space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl lg:text-3xl font-black tracking-tight">灵感殿堂</h2>
          <Button variant="link" className="text-primary text-sm font-black p-0 h-auto tracking-widest uppercase">Explore Gallery</Button>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {showcase.map((url, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 0.98 }}
              className="relative aspect-square rounded-[32px] overflow-hidden group border border-border/50 shadow-lg"
            >
              <img
                src={url}
                alt={`Art ${i}`}
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                <div className="flex flex-col gap-2">
                   <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-white/20 backdrop-blur-md p-1.5 flex items-center justify-center">
                      <Sparkles className="w-full h-full text-white" />
                    </div>
                    <span className="text-xs text-white font-bold uppercase tracking-wider">Masterpiece</span>
                  </div>
                  <p className="text-[10px] text-white/60 font-medium line-clamp-1">点击查看生成轨迹与详细提示词</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer Info */}
      <div className="text-center py-20 opacity-30 space-y-2 border-t border-border/10">
        <p className="text-xs font-black tracking-[8px] uppercase">ImagineAI • Creative Intelligence Studio</p>
        <p className="text-[10px] font-medium uppercase tracking-widest">Global Node Distribution Strategy Verified</p>
      </div>
    </div>
  );
}
