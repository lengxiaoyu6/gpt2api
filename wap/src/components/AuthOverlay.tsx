import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Sparkles, User, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

interface AuthOverlayProps {
  onClose: () => void;
}

function allowRegister(siteInfo: Record<string, string>) {
  const value = (siteInfo['auth.allow_register'] || '').toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

export default function AuthOverlay({ onClose }: AuthOverlayProps) {
  const { login, register, siteInfo } = useStore();
  const [isLogin, setIsLogin] = useState(true);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canRegister = allowRegister(siteInfo);
  const siteName = siteInfo['site.name'] || 'GPT2API';

  useEffect(() => {
    if (!canRegister && !isLogin) {
      setIsLogin(true);
    }
  }, [canRegister, isLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextEmail = email.trim();
    const nextPassword = password.trim();
    const nextNickname = nickname.trim();

    if (!nextEmail || !nextPassword) {
      toast.error('请填写邮箱和密码');
      return;
    }

    if (!isLogin && !nextNickname) {
      toast.error('请填写昵称');
      return;
    }

    setSubmitting(true);
    try {
      if (isLogin) {
        await login({ email: nextEmail, password: nextPassword });
        toast.success('登录成功');
      } else {
        await register({ nickname: nextNickname, email: nextEmail, password: nextPassword });
        toast.success('注册成功');
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="w-full max-w-sm relative"
      >
        <Card className="border-border/50 bg-card/95 shadow-2xl overflow-hidden">
          <div className="absolute top-4 right-4">
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <CardHeader className="text-center pt-8">
            <div className="w-12 h-12 rounded-2xl bg-primary mx-auto flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              {isLogin ? '欢迎回来' : '创建账号'}
            </CardTitle>
            <CardDescription>
              {isLogin ? `登录后继续使用 ${siteName}` : `注册 ${siteName} 账号，立即开始创作`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-gap-4 flex flex-col gap-4">
              {!isLogin && (
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="昵称"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="pl-10"
                  />
                </div>
              )}
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="电子邮箱"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full h-12 mt-2 font-bold text-lg shadow-lg shadow-primary/20">
                {isLogin ? '立即登录' : '立即注册'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pb-8 border-t border-border/50 pt-6">
            {canRegister ? (
              <p className="text-sm text-muted-foreground">
                {isLogin ? '没有账号？' : '已有账号？'}
                <button
                  type="button"
                  onClick={() => setIsLogin((prev) => !prev)}
                  className="text-primary font-bold ml-1 hover:underline outline-none"
                >
                  {isLogin ? '立即注册' : '返回登录'}
                </button>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">当前站点暂未开放注册</p>
            )}
            <p className="text-[10px] text-muted-foreground/60 px-4 text-center">
              登录即代表您同意《服务协议》和《隐私政策》
            </p>
          </CardFooter>
        </Card>
      </motion.div>
    </motion.div>
  );
}
