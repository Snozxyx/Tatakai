import { useOwnedProfileThemes } from '@/hooks/user/useProfileThemeClaims';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserBadges } from '@/hooks/community/useUserBadges';
import { useSaveProfileThemes } from '@/hooks/user/useProfileThemes';
import { readThemePreferences } from '@/lib/profileThemes';
import { PROFILE_THEMES, canUseProfileTheme } from './registry';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Lock, Palette } from 'lucide-react';
import { useSettingsModal } from '@/contexts/SettingsModalContext';

export function ProfileThemeSelector() {
  const { openSettings } = useSettingsModal();
  const { profile } = useAuth();
  const badges = useUserBadges(profile?.user_id);
  const owned = useOwnedProfileThemes(profile?.user_id);
  const save = useSaveProfileThemes();
  const preferences = readThemePreferences(profile?.app_settings);
  const [selected, setSelected] = useState(preferences.selected);
  return <section className="space-y-3 rounded-2xl border border-white/10 p-5" aria-label="Profile theme">
    <h3 className="flex items-center gap-2 font-bold"><Palette size={16} /> Profile theme</h3>
    <p className="text-sm text-muted-foreground">Choose how your profile looks to everyone. Your default profile stays saved.</p>
    {PROFILE_THEMES.map(theme => {
      const locked = theme.id !== 'default' && (!badges.isSuccess || !canUseProfileTheme(theme, profile, badges.data ?? [], owned.data));
      return <label key={theme.id} className="flex items-start gap-3 rounded-xl border border-white/10 p-3">
        <input type="radio" name="profile-theme" value={theme.id} checked={selected === theme.id} disabled={locked || save.isPending} onChange={() => setSelected(theme.id)} className="mt-1" />
        <span><span className="flex items-center gap-2 font-bold">{theme.label}{locked && <Lock size={13} />}</span><span className="text-xs text-muted-foreground">{theme.description}</span></span>
      </label>;
    })}
    <p className="text-xs text-muted-foreground">Use themes you own, or unlock custom themes with Booster, Premium Pro, Premium Ultra, or Admin.</p>
    <Button type="button" variant="outline" onClick={() => openSettings('profile-store')}>Open Profile Store</Button>
    <Button type="button" disabled={save.isPending || badges.isLoading || selected === preferences.selected} onClick={async () => {
      const theme = PROFILE_THEMES.find(t => t.id === selected); if (!theme) return;
      try { await save.mutateAsync({ ...preferences, selected, configurations: { ...preferences.configurations, [selected]: theme.parse(preferences.configurations[selected]) ?? theme.defaults() } }); toast.success('Profile theme saved.'); }
      catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save theme.'); }
    }}>{save.isPending ? 'Saving…' : 'Apply profile theme'}</Button>
  </section>;
}
