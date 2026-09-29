import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, Eye, EyeOff, Image as ImageIcon, Loader2, LogOut, Lock, Mail, ShieldCheck, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AvatarPickerSheet } from '@/components/profile/AvatarPickerSheet';
import { OtpCodeInput } from '@/components/auth/OtpCodeInput';
import {
  SettingRow,
  SettingsEmptyState,
  SettingsSection,
} from '@/components/settings/SettingsPrimitives';

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '—';
  }
};

/**
 * Account: identity (avatar/banner + display name + username), email change,
 * password change (re-auth first), and session controls (current session info
 * + log out of all devices). Built fresh for the settings modal.
 */
export function AccountPanel() {
  const { user, session, profile, refreshProfile, sendEmailChangeCode, verifyEmailChangeCode } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [savingIdentity, setSavingIdentity] = useState(false);

  const [email, setEmail] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  // Two-step OTP email change: verify the OLD inbox, then the NEW inbox.
  const [emailStep, setEmailStep] = useState<'idle' | 'verify-old' | 'verify-new'>('idle');
  const [pendingEmail, setPendingEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [signingOutAll, setSigningOutAll] = useState(false);

  useEffect(() => {
    if (profile) {
      const p = profile as any;
      setDisplayName(p.display_name || '');
      setUsername(p.username || '');
    }
  }, [profile]);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  const handleSaveIdentity = async () => {
    if (!user) {
      toast.error('Sign in first');
      return;
    }
    setSavingIdentity(true);
    try {
      const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '');
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() || null, username: cleanUsername || null })
        .eq('user_id', user.id);
      if (error) {
        if ((error as any).code === '23505') {
          toast.error('That username is already taken');
          return;
        }
        throw error;
      }
      await refreshProfile();
      toast.success('Profile updated');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update profile');
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleStartEmailChange = async () => {
    if (!user) return;
    const next = email.trim();
    if (!next || next === user.email) {
      toast.info('Enter a new email address');
      return;
    }
    setSavingEmail(true);
    try {
      const { error } = await sendEmailChangeCode(next);
      if (error) throw error;
      setPendingEmail(next);
      setEmailOtp('');
      setEmailStep('verify-old');
      toast.success('Verification codes sent', {
        description: `Check ${user.email} first, then ${next}.`,
      });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to start email change');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleVerifyEmailStep = async (codeOverride?: string) => {
    if (!user?.email) return;
    const code = (codeOverride ?? emailOtp).trim();
    if (code.length !== 6) {
      toast.error('Enter the 6-digit code');
      return;
    }
    // 'verify-old' confirms the current inbox; 'verify-new' the incoming address.
    const target = emailStep === 'verify-old' ? user.email : pendingEmail;
    setSavingEmail(true);
    try {
      const { error } = await verifyEmailChangeCode(target, code);
      if (error) {
        toast.error(error.message.toLowerCase().includes('expired') ? 'That code expired — start over.' : 'Invalid code. Please try again.');
        setEmailOtp('');
        return;
      }
      if (emailStep === 'verify-old') {
        setEmailOtp('');
        setEmailStep('verify-new');
        toast.success('Current email confirmed', { description: `Now enter the code sent to ${pendingEmail}.` });
      } else {
        toast.success('Email updated');
        await refreshProfile();
        setEmailStep('idle');
        setPendingEmail('');
        setEmailOtp('');
        setShowEmail(false);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to verify code');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleCancelEmailChange = () => {
    setEmailStep('idle');
    setPendingEmail('');
    setEmailOtp('');
    if (user?.email) setEmail(user.email);
    setShowEmail(false);
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setChangingPassword(true);
    try {
      // Re-authenticate with the current password to satisfy secure password change.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthError) {
        toast.error('Current password is incorrect');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!user?.email) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email);
      if (error) throw error;
      toast.success('Password reset email sent');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send reset email');
    }
  };

  const handleLogoutEverywhere = async () => {
    setSigningOutAll(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) throw error;
      toast.success('Signed out of all devices');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to sign out everywhere');
    } finally {
      setSigningOutAll(false);
    }
  };

  if (!user) {
    return (
      <SettingsEmptyState
        icon={User}
        title="Sign in to manage your account"
        description="Your identity, email, password, and active sessions live here once you're signed in."
      />
    );
  }

  const avatarUrl = (profile as any)?.avatar_url as string | undefined;
  const bannerUrl = (profile as any)?.banner_url as string | undefined;

  return (
    <div className="space-y-6">
      {/* Identity */}
      <SettingsSection
        icon={User}
        eyebrow="Profile"
        title="Profile identity"
        description="Your avatar, banner, and public names."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <AvatarPickerSheet
              type="avatar"
              currentImage={avatarUrl}
              trigger={
                <button className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-background/50">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-6 w-6 text-muted-foreground" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <ImageIcon className="h-4 w-4 text-white" />
                  </span>
                </button>
              }
            />
            <AvatarPickerSheet
              type="banner"
              currentImage={bannerUrl}
              trigger={
                <button className="group relative flex h-16 flex-1 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-background/50">
                  {bannerUrl ? (
                    <img src={bannerUrl} alt="Banner" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Set banner</span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <ImageIcon className="h-4 w-4 text-white" />
                  </span>
                </button>
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="acct-display-name">Display Name</Label>
              <Input
                id="acct-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acct-username">Username</Label>
              <Input
                id="acct-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveIdentity} disabled={savingIdentity} className="gap-2">
              {savingIdentity ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </SettingsSection>

      {/* Email */}
      <SettingsSection
        icon={Mail}
        eyebrow="Sign-in"
        title="Email address"
        description="Updating your email sends a 6-digit code to both your current and new inbox — confirm each to finish."
      >
        {emailStep === 'idle' ? (
          <div className="space-y-4">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type={showEmail ? 'text' : 'email'}
                value={showEmail ? email : email.replace(/(.{2}).*(@.*)/, '$1•••••$2')}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={!showEmail}
                className="pl-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowEmail((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showEmail ? 'Hide email' : 'Reveal and edit email'}
              >
                {showEmail ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {showEmail ? 'Enter a new address, then verify both inboxes.' : 'Reveal to edit your address.'}
              </p>
              <Button variant="outline" onClick={handleStartEmailChange} disabled={savingEmail || !showEmail} className="gap-2">
                {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Update Email
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Progress: current inbox → new inbox */}
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${
                  emailStep === 'verify-old' ? 'bg-primary/15 text-primary' : 'bg-emerald-500/15 text-emerald-400'
                }`}
              >
                {emailStep === 'verify-old' ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : <Check className="h-3 w-3" />}
                Current email
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${
                  emailStep === 'verify-new' ? 'bg-primary/15 text-primary' : 'bg-muted/40 text-muted-foreground'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${emailStep === 'verify-new' ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                New email
              </span>
            </div>

            <div className="rounded-xl border border-white/5 bg-muted/20 p-4">
              <p className="text-sm text-foreground">
                Enter the code sent to{' '}
                <span className="font-medium text-primary">
                  {emailStep === 'verify-old' ? user.email : pendingEmail}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {emailStep === 'verify-old'
                  ? 'Step 1 of 2 — confirm you own your current address.'
                  : 'Step 2 of 2 — confirm your new address to finish.'}
              </p>
              <div className="mt-4">
                <OtpCodeInput
                  value={emailOtp}
                  onChange={setEmailOtp}
                  onComplete={(code) => handleVerifyEmailStep(code)}
                  disabled={savingEmail}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleCancelEmailChange}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <Button onClick={() => handleVerifyEmailStep()} disabled={savingEmail || emailOtp.length !== 6} className="gap-2">
                {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {emailStep === 'verify-old' ? 'Verify & continue' : 'Verify & finish'}
              </Button>
            </div>
          </div>
        )}
      </SettingsSection>

      {/* Password */}
      <SettingsSection
        icon={Lock}
        eyebrow="Security"
        title="Change password"
        description="Re-enter your current password to set a new one."
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="acct-current-pw">Current Password</Label>
              <Input
                id="acct-current-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="acct-new-pw">New Password</Label>
                <Input
                  id="acct-new-pw"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="acct-confirm-pw">Confirm New Password</Label>
                <Input
                  id="acct-confirm-pw"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleSendResetEmail}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Send reset email instead
            </button>
            <Button onClick={handleChangePassword} disabled={changingPassword} className="gap-2">
              {changingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              Change Password
            </Button>
          </div>
        </div>
      </SettingsSection>

      {/* Sessions */}
      <SettingsSection
        icon={LogOut}
        eyebrow="Sessions"
        title="Sessions"
        description="This device's session and account-wide sign-out."
      >
        <div className="space-y-3">
          <div className="space-y-1 rounded-xl border border-white/5 bg-muted/30 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Signed in as</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last sign in</span>
              <span className="font-medium">{formatDate(user.last_sign_in_at)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Session expires</span>
              <span className="font-medium">
                {session?.expires_at ? formatDate(new Date(session.expires_at * 1000).toISOString()) : '—'}
              </span>
            </div>
          </div>
          <SettingRow
            tone="accent"
            icon={LogOut}
            title="Log out of all devices"
            description="Ends every active session on all devices, including this one."
            control={
              <Button variant="destructive" size="sm" onClick={handleLogoutEverywhere} disabled={signingOutAll} className="gap-2">
                {signingOutAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Log out
              </Button>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
}
