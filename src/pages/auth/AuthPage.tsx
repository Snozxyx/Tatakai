import { backgroundVideo } from '@/lib/assets';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Mail, Lock, User, Play, ArrowLeft, ShieldCheck, RefreshCw } from 'lucide-react';
import { z } from 'zod';
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import { cn } from '@/lib/utils';
import { TurnstileWidget, type TurnstileWidgetHandle } from '@/components/security/TurnstileWidget';
import { isTurnstileEnabled } from '@/lib/security/turnstile';
import { OtpCodeInput } from '@/components/auth/OtpCodeInput';

const emailSchema = z.string().email('Please enter a valid email');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

// Random video backgrounds
const VIDEO_SOURCES = ['1.mp4', '2.webm', '3.mp4', '5.mp4', '6.mp4'].map(backgroundVideo);

// Random text variations
const TEXT_VARIATIONS = [
  {
    get title() { return uiI18n.t('app.your_gateway_to_otaku_culture_838c3f85'); },
    desc: "Track the anime and manga you love, build tier lists and playlists, and join a community of passionate fans."
  },
  {
    get title() { return uiI18n.t('app.discover_anime_paradise_0fb075cb'); },
    desc: "Explore endless anime worlds, keep up with your favorites, and connect with fellow enthusiasts."
  },
  {
    get title() { return uiI18n.t('app.unleash_your_anime_journey_5cabdfe3'); },
    desc: "Dive into a vast library of anime, monitor your watching habits, and engage with a vibrant fanbase."
  },
  {
    get title() { return uiI18n.t('app.anime_adventures_await_878e3aec'); },
    desc: "Access countless anime series, follow your watchlist, and share experiences with like-minded viewers."
  },
  {
    get title() { return uiI18n.t('app.enter_the_anime_realm_40aaa106'); },
    desc: "Browse an extensive collection of anime, track episodes, and become part of an active community."
  }
];

export default function AuthPage() {
  const [tvLinkParams] = useSearchParams();
  const requestedReturn = tvLinkParams.get('returnTo') || sessionStorage.getItem('tatakai-auth-return') || '/';
  const safeReturn = requestedReturn.startsWith('/') && !requestedReturn.startsWith('//') && !/[\\\u0000-\u001f]/.test(requestedReturn) && !requestedReturn.startsWith('/auth') ? requestedReturn : '/';
  useUiTranslation();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    signIn,
    signUp,
    user,
    verifySignupCode,
    resendSignupCode,
  } = useAuth();

  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Set when Cloudflare reports the challenge itself failed (red
  // "Verification failed" state — common on iPhones with iCloud Private Relay,
  // a VPN, or a Safari content blocker). Lets us show a retry affordance
  // instead of leaving Sign In permanently disabled.
  const [challengeError, setChallengeError] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const turnstileEnabled = isTurnstileEnabled();

  // Pick a random video on mount
  const randomVideoSrc = useMemo(() => {
    return VIDEO_SOURCES[Math.floor(Math.random() * VIDEO_SOURCES.length)];
  }, []);

  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const isMobileApp = useIsMobileApp();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      sessionStorage.removeItem('tatakai-auth-return');
      navigate(safeReturn);
    }
  }, [user, navigate, safeReturn]);

  if (user) {
    return null;
  }

  const resetCaptcha = () => {
    turnstileRef.current?.reset();
    setCaptchaToken(null);
    setChallengeError(false);
  };

  const handleChallengeToken = (token: string) => {
    setCaptchaToken(token);
    setChallengeError(false);
  };

  const handleChallengeError = () => {
    setCaptchaToken(null);
    setChallengeError(true);
  };

  const retryChallenge = () => {
    setChallengeError(false);
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  };

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = t('auth.invalidEmail');
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = t('auth.passwordMin');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const goToVerify = () => {
    setOtp('');
    setStep('verify');
    resetCaptcha();
  };

  const backToForm = () => {
    setStep('form');
    setOtp('');
    resetCaptcha();
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (turnstileEnabled && !captchaToken) {
      toast.error(t('auth.completeChallenge'));
      return;
    }
    setIsLoading(true);
    try {
      if (isLogin) {
        const { error } = await signIn(email, password, captchaToken ?? undefined);
        if (error) {
          toast.error(error.message.includes('Invalid login credentials') ? t('auth.invalidCredentials') : error.message);
          resetCaptcha();
        } else {
          toast.success(t('auth.welcomeBackToast'));
          navigate(safeReturn);
        }
      } else {
        const { error, mode } = await signUp(email, password, displayName, captchaToken ?? undefined);
        if (error) {
          toast.error(error.message.includes('already registered') ? t('auth.emailRegistered') : error.message);
          resetCaptcha();
        } else if (mode === 'restricted') {
          toast.info(uiI18n.t('app.account_created_sign_in_to_browse_verify_your_em_2a041254'));
          setIsLogin(true);
          resetCaptcha();
        } else {
          toast.success(t('auth.codeSent', { email }));
          goToVerify();
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (codeOverride?: string) => {
    const code = (codeOverride ?? otp).trim();
    if (code.length !== 6) {
      toast.error(t('auth.enter6Digit'));
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await verifySignupCode(email, code);
      if (error) {
        toast.error(error.message.toLowerCase().includes('expired') ? t('auth.codeExpired') : t('auth.invalidCodeRetry'));
        setOtp('');
      } else {
        toast.success(t('auth.emailVerified'));
        // New accounts go straight into onboarding (theme, profile, rules).
        navigate('/onboarding');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (turnstileEnabled) {
      toast.info(t('auth.resendChallengeHint'));
      backToForm();
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await resendSignupCode(email);
      if (error) toast.error(error.message);
      else toast.success(t('auth.newCodeSent', { email }));
    } finally {
      setIsLoading(false);
    }
  };

  const switchAuthMode = () => {
    setIsLogin((prev) => !prev);
    setStep('form');
    setOtp('');
    setPassword('');
    setErrors({});
    resetCaptcha();
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Side - Form */}
      <div className={cn(
        "w-full lg:w-1/2 min-h-screen bg-background flex flex-col justify-center items-center p-6 lg:p-12 relative",
        isMobileApp && "lg:w-full"
      )}>
        {/* Back button */}
        <button
          onClick={() => (step === 'verify' ? backToForm() : navigate('/'))}
          className={cn(
            "absolute top-6 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group",
            isNative ? "left-4" : "left-6"
          )}
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">{step === 'verify' ? t('common.back') : t('auth.backToHome')}</span>
        </button>

        <div className="w-full max-w-md">
          {/* Logo/Brand */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg overflow-hidden">
                <img src={`${import.meta.env.BASE_URL}assets/logo/tatakai-logo-square.png`} alt={uiI18n.t('app.tatakai_logo_290743b0')} className="w-full h-full object-cover" />
              </div>
              <h1 className="font-display text-3xl font-bold gradient-text">{uiI18n.t('app.tatakai_28bda6bd')}</h1>
            </div>
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
              {step === 'verify' ? t('auth.enterYourCode') : isLogin ? t('auth.welcomeBackTitle') : t('auth.createAccountTitle')}
            </h2>
            <p className="text-muted-foreground">
              {step === 'verify' ? (
                <>{t('auth.codeSentHint')} <span className="text-foreground font-medium">{email}</span>. {t('auth.enterItBelow')}</>
              ) : isLogin ? t('auth.loginHint') : t('auth.signupHint')}
            </p>
          </div>

          {step === 'verify' ? (
            <div className="space-y-6">
              <OtpCodeInput
                value={otp}
                onChange={setOtp}
                onComplete={(code) => handleVerify(code)}
                disabled={isLoading}
                autoFocus
              />
              <Button
                type="button"
                onClick={() => handleVerify()}
                disabled={isLoading || otp.length !== 6}
                className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-semibold text-lg shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <span className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> {t('auth.verify')}</span>
                )}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={backToForm} className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('auth.useDifferentEmail')}
                </button>
                <button type="button" onClick={handleResend} disabled={isLoading} className="text-primary hover:underline font-medium disabled:opacity-50">
                  {t('auth.resendCode')}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleFormSubmit} className="space-y-5">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="text-foreground font-medium">{t('auth.displayName')}</Label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="displayName"
                      autoComplete="nickname"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t('auth.displayNamePlaceholder')}
                      className="h-12 pl-12 bg-muted/30 border-border hover:border-primary/50 focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground font-medium">{t('auth.email')}</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="email"
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: undefined })); }}
                    placeholder="you@example.com"
                    className={`h-12 pl-12 bg-muted/30 border-border hover:border-primary/50 focus:border-primary transition-colors ${errors.email ? 'border-destructive' : ''}`}
                  />
                </div>
                {errors.email && <p id="email-error" role="alert" className="text-sm text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground font-medium">{t('auth.password')}</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="password"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: undefined })); }}
                    placeholder="••••••••"
                    className={`h-12 pl-12 pr-12 bg-muted/30 border-border hover:border-primary/50 focus:border-primary transition-colors ${errors.password ? 'border-destructive' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? uiI18n.t('app.hide_password_e40123b4') : uiI18n.t('app.show_password_044b852f')}
                    aria-pressed={showPassword}
                    className="absolute right-1 top-1/2 flex h-11 w-11 items-center justify-center rounded-lg -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && <p id="password-error" role="alert" className="text-sm text-destructive">{errors.password}</p>}
                {isLogin && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => navigate('/reset-password')} className="text-sm text-primary hover:underline">
                      {t('auth.forgotPassword')}
                    </button>
                  </div>
                )}
              </div>

              {turnstileEnabled && (
                <div className="space-y-2">
                  <TurnstileWidget
                    ref={turnstileRef}
                    action={isLogin ? 'login' : 'signup'}
                    onToken={handleChallengeToken}
                    onExpire={() => setCaptchaToken(null)}
                    onError={handleChallengeError}
                    onTimeout={handleChallengeError}
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

              <Button
                type="submit"
                disabled={isLoading || (turnstileEnabled && !captchaToken)}
                className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-semibold text-lg shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : isLogin ? (
                  t('auth.signIn')
                ) : (
                  t('auth.createAccountBtn')
                )}
              </Button>
            </form>
          )}
          {step !== 'verify' && (
            <div className="mt-8 text-center">
              <p className="text-muted-foreground">
                {isLogin ? t('auth.noAccount') : t('auth.haveAccount')}
                <button onClick={switchAuthMode} className="ml-2 text-primary hover:underline font-semibold">
                  {isLogin ? t('auth.register') : t('auth.signIn')}
                </button>
              </p>
            </div>
          )}

          {/* Decorative / terms element */}
          <div className="mt-12 pt-8 border-t border-border/50">
            <p className="text-xs text-muted-foreground text-center">
              {t('auth.agreePrefix')}{' '}
              <button onClick={() => navigate('/terms')} className="text-primary hover:underline">{t('auth.termsOfService')}</button>
              ,{' '}
              <button onClick={() => navigate('/privacy')} className="text-primary hover:underline">{t('auth.privacyPolicy')}</button>
              ,{' '}
              <button onClick={() => navigate('/dmca')} className="text-primary hover:underline">{t('auth.dmcaPolicy')}</button>
              , {t('auth.and')}{' '}
              <button onClick={() => navigate('/community-guidelines')} className="text-primary hover:underline">{t('auth.communityGuidelines')}</button>
              .
            </p>
          </div>
        </div>
      </div>
      {/* Right Side - Video with overlay - show on web and desktop apps, hide only on mobile apps */}
      <div className={cn(
        "hidden lg:block w-1/2 h-screen relative overflow-hidden",
        isMobileApp && "lg:hidden"
      )}>
        {/* Video Background */}
        <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover">
          <source src={randomVideoSrc} type={randomVideoSrc.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
        </video>

        {/* 30% Dark Overlay */}
        <div className="absolute inset-0 bg-black/30" />

        {/* Content over video */}
        <div className="absolute inset-0 flex flex-col justify-end p-12">
          <div className="max-w-md">
            <h3 className="text-3xl font-bold text-white mb-4 drop-shadow-lg">{t('auth.heroFallbackTitle')}</h3>
            <p className="text-white/80 text-lg drop-shadow-md">
              {t('auth.heroFallbackDesc')}
            </p>
          </div>
        </div>

        {/* Gradient fade at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/50 to-transparent" />
      </div>
    </div>
  );
}
