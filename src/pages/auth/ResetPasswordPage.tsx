import { useState, useRef } from 'react';
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
      toast.error(parsed.error.errors[0].message);
      return;
    }
    if (turnstileEnabled && !captchaToken) {
      toast.error('Please complete the verification challenge');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await sendPasswordResetCode(email, captchaToken ?? undefined);
      if (error) {
        toast.error(error.message);
        resetCaptcha();
      } else {
        toast.success(`We sent a 6-digit code to ${email}`);
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
      toast.error('Enter the 6-digit code');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await verifyPasswordResetCode(email, code);
      if (error) {
        toast.error(error.message.toLowerCase().includes('expired') ? 'That code expired — request a new one.' : 'Invalid code. Please try again.');
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
      toast.error(parsed.error.errors[0].message);
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Password updated — you are signed in.');
        navigate('/');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (turnstileEnabled) {
      toast.info('Head back and complete the challenge to get a fresh code.');
      setStep('email');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await sendPasswordResetCode(email);
      if (error) toast.error(error.message);
      else toast.success(`New code sent to ${email}`);
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
            {step === 'code' ? 'Back' : 'Back to Login'}
          </Button>

          {/* Logo */}
          <div className="text-center mb-6">
            <img src={`${import.meta.env.BASE_URL}assets/logo/tatakai-logo.png`} alt="Tatakai Logo" className="mx-auto h-52 w-282 transition-transform duration-300 hover:scale-105 hover:drop-shadow-lg" />
          </div>

          <GlassPanel className="p-6 md:p-8">
            {step === 'email' && (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-semibold">Forgot Password?</h2>
                  <p className="text-sm text-muted-foreground">
                    Enter your email address and we'll send you a 6-digit code to reset your password.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
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
                        <p className="text-sm text-foreground font-medium">Verification didn't load correctly.</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          On iPhone this is usually iCloud Private Relay, a VPN, or a Safari content
                          blocker interfering with the check. Disable them for this site, or try Safari.
                        </p>
                        <button
                          type="button"
                          onClick={retryChallenge}
                          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                        >
                          <RefreshCw className="w-4 h-4" /> Retry verification
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isLoading || !email || (turnstileEnabled && !captchaToken)}>
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                  ) : (
                    <><Mail className="w-4 h-4 mr-2" /> Send me a code</>
                  )}
                </Button>
              </form>
            )}

            {step === 'code' && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-semibold">Enter your code</h2>
                  <p className="text-sm text-muted-foreground">
                    We sent a 6-digit code to <strong>{email}</strong>. Enter it below.
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
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
                  ) : (
                    <><ShieldCheck className="w-4 h-4 mr-2" /> Verify code</>
                  )}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button type="button" onClick={() => setStep('email')} className="text-muted-foreground hover:text-foreground transition-colors">
                    Use a different email
                  </button>
                  <button type="button" onClick={handleResend} disabled={isLoading} className="text-primary hover:underline font-medium disabled:opacity-50">
                    Resend code
                  </button>
                </div>
              </div>
            )}

            {step === 'password' && (
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-semibold">Set a new password</h2>
                  <p className="text-sm text-muted-foreground">
                    Choose a new password for <strong>{email}</strong>.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
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
                  <Label htmlFor="confirm-password">Confirm Password</Label>
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
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating...</>
                  ) : (
                    <><KeyRound className="w-4 h-4 mr-2" /> Update password</>
                  )}
                </Button>
              </form>
            )}
          </GlassPanel>

          {/* Additional Help */}
          <div className="text-center text-sm text-muted-foreground space-y-2">
            <p>Didn't receive the email? Check your spam folder.</p>
            <p>
              Still need help?{' '}
              <button
                onClick={() => window.open('https://discord.gg/Vr5GZFJszp', '_blank')}
                className="text-primary hover:underline"
              >
                Contact Support
              </button>
              &nbsp;or submit a
              <button
                onClick={() => window.open('/suggestions', '_blank')}
                className="text-primary hover:underline"
              >
                &nbsp;Ticket
              </button>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
