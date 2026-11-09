import { BrandLogo } from '@/components/branding/BrandLogo';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Background } from '@/components/layout/Background';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Mail, Loader2, Lock, Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { OtpCodeInput } from '@/components/auth/OtpCodeInput';
import { CaptchaWidget, type CaptchaWidgetHandle } from '@/components/security/CaptchaWidget';
import { isCaptchaRequired } from '@/lib/security/captcha';
import { solveCaptcha } from '@/lib/security/capClient';

const emailSchema = z.string().email('Please enter a valid email');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

type Step = 'email' | 'code' | 'password';

export default function ResetPasswordPage() {
  useUiTranslation();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sendPasswordResetCode, verifyPasswordResetCode } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRequired = isCaptchaRequired();
  const captchaRef = useRef<CaptchaWidgetHandle>(null);
  const resending = useRef(false);

  const resetCaptcha = () => {
    captchaRef.current?.reset();
    setCaptchaToken(null);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(t('auth.invalidEmail'));
      return;
    }
    if (captchaRequired && !captchaToken) {
      toast.error(t('auth.completeChallenge'));
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await sendPasswordResetCode(email, captchaToken ?? undefined);
      if (error) {
        toast.error(error.message);
        resetCaptcha();
      } else {
        toast.success(t('auth.codeSent', { email }));
        setOtp('');
        setStep('code');
        resetCaptcha();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (codeOverride?: string) => {
    const code = (codeOverride ?? otp).trim();
    if (code.length !== 6) {
      toast.error(t('auth.enter6Digit'));
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await verifyPasswordResetCode(email, code);
      if (error) {
        toast.error(error.message.toLowerCase().includes('expired') ? t('auth.codeExpired') : t('auth.invalidCodeRetry'));
        setOtp('');
      } else {
        // A recovery session now exists; let the user choose a new password.
        setStep('password');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(t('auth.passwordMin'));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t('auth.passwordsNoMatch'));
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success(t('auth.passwordUpdatedSignedIn'));
        navigate('/');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resending.current) return;
    resending.current = true;
    setIsLoading(true);
    try {
      const proof = await solveCaptcha('recover');
      const { error } = await sendPasswordResetCode(email, proof);
      if (error) toast.error(error.message);
      else {
        toast.success(t('auth.newCodeSent', { email }));
      }
    } catch {
      toast.error(uiI18n.t('captcha.unavailable'));
    } finally {
      resending.current = false;
      setIsLoading(false);
    }
  };

  return (
    <>
      <Background />
      <main className="min-h-screen relative z-10 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Back Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (step === 'code' ? setStep('email') : navigate('/auth'))}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 'code' ? t('common.back') : t('auth.backToLogin')}
          </Button>

          {/* Logo */}
          <div className="text-center mb-6">
            <BrandLogo  alt={uiI18n.t('app.tatakai_logo_26c9f0b7')} className="mx-auto h-52 w-282 transition-transform duration-300 hover:scale-105 hover:drop-shadow-lg" />
          </div>

          <GlassPanel className="p-6 md:p-8">
            {step === 'email' && (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-semibold">{t('auth.forgotPasswordTitle')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t('auth.forgotPasswordDesc')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.emailAddress')}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <CaptchaWidget ref={captchaRef} action="recover" onToken={setCaptchaToken} onExpire={() => setCaptchaToken(null)} onError={() => setCaptchaToken(null)} disabled={isLoading} />
                <Button type="submit" className="w-full" disabled={isLoading || !email || (captchaRequired && !captchaToken)}>
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('auth.sending')}</>
                  ) : (
                    <><Mail className="w-4 h-4 mr-2" /> {t('auth.sendCode')}</>
                  )}
                </Button>
              </form>
            )}

            {step === 'code' && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-semibold">{t('auth.enterYourCode')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t('auth.codeSentHint')} <strong>{email}</strong>. {t('auth.enterItBelow')}
                  </p>
                </div>
                <OtpCodeInput
                  value={otp}
                  onChange={setOtp}
                  onComplete={(code) => handleVerifyCode(code)}
                  disabled={isLoading}
                  autoFocus
                />
                <Button
                  type="button"
                  onClick={() => handleVerifyCode()}
                  className="w-full"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('auth.verifying')}</>
                  ) : (
                    <><ShieldCheck className="w-4 h-4 mr-2" /> {t('auth.verifyCode')}</>
                  )}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button type="button" onClick={() => setStep('email')} className="text-muted-foreground hover:text-foreground transition-colors">
                    {t('auth.useDifferentEmail')}
                  </button>
                  <button type="button" onClick={handleResend} disabled={isLoading} className="text-primary hover:underline font-medium disabled:opacity-50">
                    {t('auth.resendCode')}
                  </button>
                </div>
              </div>
            )}

            {step === 'password' && (
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-semibold">{t('auth.setNewPasswordTitle')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t('auth.chooseNewPasswordFor')} <strong>{email}</strong>.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t('auth.newPassword')}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t('auth.confirmPassword')}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading || !password || !confirmPassword}>
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('auth.updating')}</>
                  ) : (
                    <><KeyRound className="w-4 h-4 mr-2" /> {t('auth.updatePassword')}</>
                  )}
                </Button>
              </form>
            )}
          </GlassPanel>

          {/* Additional Help */}
          <div className="text-center text-sm text-muted-foreground space-y-2">
            <p>{t('auth.checkSpam')}</p>
            <p>
              {t('auth.stillNeedHelp')}{' '}
              <button
                onClick={() => window.open('https://dsc.gg/tatakai', '_blank')}
                className="text-primary hover:underline"
              >
                {t('auth.contactSupport')}
              </button>
              {" "}{t('auth.orSubmitA')}
              <button
                onClick={() => window.open('/suggestions', '_blank')}
                className="text-primary hover:underline"
              >
                {" "}{t('auth.ticket')}
              </button>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
