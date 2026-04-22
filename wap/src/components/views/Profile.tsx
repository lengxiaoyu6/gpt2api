import React, { useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useStore } from '../../store/useStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatCredit } from '@/lib/utils';
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
} from 'lucide-react';

export default function ProfileView() {
  const { user, history, checkin, submitCheckin, logout } = useStore();
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const handleClaimPoints = async () => {
    if (!checkin?.enabled || checkin.checked_in || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitCheckin();
      const credits = result.awarded_credits || result.today_reward_credits;
      toast.success(`签到成功，领取 ${formatCredit(credits)} 积分`, {
        icon: <Star className="w-4 h-4 text-yellow-500 fill-current" />,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '签到失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const checkinLabel = !checkin?.enabled
    ? '签到已关闭'
    : checkin.checked_in
      ? '今日已领取'
      : submitting
        ? '领取中...'
        : '每日签到';

  const menuItems = [
    { label: '我的会员', icon: CreditCard, color: 'text-amber-500', bg: 'bg-amber-500/10', extra: '超值特惠' },
    { label: '积分中心', icon: Coins, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { label: '安全中心', icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: '帮助与反馈', icon: HelpCircle, color: 'text-sky-500', bg: 'bg-sky-500/10' },
  ];

  const initials = user.nickname?.slice(0, 1) || 'U';
  const formattedBalance = formatCredit(user.credit_balance);
  const formattedTodayReward = formatCredit(checkin?.today_reward_credits ?? 0);

  return (
    <div className="px-4 py-8 space-y-8 animate-in slide-in-from-bottom-10 duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">个人中心</h1>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Settings className="w-5 h-5" />
        </Button>
      </div>

      <section className="relative">
        <div className="absolute inset-0 bg-primary/20 blur-3xl -z-10 rounded-full" />
        <Card className="border-border/50 bg-card/60 backdrop-blur-xl rounded-[32px] overflow-hidden shadow-2xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Avatar className="w-20 h-20 border-2 border-primary/20 p-1 bg-background ring-4 ring-primary/5">
                <AvatarImage src="" />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black tracking-tight">{user.nickname}</h2>
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-bold text-[10px] px-2 py-0">{user.role.toUpperCase()}</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-medium">{user.email}</p>
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-yellow-500/10 text-yellow-600 text-[10px] font-bold">
                    <Coins className="w-3 h-3" />
                    <span>{formattedBalance} 积分</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 text-[10px] font-bold">
                    <Star className="w-3 h-3" />
                    <span>{checkin?.checked_in ? '今日已签' : '待签到'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-8">
              <Button onClick={handleClaimPoints} disabled={!checkin?.enabled || checkin?.checked_in || submitting} className="rounded-2xl h-12 font-bold bg-primary shadow-lg shadow-primary/20 gap-2">
                <Gift className="w-4 h-4" />
                {checkinLabel}
              </Button>
              <Button variant="secondary" className="rounded-2xl h-12 font-bold gap-2">
                <Zap className="w-4 h-4 text-indigo-500" />
                我的创作 {history.length}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-3 gap-4">
        {[
          { label: '我的创作', count: String(history.length), unit: '幅' },
          { label: '今日奖励', count: formattedTodayReward, unit: '分' },
          { label: '可用积分', count: formattedBalance, unit: '点' },
        ].map((stat, i) => (
          <div key={i} className="bg-secondary/30 rounded-2xl p-4 text-center space-y-1">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{stat.label}</span>
            <div className="flex items-baseline justify-center gap-0.5">
              <span className="text-lg font-black">{stat.count}</span>
              <span className="text-[10px] opacity-50 font-bold">{stat.unit}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="bg-secondary/20 rounded-3xl p-2 space-y-1 border border-border/50">
        {menuItems.map((item, i) => (
          <button
            key={i}
            className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-background/80 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center ${item.color} shadow-sm transition-transform group-hover:scale-110`}>
                <item.icon className="w-5 h-5" />
              </div>
              <span className="font-bold text-sm">{item.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {item.extra && <span className="text-[10px] font-bold text-primary animate-pulse">{item.extra}</span>}
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          </button>
        ))}
      </section>

      <div className="pt-4">
        <Button
          variant="ghost"
          onClick={() => {
            logout();
            toast.info('已安全退出账号');
          }}
          className="w-full h-14 rounded-2xl text-destructive hover:text-destructive hover:bg-destructive/10 font-bold gap-2"
        >
          <LogOut className="w-5 h-5" />
          退出登录
        </Button>
      </div>

      <div className="text-center opacity-30 pb-12">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="w-3 h-3" />
          <p className="text-[10px] font-black tracking-[4px] uppercase">GPT2API</p>
          <Sparkles className="w-3 h-3" />
        </div>
        <p className="text-[8px] font-medium leading-relaxed">
          Version 2.4.0 (Build 9423)<br />
          © 2026 Creative Intelligent Systems. All rights reserved.
        </p>
      </div>
    </div>
  );
}
