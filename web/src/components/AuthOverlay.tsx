import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Sparkles, User, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { sendRegisterEmailCode } from '../api/auth';
import { ApiError } from '../api/http';
import { allowRegister, requireEmailVerify, useStore } from '../store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

interface AuthOverlayProps {
  onClose: () => void;
}

const registerEmailCodeStorageKey = 'gpt2api.register.email_code';

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function readRetryAfterSec(error: unknown) {
  if (error instanceof ApiError) {
    const data = error.data as { retry_after_sec?: number } | undefined;
    return Number(data?.retry_after_sec || 0);
  }
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { retry_after_sec?: number } }).data;
    return Number(data?.retry_after_sec || 0);
  }
  return 0;
}

export default function AuthOverlay({ onClose }: AuthOverlayProps) {
  const { login, register, siteInfo } = useStore();
  const [isLogin, setIsLogin] = useState(true);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingEmailCode, setSendingEmailCode] = useState(false);
  const [countdownSec, setCountdownSec] = useState(0);

  const countdownTimerRef = useRef<number | null>(null);

  const canRegister = allowRegister(siteInfo);
  const needsEmailVerify = requireEmailVerify(siteInfo);
  const siteName = siteInfo['site.name'] || 'GPT2API';
  const showEmailCodeField = !isLogin && needsEmailVerify;
  const emailCodeButtonDisabled = sendingEmailCode || countdownSec > 0;
  const emailCodeButtonText = countdownSec > 0
    ? `${countdownSec}s 后重发`
    : sendingEmailCode
      ? '发送中…'
      : '发送验证码';

  const stopCountdown = React.useCallback(() => {
    if (countdownTimerRef.current != null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const persistEmailCodeCountdown = React.useCallback((expireAt: number, nextEmail: string) => {
    if (expireAt <= Date.now()) {
      sessionStorage.removeItem(registerEmailCodeStorageKey);
      return;
    }
    sessionStorage.setItem(registerEmailCodeStorageKey, JSON.stringify({
      email: normalizeEmail(nextEmail),
      expire_at: expireAt,
    }));
  }, []);

  const syncCountdown = React.useCallback((expireAt: number, nextEmail: string) => {
    const next = Math.max(0, Math.ceil((expireAt - Date.now()) / 1000));
    setCountdownSec(next);
    if (next > 0) {
      persistEmailCodeCountdown(expireAt, nextEmail);
      return;
    }
    stopCountdown();
    sessionStorage.removeItem(registerEmailCodeStorageKey);
  }, [persistEmailCodeCountdown, stopCountdown]);

  const startCountdown = React.useCallback((expireAt: number, nextEmail: string) => {
    stopCountdown();
    syncCountdown(expireAt, nextEmail);
    if (expireAt <= Date.now()) {
      return;
    }
    countdownTimerRef.current = window.setInterval(() => {
      syncCountdown(expireAt, nextEmail);
    }, 1000);
  }, [stopCountdown, syncCountdown]);

  const resetEmailCodeState = React.useCallback(() => {
    stopCountdown();
    setCountdownSec(0);
    setEmailCode('');
    sessionStorage.removeItem(registerEmailCodeStorageKey);
  }, [stopCountdown]);

  const restoreEmailCodeState = React.useCallback(() => {
    const raw = sessionStorage.getItem(registerEmailCodeStorageKey);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { email?: string; expire_at?: number };
      const savedEmail = normalizeEmail(String(parsed.email || ''));
      const expireAt = Number(parsed.expire_at || 0);
      if (!savedEmail || expireAt <= Date.now()) {
        sessionStorage.removeItem(registerEmailCodeStorageKey);
        return;
      }
      const currentEmail = normalizeEmail(email);
      if (currentEmail && currentEmail !== savedEmail) {
        sessionStorage.removeItem(registerEmailCodeStorageKey);
        return;
      }
      if (!currentEmail) {
        setEmail(savedEmail);
      }
      startCountdown(expireAt, savedEmail);
    } catch {
      sessionStorage.removeItem(registerEmailCodeStorageKey);
    }
  }, [email, startCountdown]);

  const handleEmailChange = (nextValue: string) => {
    if (normalizeEmail(nextValue) !== normalizeEmail(email)) {
      resetEmailCodeState();
    }
    setEmail(nextValue);
  };

  useEffect(() => {
    if (!canRegister && !isLogin) {
      setIsLogin(true);
    }
  }, [canRegister, isLogin]);

  useEffect(() => {
    restoreEmailCodeState();
    return () => {
      stopCountdown();
    };
  }, [restoreEmailCodeState, stopCountdown]);

  useEffect(() => {
    if (needsEmailVerify) {
      return;
    }
    resetEmailCodeState();
  }, [needsEmailVerify, resetEmailCodeState]);

  const sendEmailCode = async () => {
    if (!showEmailCodeField || emailCodeButtonDisabled) {
      return;
    }

    const nextEmail = email.trim();
    if (!nextEmail) {
      toast.error('请填写邮箱');
      return;
    }

    setSendingEmailCode(true);
    try {
      const result = await sendRegisterEmailCode({ email: nextEmail });
      const retryAfterSec = Number(result.retry_after_sec || 0);
      if (retryAfterSec > 0) {
        startCountdown(Date.now() + retryAfterSec * 1000, nextEmail);
      }
      toast.success('验证码已发送，请查收邮箱');
    } catch (error) {
      const retryAfterSec = readRetryAfterSec(error);
      if (retryAfterSec > 0) {
        startCountdown(Date.now() + retryAfterSec * 1000, nextEmail);
      }
      toast.error(error instanceof Error ? error.message : '验证码发送失败，请稍后重试');
    } finally {
      setSendingEmailCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextEmail = email.trim();
    const nextPassword = password.trim();
    const nextNickname = nickname.trim();
    const nextEmailCode = emailCode.trim();

    if (!nextEmail || !nextPassword) {
      toast.error('请填写邮箱和密码');
      return;
    }

    if (!isLogin && !nextNickname) {
      toast.error('请填写昵称');
      return;
    }

    if (!isLogin && needsEmailVerify && !nextEmailCode) {
      toast.error('请填写邮箱验证码');
      return;
    }

    setSubmitting(true);
    try {
      if (isLogin) {
        await login({ email: nextEmail, password: nextPassword });
        toast.success('登录成功');
      } else {
        await register({
          nickname: nextNickname,
          email: nextEmail,
          password: nextPassword,
          email_code: nextEmailCode || undefined,
        });
        resetEmailCodeState();
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
                  onChange={(e) => handleEmailChange(e.target.value)}
                  className="pl-10"
                />
              </div>
              {showEmailCodeField && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="邮箱验证码"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value)}
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={emailCodeButtonDisabled}
                      onClick={sendEmailCode}
                      className="shrink-0 min-w-[112px]"
                    >
                      {emailCodeButtonText}
                    </Button>
                  </div>
                </div>
              )}
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
