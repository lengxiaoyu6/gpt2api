import React from 'react';
import { motion } from 'motion/react';
import { useStore } from '../../store/useStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, 
  Coins, 
  ChevronRight, 
  Gift, 
  CreditCard, 
  ShieldCheck, 
  HelpCircle, 
  LogOut,
  Sparkles,
  Zap,
  Star,
  Wand2
} from 'lucide-react';
import { toast } from 'sonner';

export default function ProfileView() {
  const { user, logout, addPoints, isDark, toggleTheme } = useStore();

  if (!user) return null;

  const handleClaimPoints = () => {
    addPoints(50);
    toast.success('签到成功，领取 50 积分！', {
      icon: <Star className="w-4 h-4 text-yellow-500 fill-current" />
    });
  };

  const menuItems = [
    { label: '我的会员', icon: CreditCard, color: 'text-amber-500', bg: 'bg-amber-500/10', extra: '超值特惠' },
    { label: '积分中心', icon: Coins, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { label: '安全中心', icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: '帮助与反馈', icon: HelpCircle, color: 'text-sky-500', bg: 'bg-sky-500/10' },
  ];

  return (
    <div className="px-4 py-6 lg:py-0 space-y-12 animate-in slide-in-from-bottom-10 duration-500 max-w-6xl mx-auto">
      {/* Header & User Card */}
      <section className="relative">
        <div className="absolute inset-0 bg-primary/10 blur-[120px] -z-10 rounded-full opacity-50" />
        <Card className="border-border/50 bg-card/40 backdrop-blur-xl rounded-[40px] overflow-hidden shadow-2xl">
          <CardContent className="p-8 lg:p-12">
            <div className="flex flex-col md:flex-row items-center gap-8 lg:gap-12">
              <div className="relative group">
                <Avatar className="w-32 h-32 lg:w-40 lg:h-40 border-4 border-primary/20 p-1.5 bg-background ring-8 ring-primary/5 shadow-2xl transition-transform duration-500 group-hover:scale-105">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback>{user.username[0]}</AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/30 border-2 border-background">
                  <Star className="w-5 h-5 fill-current" />
                </div>
              </div>

              <div className="text-center md:text-left space-y-4 flex-1">
                <div className="space-y-1">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <h2 className="text-3xl lg:text-4xl font-black tracking-tight">{user.username}</h2>
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-black text-xs px-3 py-1 uppercase tracking-widest w-fit mx-auto md:mx-0">Premium Creator</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">{user.email}</p>
                </div>
                
                <div className="flex flex-wrap justify-center md:justify-start gap-3">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-yellow-500/10 text-yellow-600 text-sm font-black border border-yellow-500/20">
                    <Coins className="w-4 h-4" />
                    <span>{user.points} 积分可用</span>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-indigo-500/10 text-indigo-600 text-sm font-black border border-indigo-500/20">
                    <Sparkles className="w-4 h-4" />
                    <span>Lv.4 等级</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  <Button onClick={handleClaimPoints} className="rounded-2xl h-12 font-black bg-primary text-primary-foreground shadow-lg shadow-primary/20 gap-2 border-none">
                    <Gift className="w-4 h-4" />
                    每日签到
                  </Button>
                  <Button variant="secondary" className="rounded-2xl h-12 font-black gap-2 border border-border/50">
                    <Zap className="w-4 h-4 text-indigo-500" />
                    加速包
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Stats & Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Stats */}
        <section className="lg:col-span-1 space-y-6">
          <h3 className="font-black text-xs uppercase tracking-[4px] text-muted-foreground pl-2">视觉成就</h3>
          <div className="grid grid-cols-1 gap-4">
            {[
              { label: '我的创作', count: '128', unit: 'NFT 画作', icon: Wand2, color: 'bg-indigo-500' },
              { label: '累计点赞', count: '5.2k', unit: '次交互', icon: Sparkles, color: 'bg-pink-500' },
              { label: '分享画卷', count: '12', unit: '组作品', icon: CreditCard, color: 'bg-amber-500' },
            ].map((stat, i) => (
              <div key={i} className="bg-secondary/20 p-6 rounded-[32px] border border-border/50 flex items-center gap-6 group hover:bg-secondary/40 transition-colors">
                <div className={`w-12 h-12 rounded-2xl ${stat.color} flex items-center justify-center text-white shadow-lg`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">{stat.label}</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black tracking-tight">{stat.count}</span>
                    <span className="text-[10px] opacity-40 font-bold">{stat.unit}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Dynamic Menu & Appearance */}
        <section className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between pl-2">
            <h3 className="font-black text-xs uppercase tracking-[4px] text-muted-foreground">核心设置</h3>
            <button 
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-[10px] font-black uppercase tracking-wider hover:bg-primary hover:text-white transition-colors"
            >
              {isDark ? 'Light' : 'Dark'} Mode
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {menuItems.map((item, i) => (
              <button
                key={i}
                className="flex items-center justify-between p-6 rounded-[32px] bg-secondary/20 border border-border/50 hover:bg-background/80 transition-all hover:scale-[1.02] active:scale-95 group shadow-sm"
              >
                <div className="flex items-center gap-5">
                  <div className={`w-12 h-12 rounded-2xl ${item.bg} flex items-center justify-center ${item.color} shadow-sm group-hover:scale-110 transition-transform`}>
                    <item.icon className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <span className="font-black text-sm block">{item.label}</span>
                    {item.extra && <span className="text-[10px] font-bold text-primary animate-pulse uppercase tracking-wider">{item.extra}</span>}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </button>
            ))}
          </div>

          <div className="pt-4 flex gap-4">
            <Button 
              variant="outline" 
              className="flex-1 h-14 rounded-3xl border-border/50 hover:bg-secondary font-black gap-3"
            >
              <Settings className="w-5 h-5" />
              全局设置
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => {
                logout();
                toast.info('已安全退出账号');
              }}
              className="flex-1 h-14 rounded-3xl text-destructive hover:text-white hover:bg-destructive font-black gap-3 border border-destructive/20"
            >
              <LogOut className="w-5 h-5" />
              退出登录
            </Button>
          </div>
        </section>
      </div>

      {/* Footer Branding */}
      <div className="text-center py-12 opacity-30 border-t border-border/10">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Sparkles className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
          <p className="text-xs lg:text-sm font-black tracking-[8px] lg:tracking-[12px] uppercase">ImagineAI Personal Terminal</p>
          <Sparkles className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
        </div>
        <p className="text-[9px] lg:text-[10px] font-medium leading-relaxed max-w-md mx-auto">
          Node ID: AIS-9423 • Encryption Verified • Creative Intelligent Systems v2.4.1<br />
          © 2026 Powered by Gemini 3.1 & Advanced Design Architecture
        </p>
      </div>
    </div>
  );
}
