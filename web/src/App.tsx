import React, { useEffect, useLayoutEffect } from 'react';
import { Home as HomeIcon, Wand2, History as HistoryIcon, User as UserIcon, LogIn, LogOut, Sparkles, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast, Toaster } from 'sonner';
import { useStore, type TabKey } from './store/useStore';

import HomeView from './components/views/Home';
import GenerateView from './components/views/Generate';
import HistoryView from './components/views/History';
import ProfileView from './components/views/Profile';
import AuthOverlay from './components/AuthOverlay';
import AnnouncementCenter from './components/AnnouncementCenter';

import { Button } from '@/components/ui/button';
import { cn, formatCredit } from '@/lib/utils';

const TAB_META: Record<TabKey, { title: string; description: string }> = {
  home: {
    title: '首页',
    description: '浏览当前站点的能力入口与最新通知。',
  },
  generate: {
    title: '创意实验室',
    description: '在桌面工作台中调整参数并查看结果。',
  },
  history: {
    title: '时间轴',
    description: '回看生成任务、下载原图并检查任务状态。',
  },
  profile: {
    title: '账户概览',
    description: '查看积分余额、签到状态与账号设置。',
  },
};

const resetDocumentScroll = () => {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
};

export default function App() {
  const {
    user,
    isDark,
    siteInfo,
    bootstrapApp,
    authOverlayOpen,
    closeAuth,
    activeTab,
    setActiveTab,
    openAuthForTab,
    logout,
  } = useStore();

  useEffect(() => {
    void bootstrapApp();
  }, [bootstrapApp]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useLayoutEffect(() => {
    resetDocumentScroll();
  }, [activeTab]);

  const handleTabChange = (tab: TabKey) => {
    if ((tab === 'generate' || tab === 'history' || tab === 'profile') && !user) {
      openAuthForTab(tab);
      return;
    }
    setActiveTab(tab);
  };

  const navItems: ReadonlyArray<{ id: TabKey; icon: React.ComponentType<{ className?: string }>; label: string }> = [
    { id: 'home', icon: HomeIcon, label: '首页' },
    { id: 'generate', icon: Wand2, label: '生图' },
    { id: 'history', icon: HistoryIcon, label: '记录' },
    { id: 'profile', icon: UserIcon, label: '我的' },
  ];

  const siteName = siteInfo['site.name'] || 'OAI Hub';
  const activeTabMeta = TAB_META[activeTab];

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 font-sans selection:bg-primary/30 lg:flex lg:flex-row">
      <Toaster position="top-center" richColors />

      <aside className="hidden border-r border-border/50 bg-card/55 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:flex-col lg:justify-between">
        <div className="space-y-8 px-5 py-6">
          <div className="flex items-center gap-3 rounded-3xl border border-border/50 bg-background/65 px-4 py-4 shadow-sm shadow-black/5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="truncate text-base font-black tracking-tight">{siteName} 工作台</div>
              <div className="text-xs text-muted-foreground">AI 图像生成与历史管理终端</div>
            </div>
          </div>

          <nav aria-label="桌面侧边导航" className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`前往${item.label}`}
                  onClick={() => handleTabChange(item.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-300',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                      : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
                  )}
                >
                  <Icon className={cn('h-5 w-5 shrink-0', isActive ? 'stroke-[2.5px]' : 'stroke-[1.75px]')} />
                  <span className="font-bold text-sm tracking-tight">{item.label}</span>
                  {isActive ? <span className="ml-auto h-2.5 w-2.5 rounded-full bg-white/95 shadow-sm" /> : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-border/50 px-5 py-6">
          {user ? (
            <div className="space-y-3">
              <div className="rounded-[1.75rem] border border-border/60 bg-background/70 p-4 shadow-sm shadow-black/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                    <UserIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="truncate text-sm font-bold">{user.nickname}</div>
                    <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-secondary/60 px-3 py-2 text-sm font-semibold">
                  <Coins className="h-4 w-4 text-yellow-500" />
                  <span>{formatCredit(user.credit_balance)} 积分</span>
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  logout();
                  toast.info('已安全退出账号');
                }}
                className="h-12 w-full rounded-2xl gap-2 text-destructive font-bold hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </Button>
            </div>
          ) : (
            <Button onClick={() => openAuthForTab(activeTab)} className="h-12 w-full rounded-2xl gap-2 font-bold shadow-lg shadow-primary/20">
              <LogIn className="h-4 w-4" />
              登录
            </Button>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between overflow-hidden border-b border-border/50 bg-background/80 px-3 backdrop-blur-xl sm:px-4 lg:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="min-w-0 truncate text-base font-bold tracking-tight sm:text-lg">{siteName}</span>
          </div>

          <div className="ml-2 flex shrink-0 items-center gap-1.5 sm:gap-2">
            <AnnouncementCenter active={activeTab === 'home'} />
            {user ? (
              <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/50 bg-secondary/50 px-2.5 py-1.5 sm:gap-2 sm:px-3">
                <Coins className="h-4 w-4 shrink-0 text-yellow-500" />
                <span className="whitespace-nowrap font-mono text-xs font-semibold sm:text-sm sm:font-medium">{formatCredit(user.credit_balance)} 积分</span>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => openAuthForTab(activeTab)} className="gap-2">
                <LogIn className="h-4 w-4" />
                登录
              </Button>
            )}
          </div>
        </header>

        <div className="hidden px-6 pt-6 lg:block xl:px-8">
          <section
            aria-label="桌面信息栏"
            className="mx-auto flex w-full max-w-[88rem] items-center justify-between gap-4 rounded-[2rem] border border-border/60 bg-card/65 px-5 py-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.5)] backdrop-blur-xl"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">站点概览 · {siteName}</div>
              <div className="mt-1 text-xl font-black tracking-tight">{activeTabMeta.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{activeTabMeta.description}</p>
            </div>

            <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
              <AnnouncementCenter active={activeTab === 'home'} />
              {user ? (
                <div
                  aria-label="当前积分"
                  className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border/60 bg-background/70 px-4 shadow-sm shadow-black/5"
                >
                  <Coins className="h-4 w-4 shrink-0 text-yellow-500" />
                  <span className="whitespace-nowrap font-mono text-sm font-semibold">{formatCredit(user.credit_balance)} 积分</span>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => openAuthForTab(activeTab)} className="h-12 rounded-2xl gap-2 px-5 font-bold">
                  <LogIn className="h-4 w-4" />
                  登录账号
                </Button>
              )}
            </div>
          </section>
        </div>

        <main className="flex flex-1 flex-col pt-16 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:px-6 lg:pt-0 lg:pb-10 xl:px-8">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn('w-full', activeTab === 'profile' && 'flex flex-1 flex-col')}
          >
            {activeTab === 'home' && <HomeView siteName={siteName} onStartGeneration={() => handleTabChange('generate')} />}
            {activeTab === 'generate' && <GenerateView />}
            {activeTab === 'history' && <HistoryView />}
            {activeTab === 'profile' && <ProfileView siteName={siteName} />}
          </motion.div>
        </main>
      </div>

      <nav aria-label="移动底部导航" className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/80 pb-safe backdrop-blur-2xl lg:hidden">
        <div className="mx-auto flex h-16 max-w-lg items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabChange(item.id)}
                className={cn(
                  'flex h-full w-full flex-col items-center justify-center gap-1 transition-all duration-300',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <div
                  className={cn(
                    'rounded-xl p-1.5 transition-all duration-300',
                    isActive ? 'bg-primary/10 shadow-sm' : '',
                  )}
                >
                  <Icon className={cn('h-6 w-6', isActive ? 'stroke-[2.5px]' : 'stroke-[1.5px]')} />
                </div>
                <span className="text-[10px] font-medium transition-opacity">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <AnimatePresence>
        {authOverlayOpen && <AuthOverlay onClose={closeAuth} />}
      </AnimatePresence>

      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-20 dark:opacity-40">
        <div className="absolute left-[-10%] top-[-10%] h-[50%] w-[50%] rounded-full bg-primary/30 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full bg-blue-500/20 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>
    </div>
  );
}
