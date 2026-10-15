import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
    return new Date(value).toLocaleString(uiI18n.language);
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
  useUiTranslation();
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
      toast.error(uiI18n.t('app.sign_in_first_77a74f57'));
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
          toast.error(uiI18n.t('app.that_username_is_already_taken_ab9e54fb'));
          return;
        }
        throw error;
      }
      await refreshProfile();
      toast.success(uiI18n.t('app.profile_updated_9713530f'));
    } catch (e: any) {
      toast.error(e?.message || uiI18n.t('app.failed_to_update_profile_bc8dc9b4'));
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleStartEmailChange = async () => {
    if (!user) return;
    const next = email.trim();
    if (!next || next === user.email) {
      toast.info(uiI18n.t('app.enter_a_new_email_address_dec5e57d'));
      return;
    }
    setSavingEmail(true);
    try {
      const { error } = await sendEmailChangeCode(next);
      if (error) throw error;
      setPendingEmail(next);
      setEmailOtp('');
      setEmailStep('verify-old');
      toast.success(uiI18n.t('app.verification_codes_sent_cf83a3ab'), {
        get description() { return uiI18n.t('app.check_i18n_value_0_first_then_i18n_value_1_ce60bbf0', { value0: user.email, value1: next }); },
      });
    } catch (e: any) {
      toast.error(e?.message || uiI18n.t('app.failed_to_start_email_change_5b4f76c4'));
    } finally {
      setSavingEmail(false);
    }
  };

  const handleVerifyEmailStep = async (codeOverride?: string) => {
    if (!user?.email) return;
    const code = (codeOverride ?? emailOtp).trim();
    if (code.length !== 6) {
      toast.error(uiI18n.t('app.enter_the_6_digit_code_d148321a'));
      return;
    }
    // 'verify-old' confirms the current inbox; 'verify-new' the incoming address.
    const target = emailStep === 'verify-old' ? user.email : pendingEmail;
    setSavingEmail(true);
    try {
      const { error } = await verifyEmailChangeCode(target, code);
      if (error) {
        toast.error(error.message.toLowerCase().includes('expired') ? uiI18n.t('app.that_code_expired_start_over_81021ea8') : uiI18n.t('app.invalid_code_please_try_again_9110f656'));
        setEmailOtp('');
        return;
      }
      if (emailStep === 'verify-old') {
        setEmailOtp('');
        setEmailStep('verify-new');
        toast.success(uiI18n.t('app.current_email_confirmed_9b4bb62a'), { get description() { return uiI18n.t('app.now_enter_the_code_sent_to_i18n_value_0_58e69b76', { value0: pendingEmail }); } });
      } else {
        toast.success(uiI18n.t('app.email_updated_63e1fe8b'));
        await refreshProfile();
        setEmailStep('idle');
        setPendingEmail('');
        setEmailOtp('');
        setShowEmail(false);
      }
    } catch (e: any) {
      toast.error(e?.message || uiI18n.t('app.failed_to_verify_code_e50b9533'));
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
      toast.error(uiI18n.t('app.new_password_must_be_at_least_8_characters_b0d47ea0'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(uiI18n.t('app.new_passwords_do_not_match_e9808792'));
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
        toast.error(uiI18n.t('app.current_password_is_incorrect_3dd580e7'));
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(uiI18n.t('app.password_updated_1de6d081'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      toast.error(e?.message || uiI18n.t('app.failed_to_change_password_2398d65f'));
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!user?.email) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email);
      if (error) throw error;
      toast.success(uiI18n.t('app.password_reset_email_sent_2af03dd9'));
    } catch (e: any) {
      toast.error(e?.message || uiI18n.t('app.failed_to_send_reset_email_11ab5a69'));
    }
  };

  const handleLogoutEverywhere = async () => {
    setSigningOutAll(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) throw error;
      toast.success(uiI18n.t('app.signed_out_of_all_devices_6fe2cca6'));
    } catch (e: any) {
      toast.error(e?.message || uiI18n.t('app.failed_to_sign_out_everywhere_02c98c52'));
    } finally {
      setSigningOutAll(false);
    }
  };

  if (!user) {
    return (
      <SettingsEmptyState
        icon={User}
        title={uiI18n.t('app.sign_in_to_manage_your_account_58c0e14b')}
        description={uiI18n.t('app.your_identity_email_password_and_active_sessions_6e635c2b')}
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
        title={uiI18n.t('app.profile_identity_7d10a1eb')}
        description={uiI18n.t('app.your_avatar_banner_and_public_names_7d93cda0')}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <AvatarPickerSheet
              overlayClassName="z-[90]"
              contentClassName="z-[100]"
              type="avatar"
              currentImage={avatarUrl}
              trigger={
                <button className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-background/50">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={uiI18n.t('app.avatar_7631b26e')} className="h-full w-full object-cover" />
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
              overlayClassName="z-[90]"
              contentClassName="z-[100]"
              type="banner"
              currentImage={bannerUrl}
              trigger={
                <button className="group relative flex h-16 flex-1 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-background/50">
                  {bannerUrl ? (
                    <img src={bannerUrl} alt={uiI18n.t('app.banner_c8af83fb')} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{uiI18n.t('app.set_banner_36ea5e12')}</span>
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
              <Label htmlFor="acct-display-name">{uiI18n.t('app.display_name_8d6b3481')}</Label>
              <Input
                id="acct-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={uiI18n.t('app.your_name_ab42293e')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acct-username">{uiI18n.t('app.username_84c29015')}</Label>
              <Input
                id="acct-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={uiI18n.t('app.username_249ba360')}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveIdentity} disabled={savingIdentity} className="gap-2">
              {savingIdentity ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {uiI18n.t('app.save_efc007a3')}
            </Button>
          </div>
        </div>
      </SettingsSection>

      {/* Email */}
      <SettingsSection
        icon={Mail}
        eyebrow="Sign-in"
        title={uiI18n.t('app.email_address_c94d3175')}
        description={uiI18n.t('app.updating_your_email_sends_a_6_digit_code_to_both_b5db679e')}
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
                aria-label={showEmail ? uiI18n.t('app.hide_email_566ca2ab') : uiI18n.t('app.reveal_and_edit_email_83dddaaf')}
              >
                {showEmail ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {showEmail ? uiI18n.t('app.enter_a_new_address_then_verify_both_inboxes_6c0b0125') : uiI18n.t('app.reveal_to_edit_your_address_73c1f93a')}
              </p>
              <Button variant="outline" onClick={handleStartEmailChange} disabled={savingEmail || !showEmail} className="gap-2">
                {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {uiI18n.t('app.update_email_b393df8d')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Progress: current inbox → new inbox */}
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${emailStep === 'verify-old' ? 'bg-primary/15 text-primary' : 'bg-emerald-500/15 text-emerald-400'}`}
              >
                {emailStep === 'verify-old' ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : <Check className="h-3 w-3" />}
                {uiI18n.t('app.current_email_1aee6a82')}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${emailStep === 'verify-new' ? 'bg-primary/15 text-primary' : 'bg-muted/40 text-muted-foreground'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${emailStep === 'verify-new' ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                {uiI18n.t('app.new_email_b07e22b0')}
              </span>
            </div>

            <div className="rounded-xl border border-white/5 bg-muted/20 p-4">
              <p className="text-sm text-foreground">
                {uiI18n.t('app.enter_the_code_sent_to_09d4ca19')}{' '}
                <span className="font-medium text-primary">
                  {emailStep === 'verify-old' ? user.email : pendingEmail}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {emailStep === 'verify-old'
                  ? uiI18n.t('app.step_1_of_2_confirm_you_own_your_current_address_e3dc41a2')
                  : uiI18n.t('app.step_2_of_2_confirm_your_new_address_to_finish_2107cc18')}
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
                <X className="h-3.5 w-3.5" /> {uiI18n.t('app.cancel_77dfd213')}
              </button>
              <Button onClick={() => handleVerifyEmailStep()} disabled={savingEmail || emailOtp.length !== 6} className="gap-2">
                {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {emailStep === 'verify-old' ? uiI18n.t('app.verify_continue_b8cb555d') : uiI18n.t('app.verify_finish_2ac7e697')}
              </Button>
            </div>
          </div>
        )}
      </SettingsSection>

      {/* Password */}
      <SettingsSection
        icon={Lock}
        eyebrow="Security"
        title={uiI18n.t('app.change_password_8c684290')}
        description={uiI18n.t('app.re_enter_your_current_password_to_set_a_new_one_b6f8d964')}
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="acct-current-pw">{uiI18n.t('app.current_password_4d596789')}</Label>
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
                <Label htmlFor="acct-new-pw">{uiI18n.t('app.new_password_4894cb39')}</Label>
                <Input
                  id="acct-new-pw"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="acct-confirm-pw">{uiI18n.t('app.confirm_new_password_68dcd71c')}</Label>
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
              {uiI18n.t('app.send_reset_email_instead_a7f26f9c')}
            </button>
            <Button onClick={handleChangePassword} disabled={changingPassword} className="gap-2">
              {changingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              {uiI18n.t('app.change_password_49289db4')}
            </Button>
          </div>
        </div>
      </SettingsSection>

      {/* Sessions */}
      <SettingsSection
        icon={LogOut}
        eyebrow="Sessions"
        title={uiI18n.t('app.sessions_e11e37a9')}
        description={uiI18n.t('app.this_device_s_session_and_account_wide_sign_out_1f9a07a6')}
      >
        <div className="space-y-3">
          <div className="space-y-1 rounded-xl border border-white/5 bg-muted/30 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{uiI18n.t('app.signed_in_as_a02107c3')}</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{uiI18n.t('app.last_sign_in_a21f88b1')}</span>
              <span className="font-medium">{formatDate(user.last_sign_in_at)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{uiI18n.t('app.session_expires_21dbf761')}</span>
              <span className="font-medium">
                {session?.expires_at ? formatDate(new Date(session.expires_at * 1000).toISOString()) : '—'}
              </span>
            </div>
          </div>
          <SettingRow
            tone="accent"
            icon={LogOut}
            title={uiI18n.t('app.log_out_of_all_devices_729b9c89')}
            description={uiI18n.t('app.ends_every_active_session_on_all_devices_includi_ac9b353b')}
            control={
              <Button variant="destructive" size="sm" onClick={handleLogoutEverywhere} disabled={signingOutAll} className="gap-2">
                {signingOutAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                {uiI18n.t('app.log_out_6e78c91f')}
              </Button>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
}
