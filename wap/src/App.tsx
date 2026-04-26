import React, { useEffect } from 'react';
import { Home as HomeIcon, Wand2, History as HistoryIcon, User as UserIcon, LogIn, Sparkles, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster } from 'sonner';
import { useStore, type TabKey } from './store/useStore';

import HomeView from './components/views/Home';
import GenerateView from './components/views/Generate';
import HistoryView from './components/views/History';
import ProfileView from './components/views/Profile';
import AuthOverlay from './components/AuthOverlay';
import AnnouncementCenter from './components/AnnouncementCenter';

import { Button } from '@/components/ui/button';
import { cn, formatCredit } from '@/lib/utils';

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

  const siteName = siteInfo['site.name'] || 'GPT2API';

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300 font-sans selection:bg-primary/30">
      <Toaster position="top-center" richColors />

      <header className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">{siteName}</span>
        </div>

        <div className="flex items-center gap-2">
          <AnnouncementCenter active={activeTab === 'home'} />
          {user ? (
            <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-full border border-border/50">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="font-mono text-sm font-medium">{formatCredit(user.credit_balance)}</span>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => openAuthForTab(activeTab)} className="gap-2">
              <LogIn className="w-4 h-4" />
              登录
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 pt-16 pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {activeTab === 'home' && <HomeView siteName={siteName} onStartGeneration={() => handleTabChange('generate')} />}
            {activeTab === 'generate' && <GenerateView />}
            {activeTab === 'history' && <HistoryView />}
            {activeTab === 'profile' && <ProfileView siteName={siteName} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-2xl border-t border-border/50 pb-safe">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-300',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <div
                  className={cn(
                    'p-1.5 rounded-xl transition-all duration-300',
                    isActive ? 'bg-primary/10 shadow-sm' : '',
                  )}
                >
                  <Icon className={cn('w-6 h-6', isActive ? 'stroke-[2.5px]' : 'stroke-[1.5px]')} />
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

      <div className="fixed inset-0 -z-10 pointer-events-none opacity-20 dark:opacity-40 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/30 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/20 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>
    </div>
  );
}
