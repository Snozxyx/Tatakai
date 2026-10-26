import { ThemeLaunchOffer } from '@/components/profile/themes/ThemeLaunchOffer';
import { useOwnedProfileThemes } from '@/hooks/user/useProfileThemeClaims';
import { Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Check, Crown, LayoutGrid, Lock, Palette, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { useUserBadges } from '@/hooks/community/useUserBadges';
import { useSaveProfileThemes } from '@/hooks/user/useProfileThemes';
import { useUpdateProfileSettings } from '@/hooks/user/useProfileFeatures';
import { PROFILE_THEMES, canUseProfileTheme } from '@/components/profile/themes/registry';
import { DefaultProfileAppearance } from '@/components/profile/DefaultProfileAppearance';
import { CosmeticAccessBadges } from '@/components/profile/CosmeticAccessBadges';
import { ProfileCosmeticsPicker } from '@/components/profile/ProfileCosmeticsPicker';
import { AvatarDecoration } from '@/components/profile/AvatarDecoration';
import { ProfileCosmeticEffect, ProfileNameplate } from '@/components/profile/ProfileCosmeticEffect';
import { hasPremiumCosmetics } from '@/lib/profileCosmetics';
import { readProfileCustomization } from '@/lib/profileSettings';
import { readThemePreferences, type ThemePreferences } from '@/lib/profileThemes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettingsSheet } from '@/components/profile/ProfileSettingsSheet';
import '@/components/profile/themes/sekaipop/sekaipop.css';
import './profile-store.css';

export function ProfileStorePanel({ section }: { section?: string }) {
  const { profile } = useAuth();
  const { closeSettings } = useSettingsModal();
  const navigate = useNavigate();
  const badges = useUserBadges(profile?.user_id);
  const owned = useOwnedProfileThemes(profile?.user_id);
  const save = useSaveProfileThemes();
  const saveCosmetics = useUpdateProfileSettings();
  const [preferences, setPreferences] = useState(() => readThemePreferences(profile?.app_settings));
  const [editingTheme, setEditingTheme] = useState('sekaipop');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('themes');
  useEffect(() => { if (section === 'music') { setEditingTheme(preferences.selected === 'midnight-lofi' ? 'midnight-lofi' : 'sekaipop'); setTab('customize'); } }, [section, preferences.selected]);
  useEffect(() => { if (!dirty) setPreferences(readThemePreferences(profile?.app_settings)); }, [profile?.app_settings, dirty]);
  const definition = PROFILE_THEMES.find(t => t.id === editingTheme)!;
  const Editor = definition.Editor;
  const entitled = badges.isSuccess && canUseProfileTheme(definition, profile, badges.data ?? [], owned.data);
  const configuration = definition.parse(preferences.configurations[editingTheme]) ?? definition.defaults();
  const updatePreferences = (next: ThemePreferences) => { setPreferences(next); setDirty(true); };
  const persist = async (next: ThemePreferences) => {
    setError('');
    try { await save.mutateAsync(next); setPreferences(next); setDirty(false); toast.success('Profile collection saved.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Please retry.'); }
  };
  const premium = hasPremiumCosmetics(profile, badges.data ?? []);
  const cosmetics = readProfileCustomization(profile, premium);
  const equip = async (patch: Parameters<typeof saveCosmetics.mutateAsync>[0]) => {
    try { await saveCosmetics.mutateAsync(patch); toast.success('Profile cosmetic equipped.'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not equip cosmetic.'); }
  };
  return <div className="profile-store space-y-6">
    {tab !== 'customize' && <header className="profile-store-hero">
      <div className="profile-store-hero-copy"><span className="profile-store-eyebrow"><Sparkles size={13} />TATAKAI · PROFILE SHOP</span><h3>A little more <em>you.</em></h3><p>Build a world around your personality. Discover profile themes, collect the finishing touches, and make every hello yours.</p><div className="profile-store-hero-actions"><Button onClick={() => setTab('cosmetics')}>Explore the collection <ArrowUpRight size={15} /></Button><span><Crown size={13} />{premium ? 'Your collection is unlocked' : 'Discover free & premium looks.'}</span></div></div>
      <div className="profile-store-hero-art" aria-hidden="true"><span className="profile-store-art-star">✦</span><div className="profile-store-identity-card"><ProfileCosmeticEffect effect={cosmetics.profileEffect === 'none' ? 'constellation' : cosmetics.profileEffect} animated={false} /><div className="profile-store-identity-cover" /><span className="profile-store-portrait">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile?.display_name || 'T')[0]}<AvatarDecoration decoration={cosmetics.avatarDecoration === 'none' ? 'celestial' : cosmetics.avatarDecoration} /></span><ProfileNameplate nameplate={cosmetics.nameplate === 'none' ? 'moonstone' : cosmetics.nameplate}><strong>{profile?.display_name || profile?.username || 'Your next look'}</strong></ProfileNameplate><span className="profile-store-art-caption">A world with your name on it.</span></div><span className="profile-store-art-sticker">YOUR NEXT ERA</span></div>
    </header>}
    {tab === 'customize' ?       <section className="profile-store-page space-y-4" aria-label={`${definition.label} customization`}>
        <Button variant="ghost" className="gap-2" onClick={() => setTab('themes')}><ArrowLeft size={15} />Back to themes</Button>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">{definition.label} collection</h3><p className="text-sm text-muted-foreground">{editingTheme === 'default' ? 'Choose an accent and background scene for your original profile.' : editingTheme === 'midnight-lofi' ? 'Set your soundtrack, moonlit accent, and atmosphere.' : editingTheme === 'gothic-empress' ? 'Set the motion and ember intensity of your crimson court.' : 'Arrange widgets, write sticky notes, and choose a wallpaper for your world.'}</p></div>{editingTheme === 'sekaipop' && <Button variant="outline" disabled={!entitled} onClick={() => { closeSettings(); navigate('/profile?customize=1'); }}>Open canvas editor</Button>}</div>
        {editingTheme === 'default' ? <DefaultProfileAppearance custom={cosmetics} entitled={premium} loading={badges.isLoading || saveCosmetics.isPending} onChange={patch => void equip(patch)} /> : entitled && Editor ? <>
          <div className={editingTheme === 'sekaipop' ? 'sp-profile sp-store-editor' : 'profile-store-custom-editor'} data-mode="light" data-motion="true" style={{ '--sp-ink': '#43285f', '--sp-outline': '#43285f', '--sp-a': '#c08cf2', '--sp-b': '#f4b6da', '--sp-paper': '#fbf7ff', '--sp-ring': '#fffdf5', '--sp-board': '#f1e7f6', '--sp-radius': '13px', '--sp-shadow': '4px' } as React.CSSProperties}>
            <Suspense fallback={<p role="status">Opening collection…</p>}><Editor initialSection={section === 'music' ? 'Music' : undefined} configuration={configuration} preferences={preferences} onChange={next => updatePreferences({ ...preferences, configurations: { ...preferences.configurations, [editingTheme]: next } })} onPresets={presets => updatePreferences({ ...preferences, presets })} /></Suspense>
          </div>
          <div className="flex flex-wrap gap-2"><Button disabled={!dirty || save.isPending} onClick={() => void persist(preferences)}>{save.isPending ? 'Saving…' : 'Save customization'}</Button><Button variant="outline" disabled={!dirty || save.isPending} onClick={() => { setPreferences(readThemePreferences(profile?.app_settings)); setDirty(false); }}>Discard changes</Button></div>
        </> : <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">{badges.isLoading ? 'Checking your collection access…' : `${definition.label} customization unlocks with Booster, Premium Pro, Premium Ultra, or Admin.`}</p>}
      </section>
 : <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="profile-store-navigation">
        <TabsTrigger value="themes" className="gap-2"><LayoutGrid size={15} />Profile themes</TabsTrigger>
        <TabsTrigger value="cosmetics" className="gap-2"><Palette size={15} />The collection</TabsTrigger>
      </TabsList>
      <TabsContent value="themes" className="profile-store-page space-y-4 pt-3">
        <ThemeLaunchOffer />
        <div className="profile-store-section-heading"><div><span className="profile-store-eyebrow">CHANGE THE WHOLE SCENE</span><h4>Find your world</h4><p>Every theme is a new way to tell your story.</p></div><span className="profile-store-access-note"><Crown size={14} />Owned themes or Booster / Pro / Ultra / Admin</span></div>
        <div className="grid gap-4 lg:grid-cols-2">{PROFILE_THEMES.map(theme => {
          const locked = !badges.isSuccess || !canUseProfileTheme(theme, profile, badges.data ?? [], owned.data);
          const active = readThemePreferences(profile?.app_settings).selected === theme.id;
          return <article key={theme.id} className={cn('profile-store-theme-card', active ? 'border-primary/60' : 'border-border')}>
            <div className={`profile-store-preview profile-store-preview-${theme.id}`} aria-hidden="true"><span className="profile-store-theme-tag">{theme.id === 'default' ? 'THE ORIGINAL' : theme.id === 'gothic-empress' ? 'THE CRIMSON COURT' : theme.id === 'uchiha' ? 'CRIMSON MOON' : theme.id === 'midnight-lofi' ? 'AFTER HOURS' : theme.id === 'komorebi' ? 'IN THE SUNLIGHT' : 'SCRAPBOOK COLLECTION'}</span><div className="profile-store-mini-avatar" /><div className="profile-store-mini-card"><span /><span /><span /></div><div className="profile-store-mini-note" /><span className="profile-store-preview-title">{theme.label}</span></div>
            <div className="profile-store-theme-details space-y-3"><div className="flex items-center justify-between gap-2"><h4 className="font-bold">{theme.label}</h4>{owned.data?.includes(theme.id) && <span className="profile-store-equipped">Owned forever</span>}{active && <span className="profile-store-equipped"><Check size={13} />Active</span>}{locked && theme.id !== 'default' && <Lock size={14} className="text-muted-foreground" />}</div><p className="min-h-10 text-sm text-muted-foreground">{theme.description}</p><div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={save.isPending || active || (theme.id !== 'default' && locked)} onClick={() => void persist({ ...preferences, selected: theme.id, configurations: theme.id === 'default' ? preferences.configurations : { ...preferences.configurations, [theme.id]: theme.parse(preferences.configurations[theme.id]) ?? theme.defaults() } })}>{active ? 'Equipped' : theme.id !== 'default' && locked ? 'Locked' : 'Equip theme'}</Button>
              {(theme.Editor || theme.id === 'default') && <Button size="sm" variant="outline" disabled={locked} onClick={() => { setEditingTheme(theme.id); setTab('customize'); }}>Customize</Button>}
            </div></div>
            <footer className="profile-store-theme-footer"><span>Access</span><CosmeticAccessBadges badgeKeys={theme.accessBadges ?? []} /></footer>
          </article>;
        })}</div>
      </TabsContent>
      <TabsContent value="cosmetics" className="profile-store-page space-y-4 pt-3">
        <ProfileCosmeticsPicker custom={cosmetics} name={profile?.display_name || profile?.username || 'Player'} avatarUrl={profile?.avatar_url} entitled={premium} loading={badges.isLoading || saveCosmetics.isPending} onDecoration={avatarDecoration => void equip({ avatarDecoration })} onEffect={profileEffect => void equip({ profileEffect })} onNameplate={nameplate => void equip({ nameplate })} />
        <ProfileSettingsSheet trigger={<Button variant="outline">Identity & privacy settings</Button>} overlayClassName="z-[90]" contentClassName="z-[100]" />
      </TabsContent>
    </Tabs>}
    {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
  </div>;
}
