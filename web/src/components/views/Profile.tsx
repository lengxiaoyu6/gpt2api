import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useStore } from '../../store/useStore';
import * as rechargeApi from '../../api/recharge';
import * as meApi from '../../api/me';
import ProfileCreditLogs from './ProfileCreditLogs';
import ProfileApiKeys from './ProfileApiKeys';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageShell from '@/components/PageShell';
import { formatCredit } from '@/lib/utils';
import {
  Coins,
  ChevronRight,
  Gift,
  CreditCard,
  Key,
  ShieldCheck,
  LogOut,
  Sparkles,
  Zap,
  Star,
  User,
} from 'lucide-react';

interface ProfileViewProps {
  siteName?: string;
}

type ProfileSection = 'profile' | 'creditLogs' | 'apiKeys';

export default function ProfileView({ siteName = 'GPT2API' }: ProfileViewProps) {
  const { user, history, checkin, submitCheckin, fetchMe, fetchHistory, logout, forceRelogin } = useStore();
  const [submitting, setSubmitting] = useState(false);
  const [membershipDialogOpen, setMembershipDialogOpen] = useState(false);
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false);
  const [securityDialogOpen, setSecurityDialogOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [activeSection, setActiveSection] = useState<ProfileSection>('profile');

  useEffect(() => {
    if (user) {
      void fetchHistory();
    }
  }, [fetchHistory, user]);

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

  const handleRedeemSubmit = async () => {
    const nextCode = redeemCode.trim();
    if (!nextCode) {
      toast.error('请输入兑换码');
      return;
    }

    setRedeeming(true);
    try {
      const result = await rechargeApi.redeemCode(nextCode);
      setRedeemCode('');
      await fetchMe();
      setRedeemDialogOpen(false);
      toast.success(`充值成功，到账 ${formatCredit(result.credits)} 积分，当前余额 ${formatCredit(result.balance_after)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '充值失败，请稍后重试');
    } finally {
      setRedeeming(false);
    }
  };

  const handlePasswordFieldChange = (field: 'old_password' | 'new_password' | 'confirm_password', value: string) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const handleChangePassword = async () => {
    if (!passwordForm.old_password) {
      toast.error('请输入原密码');
      return;
    }
    if (!passwordForm.new_password) {
      toast.error('请输入新密码');
      return;
    }
    if (passwordForm.new_password.length < 6) {
      toast.error('新密码至少 6 位');
      return;
    }
    if (!passwordForm.confirm_password) {
      toast.error('请再次输入新密码');
      return;
    }
    if (passwordForm.confirm_password !== passwordForm.new_password) {
      toast.error('两次输入的新密码不一致');
      return;
    }

    setPasswordSubmitting(true);
    try {
      await meApi.changeMyPassword({
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
      });
      setSecurityDialogOpen(false);
      setPasswordForm({
        old_password: '',
        new_password: '',
        confirm_password: '',
      });
      toast.success('密码修改成功，请重新登录');
      forceRelogin('profile');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '密码修改失败，请稍后重试');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const menuItems = [
    { label: '我的会员', icon: CreditCard, color: 'text-amber-500', bg: 'bg-amber-500/10', extra: '超值特惠', onClick: () => setMembershipDialogOpen(true) },
    { label: 'API Keys', icon: Key, color: 'text-sky-500', bg: 'bg-sky-500/10', onClick: () => setActiveSection('apiKeys') },
    { label: '充值积分', icon: Coins, color: 'text-indigo-500', bg: 'bg-indigo-500/10', onClick: () => setRedeemDialogOpen(true) },
    { label: '安全中心', icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10', onClick: () => setSecurityDialogOpen(true) },
  ];

  const formattedBalance = formatCredit(user.credit_balance);
  const formattedTodayReward = formatCredit(checkin?.today_reward_credits ?? 0);
  const footer = (
    <div className="mt-auto border-t border-border/20 pb-6 pt-4 text-center opacity-30">
      <div className="mb-2 flex items-center justify-center gap-2">
        <Sparkles className="w-3 h-3" />
        <p className="text-[10px] font-black tracking-[4px] uppercase">{siteName}</p>
        <Sparkles className="w-3 h-3" />
      </div>
      <p className="text-[8px] font-medium leading-relaxed">© {siteName}</p>
    </div>
  );

  return (
    <>
      {activeSection === 'creditLogs' ? (
        <PageShell className="flex min-h-full flex-1 flex-col">
          <div className="flex-1">
            <ProfileCreditLogs
              balance={user.credit_balance}
              onBack={() => setActiveSection('profile')}
            />
          </div>
          {footer}
        </PageShell>
      ) : activeSection === 'apiKeys' ? (
        <PageShell className="flex min-h-full flex-1 flex-col">
          <div className="flex-1">
            <ProfileApiKeys onBack={() => setActiveSection('profile')} />
          </div>
          {footer}
        </PageShell>
      ) : (
        <PageShell className="flex min-h-full flex-1 flex-col animate-in slide-in-from-bottom-10 duration-500">
          <div className="flex flex-1 flex-col gap-8 lg:gap-10">
            <div className="space-y-1">
              <h1 className="text-2xl font-black tracking-tight lg:text-3xl">个人中心</h1>
              <p className="text-xs font-medium text-muted-foreground lg:text-sm">查看积分余额、签到状态与账号设置</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start">
            <div className="space-y-6 lg:sticky lg:top-28">
              <section className="relative">
                <div className="absolute inset-0 -z-10 rounded-full bg-primary/20 blur-3xl" />
                <Card className="overflow-hidden rounded-[2rem] border-border/50 bg-card/60 shadow-2xl backdrop-blur-xl">
                  <CardContent className="p-6 lg:p-7">
                    <div className="flex items-center gap-4">
                      <Avatar
                        role="img"
                        aria-label="用户头像"
                        className="h-20 w-20 border-2 border-primary/20 bg-background p-1 ring-4 ring-primary/5 lg:h-24 lg:w-24"
                      >
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <User className="h-9 w-9" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <h2 className="truncate text-xl font-black tracking-tight lg:text-2xl">{user.nickname}</h2>
                        </div>
                        <p className="truncate text-xs font-medium text-muted-foreground">{user.email}</p>
                        <div className="flex flex-wrap items-center gap-3 pt-2">
                          <div className="flex items-center gap-1.5 rounded-lg bg-yellow-500/10 px-2 py-1 text-[10px] font-bold text-yellow-600">
                            <Coins className="h-3 w-3" />
                            <span>{formattedBalance} 积分</span>
                          </div>
                          <div className="flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-2 py-1 text-[10px] font-bold text-indigo-600">
                            <Star className="h-3 w-3" />
                            <span>{checkin?.checked_in ? '今日已签' : '待签到'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 grid grid-cols-2 gap-4">
                      <Button onClick={handleClaimPoints} disabled={!checkin?.enabled || checkin?.checked_in || submitting} className="h-12 rounded-2xl bg-primary font-bold shadow-lg shadow-primary/20 gap-2">
                        <Gift className="h-4 w-4" />
                        {checkinLabel}
                      </Button>
                      <Button variant="secondary" className="h-12 rounded-2xl font-bold gap-2">
                        <Zap className="h-4 w-4 text-indigo-500" />
                        我的创作 {history.length}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </section>

              <section className="grid grid-cols-2 gap-4">
                <div className="space-y-1 rounded-[1.75rem] bg-secondary/30 p-4 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">今日奖励</span>
                  <div className="flex items-baseline justify-center gap-0.5">
                    <span className="text-lg font-black">{formattedTodayReward}</span>
                    <span className="text-[10px] font-bold opacity-50">分</span>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="查看可用积分使用记录"
                  onClick={() => setActiveSection('creditLogs')}
                  className="space-y-1 rounded-[1.75rem] bg-secondary/30 p-4 text-center transition-colors hover:bg-secondary/50"
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">可用积分</span>
                  <div className="flex items-baseline justify-center gap-0.5">
                    <span className="text-lg font-black">{formattedBalance}</span>
                    <span className="text-[10px] font-bold opacity-50">点</span>
                  </div>
                </button>
              </section>
            </div>

              <div className="space-y-6">
              <section className="rounded-[2rem] border border-border/50 bg-secondary/20 p-2 shadow-sm">
                {menuItems.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={item.onClick}
                    className="group flex w-full items-center justify-between rounded-[1.5rem] p-4 transition-all hover:bg-background/80 lg:p-5"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.bg} ${item.color} shadow-sm transition-transform group-hover:scale-110`}>
                        <item.icon className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-bold lg:text-base">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.extra && <span className="text-[10px] font-bold text-primary animate-pulse">{item.extra}</span>}
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-20 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                    </div>
                  </button>
                ))}
              </section>

              <div className="flex flex-col gap-4 lg:hidden">
                <Button
                  variant="ghost"
                  onClick={() => {
                    logout();
                    toast.info('已安全退出账号');
                  }}
                  className="h-14 w-full rounded-2xl gap-2 text-destructive font-bold hover:bg-destructive/10 hover:text-destructive lg:hidden"
                >
                  <LogOut className="h-5 w-5" />
                  退出登录
                </Button>
              </div>

              </div>
            </div>
          </div>
          {footer}
        </PageShell>
      )}

      <Dialog open={membershipDialogOpen} onOpenChange={setMembershipDialogOpen}>
        <DialogContent className="max-w-sm rounded-[28px] border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur" showCloseButton={false}>
          <DialogHeader className="px-6 pt-6 text-center">
            <DialogTitle className="text-xl font-black tracking-tight">我的会员</DialogTitle>
            <DialogDescription className="pt-2 text-sm">
              敬请期待
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-2 rounded-b-[28px] border-border/60 bg-secondary/20 px-6 py-4">
            <Button className="h-11 w-full rounded-2xl" onClick={() => setMembershipDialogOpen(false)}>
              知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={redeemDialogOpen} onOpenChange={setRedeemDialogOpen}>
        <DialogContent className="max-w-md rounded-[28px] border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur" showCloseButton={false}>
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-xl font-black tracking-tight">充值积分</DialogTitle>
            <DialogDescription>
              输入兑换码后，积分会计入当前账号余额。
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 space-y-4">
            <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">当前余额</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-black text-primary">{formattedBalance}</span>
                <span className="text-xs font-bold text-muted-foreground">积分</span>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="profile-redeem-code" className="text-sm font-bold text-foreground">兑换码</label>
              <Input
                id="profile-redeem-code"
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value)}
                placeholder="请输入兑换码"
                className="h-12 rounded-2xl border-border/60 bg-secondary/20 px-4 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleRedeemSubmit();
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter className="mt-6 rounded-b-[28px] border-border/60 bg-secondary/20 px-6 py-4">
            <Button variant="outline" className="h-11 rounded-2xl" onClick={() => setRedeemDialogOpen(false)}>
              取消
            </Button>
            <Button className="h-11 rounded-2xl" disabled={redeeming} onClick={() => void handleRedeemSubmit()}>
              {redeeming ? '充值中...' : '立即充值'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={securityDialogOpen} onOpenChange={setSecurityDialogOpen}>
        <DialogContent className="max-w-md rounded-[28px] border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur" showCloseButton={false}>
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-xl font-black tracking-tight">修改密码</DialogTitle>
            <DialogDescription>
              修改账号登录密码后，当前登录态会立即清理。
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="profile-old-password" className="text-sm font-bold text-foreground">原密码</label>
              <Input
                id="profile-old-password"
                type="password"
                value={passwordForm.old_password}
                onChange={(e) => handlePasswordFieldChange('old_password', e.target.value)}
                placeholder="请输入原密码"
                className="h-12 rounded-2xl border-border/60 bg-secondary/20 px-4 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="profile-new-password" className="text-sm font-bold text-foreground">新密码</label>
              <Input
                id="profile-new-password"
                type="password"
                value={passwordForm.new_password}
                onChange={(e) => handlePasswordFieldChange('new_password', e.target.value)}
                placeholder="请输入新密码"
                className="h-12 rounded-2xl border-border/60 bg-secondary/20 px-4 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="profile-confirm-password" className="text-sm font-bold text-foreground">确认新密码</label>
              <Input
                id="profile-confirm-password"
                type="password"
                value={passwordForm.confirm_password}
                onChange={(e) => handlePasswordFieldChange('confirm_password', e.target.value)}
                placeholder="请再次输入新密码"
                className="h-12 rounded-2xl border-border/60 bg-secondary/20 px-4 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleChangePassword();
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter className="mt-6 rounded-b-[28px] border-border/60 bg-secondary/20 px-6 py-4">
            <Button variant="outline" className="h-11 rounded-2xl" onClick={() => setSecurityDialogOpen(false)}>
              取消
            </Button>
            <Button className="h-11 rounded-2xl" disabled={passwordSubmitting} onClick={() => void handleChangePassword()}>
              {passwordSubmitting ? '提交中...' : '确认修改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
