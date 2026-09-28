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
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { useFollowList } from '@/hooks/community/useFollow';
import { cn } from '@/lib/utils';

type Tab = 'followers' | 'following';

export default function FollowConnectionsPage() {
  const { username } = useParams<{ username: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();

  const tab: Tab = searchParams.get('tab') === 'following' ? 'following' : 'followers';

  const cleanUsername = (username || '').replace(/^@/, '');

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['profile-by-username', cleanUsername],
    queryFn: async () => {
      if (!cleanUsername) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .eq('username', cleanUsername)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!cleanUsername,
  });

  const { data: list = [], isLoading: loadingList } = useFollowList(profile?.user_id, tab);

  const shellClass = useMemo(
    () =>
      cn(
        'relative z-10 mx-auto max-w-2xl py-4 pb-24 pr-4 md:py-6 md:pb-6 md:pr-6',
        isNative ? 'pl-4' : 'pl-4 md:pl-32',
      ),
    [isNative],
  );

  const setTab = (t: Tab) => setSearchParams(t === 'followers' ? {} : { tab: 'following' });

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Background />
      <Sidebar />

      <main className={shellClass}>
        <button
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mb-5 flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback>{(profile?.display_name || cleanUsername || 'U')[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-display text-xl font-black tracking-tight">
              {profile?.display_name || cleanUsername || 'User'}
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
              {t}
            </button>
          ))}
        </div>

        {loadingProfile || loadingList ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !profile ? (
          <GlassPanel className="p-10 text-center text-muted-foreground">User not found.</GlassPanel>
        ) : list.length === 0 ? (
          <GlassPanel className="p-10 text-center text-muted-foreground">
            {tab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
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
                    <p className="truncate font-semibold">{u.display_name || u.username || 'User'}</p>
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
