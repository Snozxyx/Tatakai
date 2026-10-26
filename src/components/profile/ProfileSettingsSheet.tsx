import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Settings, Sparkles, User, Eye, Globe, Lock, Check, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsModal } from '@/contexts/SettingsModalContext';

interface ProfileSettingsSheetProps {
  trigger: React.ReactNode;
  overlayClassName?: string;
  contentClassName?: string;
}

export function ProfileSettingsSheet({ trigger, overlayClassName, contentClassName }: ProfileSettingsSheetProps) {
  useUiTranslation();
  const { user, profile, refreshProfile } = useAuth();
  const reduceMotion = useReducedMotion();
  const { openSettings } = useSettingsModal();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Identity fields
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');

  // Privacy
  const [isPublic, setIsPublic] = useState(true);
  const [showWatchlist, setShowWatchlist] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const [showCalendar, setShowCalendar] = useState(true);

  // Seed local state whenever the sheet opens or the profile changes.
  useEffect(() => {
    if (!profile) return;
    const p = profile as any;
    setDisplayName(p.display_name || '');
    setUsername(p.username || '');
    setBio(p.bio || '');
    setIsPublic(p.is_public ?? true);
    setShowWatchlist(p.show_watchlist ?? true);
    setShowHistory(p.show_history ?? true);
    setShowCalendar(p.show_calendar ?? true);
  }, [profile, open]);

  const handleSave = async () => {
    if (!user) {
      toast.error(uiI18n.t('app.sign_in_first_77a74f57'));
      return;
    }
    setSaving(true);
    try {
      // 1. Identity + privacy — direct update on granted columns.
      const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '');
      const { error: identityError } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim() || null,
          username: cleanUsername || null,
          bio: bio.trim() || null,
          is_public: isPublic,
          show_watchlist: showWatchlist,
          show_history: showHistory,
          show_calendar: showCalendar,
        })
        .eq('user_id', user.id);

      if (identityError) {
        if ((identityError as any).code === '23505') {
          toast.error(uiI18n.t('app.that_username_is_already_taken_ab9e54fb'));
          setSaving(false);
          return;
        }
        throw identityError;
      }

      await refreshProfile();
      toast.success(uiI18n.t('app.profile_settings_saved_2ea46ddb'));
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || uiI18n.t('app.failed_to_save_settings_b3cc6cc8'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="right"
        overlayClassName={overlayClassName}
        className={cn("flex w-full flex-col gap-0 overflow-hidden border-l border-white/[0.08] bg-background/60 p-0 backdrop-blur-[40px] sm:max-w-md md:max-w-lg shadow-[-20px_0_40px_rgba(0,0,0,0.5)]", contentClassName)}
      >
        {/* Ambient glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 blur-[120px] rounded-full" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background/95" />
        </div>

        {/* Header */}
        <SheetHeader className="relative shrink-0 border-b border-white/[0.05] bg-white/[0.01] p-6 pb-5 text-left z-10">
          <SheetTitle className="flex items-center gap-3 text-2xl font-black tracking-tight text-white drop-shadow-md">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/20 text-primary shadow-[0_0_20px_rgba(var(--primary),0.2)]">
              <Settings className="h-5 w-5" />
            </div>
            {uiI18n.t('app.profile_settings_df4b0814')}
          </SheetTitle>
        </SheetHeader>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6 custom-scrollbar relative z-10">
          <section className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-primary" />Make it yours</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">Choose themes, avatar frames, profile effects, nameplates, and colors in the Profile Store. Click below to open your collection.</p>
            <Button type="button" variant="outline" className="gap-2" onClick={() => { setOpen(false); openSettings('profile-store'); }}>Open Profile Store<ArrowUpRight size={14} /></Button>
          </section>
          {/* Identity */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <User className="h-4 w-4 text-primary" /> {uiI18n.t('app.identity_7e5a975b')}
            </h3>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">{uiI18n.t('app.display_name_8d6b3481')}</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={uiI18n.t('app.your_display_name_33a61428')}
                className="rounded-xl border-white/[0.08] bg-white/[0.03]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">{uiI18n.t('app.username_84c29015')}</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={uiI18n.t('app.username_249ba360')}
                className="rounded-xl border-white/[0.08] bg-white/[0.03]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">{uiI18n.t('app.bio_b31fc969')}</Label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={uiI18n.t('app.tell_others_about_yourself_bec7d634')}
                rows={3}
                className="rounded-xl border-white/[0.08] bg-white/[0.03] resize-none"
              />
            </div>
          </section>

          {/* Privacy */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              {isPublic ? <Globe className="h-4 w-4 text-green-500" /> : <Lock className="h-4 w-4 text-amber-500" />}
              {uiI18n.t('app.privacy_cf01481f')}
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">{uiI18n.t('app.public_profile_0da61f53')}</Label>
                <p className="text-xs text-muted-foreground">{uiI18n.t('app.allow_others_to_view_your_profile_via_username_fadc72a1')}</p>
              </div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
            {isPublic && (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-3 pl-4 border-l-2 border-primary/30"
              >
                <div className="flex items-center justify-between">
                  <Label className="font-medium flex items-center gap-2">
                    <Eye className="h-3 w-3" /> {uiI18n.t('app.show_watchlist_394df743')}
                  </Label>
                  <Switch checked={showWatchlist} onCheckedChange={setShowWatchlist} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-medium flex items-center gap-2">
                    <Eye className="h-3 w-3" /> {uiI18n.t('app.show_watch_history_25d808d4')}
                  </Label>
                  <Switch checked={showHistory} onCheckedChange={setShowHistory} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-medium flex items-center gap-2">
                    <Eye className="h-3 w-3" /> {uiI18n.t('app.show_tatakai_calendar_8269e0f9')}
                  </Label>
                  <Switch checked={showCalendar} onCheckedChange={setShowCalendar} />
                </div>
              </motion.div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="relative z-20 flex shrink-0 justify-end gap-3 border-t border-white/[0.08] bg-background/60 p-5 backdrop-blur-2xl">
          <Button variant="ghost" onClick={() => setOpen(false)} className="h-12 rounded-full px-6 font-bold hover:bg-white/10">
            {uiI18n.t('app.cancel_77dfd213')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-12 rounded-full px-8 text-sm font-black uppercase tracking-widest shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-colors"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            {uiI18n.t('app.save_changes_fa2984b3')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
