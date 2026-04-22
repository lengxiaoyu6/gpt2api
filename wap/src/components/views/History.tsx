import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Trash2, Download, ExternalLink, Image as ImageIcon, History as HistoryIcon, Search } from 'lucide-react';
import { useStore, type HistoryRecord } from '../../store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function HistoryView() {
  const { user, history, fetchHistory } = useStore();
  const [selectedImage, setSelectedImage] = useState<HistoryRecord | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user) {
      void fetchHistory();
    }
  }, [fetchHistory, user]);

  const filtered = history.filter((item) => item.prompt.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="px-4 py-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">时间轴</h1>
          <p className="text-xs text-muted-foreground font-medium">存档所有创意瞬间</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
          <HistoryIcon className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="搜索提示词..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 rounded-2xl bg-secondary/30 border-none h-12 text-sm"
        />
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {filtered.map((item, i) => {
            const previewUrl = item.image_urls?.[0] || '';
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setSelectedImage(item)}
                className="group relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer border border-border/50 shadow-md bg-secondary/20"
              >
                <img
                  src={previewUrl}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  alt={item.prompt}
                />
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                  <p className="text-[10px] text-white/90 line-clamp-2 leading-tight font-medium">
                    {item.prompt}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[8px] text-white/60 font-mono">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                    <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center backdrop-blur-md">
                      <ImageIcon className="w-2.5 h-2.5 text-primary" />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center opacity-30 gap-4">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
            <ImageIcon className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-bold">暂无历史记录</p>
            <p className="text-xs uppercase tracking-widest mt-1">完成创作后会自动出现在这里</p>
          </div>
        </div>
      )}

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
                <img src={selectedImage.image_urls?.[0] || ''} className="w-full h-full object-cover" alt="Detail" />
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
                    <span>创建于 {new Date(selectedImage.created_at).toLocaleString()}</span>
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
                    <span className="font-mono text-foreground font-bold">
                      {selectedImage.started_at && selectedImage.finished_at ? '任务已完成' : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                    <span>生成模型</span>
                    <span className="font-mono text-foreground font-bold uppercase tracking-tighter">
                      MODEL #{selectedImage.model_id}
                    </span>
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
