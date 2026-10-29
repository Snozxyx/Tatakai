import { DefaultArrival } from './ThemeArrival';
import { readThemePreferences } from '@/lib/profileThemes';
import { PROFILE_THEMES } from './registry';
import type { ThemeLoadingProps } from './types';

export function ProfileThemeLoading({ profile }: { profile?: ThemeLoadingProps['owner'] & { app_settings?: unknown } | null }) {
  const preferences = readThemePreferences(profile?.app_settings);
  const theme = PROFILE_THEMES.find(t => t.id === preferences.selected);
  const Loading = theme?.Loading;
  return Loading && theme ? <Loading owner={profile} configuration={preferences.configurations[theme.id]} /> : <DefaultArrival owner={profile} configuration={{}} />;
}
