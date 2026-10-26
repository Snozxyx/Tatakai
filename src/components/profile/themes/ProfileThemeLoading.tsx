import { readThemePreferences } from '@/lib/profileThemes';
import { PROFILE_THEMES } from './registry';
import type { ThemeLoadingProps } from './types';

export function ProfileThemeLoading({ profile }: { profile?: ThemeLoadingProps['owner'] & { app_settings?: unknown } | null }) {
  const preferences = readThemePreferences(profile?.app_settings);
  const theme = PROFILE_THEMES.find(t => t.id === preferences.selected);
  const Loading = theme?.Loading;
  return Loading && theme ? <Loading owner={profile} configuration={preferences.configurations[theme.id]} /> : <div className="min-h-screen bg-background text-muted-foreground grid place-items-center" role="status" aria-live="polite">Loading profile…</div>;
}
