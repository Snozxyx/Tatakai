import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserBadges } from '@/hooks/community/useUserBadges';
import { useOwnedProfileThemes } from '@/hooks/user/useProfileThemeClaims';
import { readThemePreferences } from '@/lib/profileThemes';
import { profileThemeConversation } from '@/lib/profileThemeConversation';
import { resolveProfileTheme } from './registry';
import { useCustomProfileTheme } from '@/hooks/user/useCustomProfileTheme';

export function ProfileConversationTheme({ userId, children }: { userId: string; children: ReactNode }) {
  const profile = useQuery({ queryKey: ['conversation-theme-profile', userId], queryFn: async () => {
    const { data, error } = await supabase.from('profiles').select('user_id,is_public,is_admin,role,app_settings').eq('user_id', userId).eq('is_public', true).maybeSingle();
    if (error) throw error;
    return data;
  }, staleTime: 60_000, refetchInterval: 60_000 });
  const badges = useUserBadges(userId);
  const owned = useOwnedProfileThemes(userId);
  const custom = useCustomProfileTheme(userId, profile.data?.is_public === true);
  const prefs = readThemePreferences(profile.data?.app_settings);
  const theme = resolveProfileTheme(prefs, profile.data, badges.data ?? [], badges.isSuccess && !owned.isLoading, owned.data);
  const customActive = custom.data?.enabled === true && profile.data?.is_public === true;
  const appearance = profile.data?.is_public ? profileThemeConversation(customActive ? 'custom-html' : theme.id, customActive ? custom.data?.css : prefs.configurations[theme.id]) : { style: {} };
  return <div data-conversation-theme={customActive ? 'custom-html' : theme.id} style={appearance.style} className="relative isolate flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background text-foreground">
    {appearance.image && <img src={appearance.image} alt="" className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-10" />}
    {children}
  </div>;
}
