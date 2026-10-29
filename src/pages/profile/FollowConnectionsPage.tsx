import { readThemePreferences } from '@/lib/profileThemes';
import { resolveProfileTheme } from '@/components/profile/themes/registry';
import { useUserBadges } from '@/hooks/community/useUserBadges';
import { useOwnedProfileThemes } from '@/hooks/user/useProfileThemeClaims';
import { paletteFromSeed, paletteStyles, profilePalettes } from '@/components/profile/themes/theme-palette';
import { readFrostedConfig } from '@/components/profile/themes/frosted-blast/config';
import { useProfileChrome } from '@/components/profile/themes/profile-chrome';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
/**
 * Followers / Following lists (docs/Plans.md §5 "Social Connections → navigates
 * to dedicated pages on click"). One page, two tabs, reached as
 * `/social/:username?tab=followers|following`.
 */
import { useMemo } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Users, UserPlus } from 'lucide-react';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { useFollowList } from '@/hooks/community/useFollow';
import { cn } from '@/lib/utils';

type Tab = 'followers' | 'following';

export default function FollowConnectionsPage() {
  useUiTranslation();
  const { username } = useParams<{ username: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isDesktopApp = useIsDesktopApp();

  const tab: Tab = searchParams.get('tab') === 'following' ? 'following' : 'followers';

  const cleanUsername = (username || '').replace(/^@/, '');

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['profile-by-username', cleanUsername],
    queryFn: async () => {
      if (!cleanUsername) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, app_settings, is_admin, role')
        .eq('username', cleanUsername)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!cleanUsername,
  });

  const badges=useUserBadges(profile?.user_id);const owned=useOwnedProfileThemes(profile?.user_id);
  const preferences=readThemePreferences(profile?.app_settings);const theme=resolveProfileTheme(preferences,profile,badges.data??[],badges.isSuccess,owned.data);
  const custom=theme.id==='frosted-blast'?readFrostedConfig(preferences.configurations[theme.id]):null;
  const palette=custom?paletteFromSeed(custom.seed):profilePalettes[theme.id]||profilePalettes['eyes-toward-heaven'];
  useProfileChrome(palette,theme.id);
  const { data: list = [], isLoading: loadingList } = useFollowList(profile?.user_id, tab);

  const shellClass = useMemo(
    () =>
      cn(
        'relative z-10 mx-auto max-w-2xl py-4 pb-24 pr-4 md:py-6 md:pb-6 md:pr-6',
        isDesktopApp ? 'pl-4' : 'pl-4 md:pl-32',
      ),
    [isDesktopApp],
  );

  const setTab = (t: Tab) => setSearchParams(t === 'followers' ? {} : { tab: 'following' });

  return (
    <div className="pt-follow-page min-h-screen overflow-x-hidden" style={theme.id!=='default'?{...paletteStyles(palette),background:palette.background,color:palette.ink}:undefined}>
      {theme.id==='default' && <Background />}
      <Sidebar />

      <main className={shellClass}>
        <button
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {uiI18n.t('app.back_b52b36b7')}
        </button>

        <div className="mb-5 flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback>{(profile?.display_name || cleanUsername || 'U')[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-display text-xl font-black tracking-tight">
              {profile?.display_name || cleanUsername || uiI18n.t('app.user_9f8a2389')}
            </h1>
            {profile?.username && <p className="text-sm text-muted-foreground">@{profile.username}</p>}
          </div>
        </div>

        <div className="mb-4 flex rounded-lg bg-muted/40 p-1">
          {(['followers', 'following'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold capitalize transition-colors',
                tab === t ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'followers' ? <Users className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {uiI18n.t(({"followers":"app.followers_09322a11","following":"app.following_6cbf68c5"})[t])}
            </button>
          ))}
        </div>

        {loadingProfile || loadingList ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !profile ? (
          <GlassPanel className="p-10 text-center text-muted-foreground">{uiI18n.t('app.user_not_found_9c986a39')}</GlassPanel>
        ) : list.length === 0 ? (
          <GlassPanel className="p-10 text-center text-muted-foreground">
            {tab === 'followers' ? uiI18n.t('app.no_followers_yet_ebdc1c64') : uiI18n.t('app.not_following_anyone_yet_88798663')}
          </GlassPanel>
        ) : (
          <div className="space-y-2">
            {list.map((u) => (
              <GlassPanel key={u.user_id} className="p-3">
                <Link
                  to={u.username ? `/@${u.username}` : '#'}
                  className={cn('flex items-center gap-3', !u.username && 'pointer-events-none')}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={u.avatar_url || undefined} />
                    <AvatarFallback>{(u.display_name || u.username || 'U')[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{u.display_name || u.username || uiI18n.t('app.user_9f8a2389')}</p>
                    {u.username && <p className="truncate text-xs text-muted-foreground">@{u.username}</p>}
                  </div>
                </Link>
              </GlassPanel>
            ))}
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
