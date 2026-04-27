import React, { useState, useEffect } from 'react';
import { Home as HomeIcon, Wand2, History as HistoryIcon, User as UserIcon, LogIn, Sparkles, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from './store/useStore';
import { Toaster } from 'sonner';
import { toast } from 'sonner';

// Views
import HomeView from './components/views/Home';
import GenerateView from './components/views/Generate';
import HistoryView from './components/views/History';
import ProfileView from './components/views/Profile';
import AuthOverlay from './components/AuthOverlay';

// UI Components
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function App() {
  const { user, isDark } = useStore();
  const [activeTab, setActiveTab] = useState<'home' | 'generate' | 'history' | 'profile'>('home');
  const [showAuth, setShowAuth] = useState(false);

  // Initialize theme
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const handleTabChange = (tab: typeof activeTab) => {
    if ((tab === 'generate' || tab === 'history' || tab === 'profile') && !user) {
      setShowAuth(true);
      return;
    }
    setActiveTab(tab);
  };

  const navItems = [
    { id: 'home', icon: HomeIcon, label: '首页' },
    { id: 'generate', icon: Wand2, label: '生成实验室' },
    { id: 'history', icon: HistoryIcon, label: '创作记录' },
    { id: 'profile', icon: UserIcon, label: '个人中心' },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 font-sans selection:bg-primary/30 flex lg:flex-row flex-col">
      <Toaster position="top-center" richColors />
      
      {/* Sidebar for Desktop */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border/50 bg-card/50 backdrop-blur-xl h-screen sticky top-0 z-50">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Sparkles className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="font-black text-xl tracking-tight">ImagineAI</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive ? "stroke-[2.5px]" : "stroke-[1.5px] group-hover:scale-110 transition-transform")} />
                <span className="font-bold text-sm tracking-tight">{item.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="active-indicator" 
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-sm"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-6 border-t border-border/50">
          {user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-2xl border border-border/50">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 border border-primary/20">
                  <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="font-bold text-sm truncate">{user.username}</p>
                  <div className="flex items-center gap-1.5 text-xs text-yellow-600 font-bold">
                    <Coins className="w-3 h-3" />
                    <span>{user.points}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowAuth(true)} className="w-full h-12 rounded-2xl font-bold shadow-lg shadow-primary/20 gap-2">
              <LogIn className="w-4 h-4" />
              立刻登录
            </Button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">ImagineAI</span>
          </div>
          
          {user ? (
            <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-full border border-border/50">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="font-mono text-sm font-medium">{user.points}</span>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setShowAuth(true)} className="gap-2 text-xs font-bold">
              <LogIn className="w-4 h-4" />
              登录
            </Button>
          )}
        </header>

        {/* Content */}
        <main className={cn(
          "flex-1 w-full max-w-7xl mx-auto xl:px-8",
          activeTab === 'home' ? "" : "lg:pt-12 pt-16 pb-24 lg:pb-12"
        )}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full"
            >
              {activeTab === 'home' && <HomeView onStartGeneration={() => handleTabChange('generate')} />}
              {activeTab === 'generate' && <GenerateView />}
              {activeTab === 'history' && <HistoryView />}
              {activeTab === 'profile' && <ProfileView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-2xl border-t border-border/50 pb-safe">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-300",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className={cn(
                  "p-1.5 rounded-xl transition-all duration-300",
                  isActive ? "bg-primary/10 shadow-sm" : ""
                )}>
                  <Icon className={cn("w-6 h-6", isActive ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
                </div>
                <span className="text-[10px] font-medium transition-opacity">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Auth Modal Overlay */}
      <AnimatePresence>
        {showAuth && (
          <AuthOverlay onClose={() => setShowAuth(false)} />
        )}
      </AnimatePresence>

      {/* Background Decor */}
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-20 dark:opacity-30 overflow-hidden">
        <div className="absolute top-[-5%] left-[-5%] w-[40%] h-[40%] bg-primary/20 blur-[100px] rounded-full animate-pulse" />
        <div className="absolute top-[20%] right-[-5%] w-[30%] h-[30%] bg-blue-500/10 blur-[100px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-[10%] left-[20%] w-[25%] h-[25%] bg-purple-500/10 blur-[100px] rounded-full animate-pulse" style={{ animationDelay: '4s' }} />
      </div>
    </div>
  );
}
