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
import { Loader2, Settings, Sparkles, Palette, User, Eye, Globe, Lock, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateProfileSettings } from '@/hooks/user/useProfileFeatures';
import {
  AMBIENT_PRESETS,
  EFFECT_OPTIONS,
  readProfileCustomization,
  toHslTriplet,
  type BackgroundEffectKey,
} from '@/lib/profileSettings';

interface ProfileSettingsSheetProps {
  trigger: React.ReactNode;
}

export function ProfileSettingsSheet({ trigger }: ProfileSettingsSheetProps) {
  const { user, profile, refreshProfile } = useAuth();
  const reduceMotion = useReducedMotion();
  const updateSettings = useUpdateProfileSettings();

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

  // Customization
  const [ambientColor, setAmbientColor] = useState<string | null>(null);
  const [backgroundEffect, setBackgroundEffect] = useState<BackgroundEffectKey>('none');

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
    const custom = readProfileCustomization(profile);
    setAmbientColor(custom.ambientColor);
    setBackgroundEffect(custom.backgroundEffect);
  }, [profile, open]);

  const handleSave = async () => {
    if (!user) {
      toast.error('Sign in first');
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
          toast.error('That username is already taken');
          setSaving(false);
          return;
        }
        throw identityError;
      }

      // 2. Customization — single merged app_settings write (avoids read-modify-write race).
      await updateSettings.mutateAsync({ ambientColor: ambientColor ?? undefined, backgroundEffect });

      await refreshProfile();
      toast.success('Profile settings saved');
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border-l border-white/[0.08] bg-background/60 p-0 backdrop-blur-[40px] sm:max-w-md md:max-w-lg shadow-[-20px_0_40px_rgba(0,0,0,0.5)]"
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
            Profile Settings
          </SheetTitle>
        </SheetHeader>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6 custom-scrollbar relative z-10">
          {/* Identity */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <User className="h-4 w-4 text-primary" /> Identity
            </h3>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
                className="rounded-xl border-white/[0.08] bg-white/[0.03]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Username</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                className="rounded-xl border-white/[0.08] bg-white/[0.03]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Bio</Label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell others about yourself"
                rows={3}
                className="rounded-xl border-white/[0.08] bg-white/[0.03] resize-none"
              />
            </div>
          </section>

          {/* Ambient Color */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <Palette className="h-4 w-4 text-primary" /> Ambient Color
            </h3>
            <p className="text-xs text-muted-foreground/70">
              Sets the glow accent across your profile cards. Everyone viewing your profile sees it.
            </p>
            <div className="grid grid-cols-6 gap-2.5">
              {AMBIENT_PRESETS.map((preset) => {
                const active = ambientColor === preset.triplet;
                return (
                  <button
                    key={preset.name}
                    onClick={() => setAmbientColor(preset.triplet)}
                    title={preset.name}
                    className={cn(
                      'relative aspect-square rounded-xl transition-all',
                      active ? 'ring-2 ring-white scale-105 shadow-lg' : 'ring-1 ring-white/10 hover:scale-105',
                    )}
                    style={{ backgroundColor: `hsl(${preset.triplet})` }}
                  >
                    {active && (
                      <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs font-medium text-muted-foreground">Custom</span>
                <input
                  type="color"
                  onChange={(e) => setAmbientColor(toHslTriplet(e.target.value))}
                  className="h-8 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                />
              </label>
              {ambientColor && (
                <button
                  onClick={() => setAmbientColor(null)}
                  className="text-xs font-medium text-muted-foreground/60 hover:text-white transition-colors"
                >
                  Reset to default
                </button>
              )}
            </div>
          </section>

          {/* Background Effect */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <Sparkles className="h-4 w-4 text-primary" /> Background Effect
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {EFFECT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = backgroundEffect === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setBackgroundEffect(opt.key)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all',
                      active
                        ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.25)]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]',
                    )}
                  >
                    <Icon className={cn('h-5 w-5', active ? 'text-primary' : 'text-muted-foreground')} />
                    <span className={cn('text-[11px] font-semibold', active ? 'text-white' : 'text-muted-foreground')}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Privacy */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              {isPublic ? <Globe className="h-4 w-4 text-green-500" /> : <Lock className="h-4 w-4 text-amber-500" />}
              Privacy
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Public Profile</Label>
                <p className="text-xs text-muted-foreground">Allow others to view your profile via @username</p>
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
                    <Eye className="h-3 w-3" /> Show Watchlist
                  </Label>
                  <Switch checked={showWatchlist} onCheckedChange={setShowWatchlist} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-medium flex items-center gap-2">
                    <Eye className="h-3 w-3" /> Show Watch History
                  </Label>
                  <Switch checked={showHistory} onCheckedChange={setShowHistory} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-medium flex items-center gap-2">
                    <Eye className="h-3 w-3" /> Show Tatakai Calendar
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
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-12 rounded-full px-8 text-sm font-black uppercase tracking-widest shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all hover:scale-105"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
