import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Eye, EyeOff, Image as ImageIcon, Loader2, LogOut, Lock, Mail, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AvatarPickerSheet } from '@/components/profile/AvatarPickerSheet';
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
  const { user, session, profile, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [savingIdentity, setSavingIdentity] = useState(false);

  const [email, setEmail] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

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

  const handleChangeEmail = async () => {
    if (!user) return;
    const next = email.trim();
    if (!next || next === user.email) {
      toast.info('Enter a new email address');
      return;
    }
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: next });
      if (error) throw error;
      toast.success('Confirmation email sent', {
        description: 'Confirm from both your current and new inbox to finish the change.',
      });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update email');
    } finally {
      setSavingEmail(false);
    }
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
        description="Changing your email sends a confirmation link to both the old and new address."
      >
        <div className="space-y-4">
          <div className="relative">
            <Input
              type={showEmail ? 'text' : 'email'}
              value={showEmail ? email : email.replace(/(.{2}).*(@.*)/, '$1•••••$2')}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={!showEmail}
              className="pr-10"
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
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleChangeEmail} disabled={savingEmail || !showEmail} className="gap-2">
              {savingEmail && <Loader2 className="h-4 w-4 animate-spin" />}
              Update Email
            </Button>
          </div>
        </div>
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
