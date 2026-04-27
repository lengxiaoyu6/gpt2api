import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore, GenerationRecord } from '../../store/useStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Trash2, Download, ExternalLink, Image as ImageIcon, History as HistoryIcon, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';

export default function HistoryView() {
  const { history } = useStore();
  const [selectedImage, setSelectedImage] = useState<GenerationRecord | null>(null);
  const [search, setSearch] = useState('');

  const filtered = history.filter(item => 
    item.prompt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 py-6 lg:py-0 space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">时间轴</h1>
          <p className="text-xs lg:text-sm text-muted-foreground font-medium">存档您的所有创意瞬间，随时回顾灵感轨迹</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="搜索提示词..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-2xl bg-secondary/30 border-none h-10 text-sm"
            />
          </div>
          <Button variant="secondary" size="icon" className="rounded-xl shrink-0">
            <Filter className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-6">
          {filtered.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setSelectedImage(item)}
              className="group relative aspect-[3/4] rounded-[24px] overflow-hidden cursor-pointer border border-border/50 shadow-md bg-secondary/20 hover:shadow-xl hover:shadow-primary/10 transition-all"
            >
              <img 
                src={item.imageUrl} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                alt={item.prompt} 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                <p className="text-xs text-white/90 line-clamp-3 leading-relaxed font-bold mb-2">
                  {item.prompt}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/60 font-mono">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                    <HistoryIcon className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-32 text-center opacity-30 gap-6">
          <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center">
            <ImageIcon className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <p className="text-xl font-black tracking-tight">暂无历史记录</p>
            <p className="text-xs uppercase tracking-[4px] mt-1 font-bold">开启您的第一幅画卷</p>
          </div>
        </div>
      )}

      {/* Detail Overlay */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-card rounded-3xl overflow-hidden shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="relative aspect-square">
                <img src={selectedImage.imageUrl} className="w-full h-full object-cover" alt="Detail" />
                <Button 
                  variant="secondary" 
                  size="icon" 
                  onClick={() => setSelectedImage(null)}
                  className="absolute top-4 right-4 rounded-full bg-black/50 text-white border-none hover:bg-black/70"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-6 space-gap-6 flex flex-col gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-widest">
                    <Calendar className="w-3 h-3" />
                    <span>创建于 {new Date(selectedImage.createdAt).toLocaleString()}</span>
                  </div>
                  <h3 className="font-bold text-lg leading-tight">{selectedImage.prompt}</h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button className="rounded-2xl h-12 gap-2 font-bold shadow-lg shadow-primary/20">
                    <Download className="w-4 h-4" />
                    下载原图
                  </Button>
                  <Button variant="secondary" className="rounded-2xl h-12 gap-2 font-bold">
                    <ExternalLink className="w-4 h-4" />
                    分享链接
                  </Button>
                </div>

                <div className="pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>生成耗时</span>
                    <span className="font-mono text-foreground font-bold">~14.2s</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                    <span>生成模型</span>
                    <span className="font-mono text-foreground font-bold uppercase tracking-tighter">Gemini-2.5-IMAGE</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
