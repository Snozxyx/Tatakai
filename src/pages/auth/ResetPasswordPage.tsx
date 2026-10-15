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
import { ArrowLeft, Mail, Loader2, Lock, Eye, EyeOff, ShieldCheck, KeyRound, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { OtpCodeInput } from '@/components/auth/OtpCodeInput';
import { TurnstileWidget, type TurnstileWidgetHandle } from '@/components/security/TurnstileWidget';
import { isTurnstileEnabled } from '@/lib/security/turnstile';

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
  // Mirrors AuthPage: surfaces a retry affordance when Cloudflare's own
  // challenge fails (iPhone Private Relay / VPN / content blocker).
  const [challengeError, setChallengeError] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const turnstileEnabled = isTurnstileEnabled();

  const resetCaptcha = () => {
    turnstileRef.current?.reset();
    setCaptchaToken(null);
    setChallengeError(false);
  };

  const retryChallenge = () => {
    setChallengeError(false);
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(t('auth.invalidEmail'));
      return;
    }
    if (turnstileEnabled && !captchaToken) {
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
    if (turnstileEnabled) {
      toast.info(t('auth.resendChallengeHint'));
      setStep('email');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await sendPasswordResetCode(email);
      if (error) toast.error(error.message);
      else toast.success(t('auth.newCodeSent', { email }));
    } finally {
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
            <img src={`${import.meta.env.BASE_URL}assets/logo/tatakai-logo.png`} alt={uiI18n.t('app.tatakai_logo_26c9f0b7')} className="mx-auto h-52 w-282 transition-transform duration-300 hover:scale-105 hover:drop-shadow-lg" />
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
                {turnstileEnabled && (
                  <div className="space-y-2">
                    <TurnstileWidget
                      ref={turnstileRef}
                      action="password_reset"
                      onToken={(token) => { setCaptchaToken(token); setChallengeError(false); }}
                      onExpire={() => setCaptchaToken(null)}
                      onError={() => { setCaptchaToken(null); setChallengeError(true); }}
                      onTimeout={() => { setCaptchaToken(null); setChallengeError(true); }}
                      className="flex justify-center"
                    />
                    {challengeError && !captchaToken && (
                      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-center">
                        <p className="text-sm text-foreground font-medium">{uiI18n.t('app.verification_didn_t_load_correctly_4902f292')}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {uiI18n.t('app.on_iphone_this_is_usually_icloud_private_relay_a_b6f8de3d')}
                        </p>
                        <button
                          type="button"
                          onClick={retryChallenge}
                          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                        >
                          <RefreshCw className="w-4 h-4" /> {uiI18n.t('app.retry_verification_a113d86c')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isLoading || !email || (turnstileEnabled && !captchaToken)}>
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
                onClick={() => window.open('https://discord.gg/Vr5GZFJszp', '_blank')}
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
