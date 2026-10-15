import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, Globe, Loader2, Activity, ExternalLink, Radio } from "lucide-react";
import { formatDistanceToNow } from '@/lib/localeFormat';
import { useOnlinePresence } from "@/hooks/api/usePresence";

const GA4_REALTIME_URL = "https://analytics.google.com/analytics/web/#/reports/realtime";

/**
 * Live users, powered by Supabase Realtime presence (`tky-online`):
 * join/leave updates arrive instantly instead of the old 30s poll over a
 * 5-minute `last_seen` window. Clients track on navigation + heartbeat while
 * the tab is visible; backgrounded tabs fall back to the `last_seen` query
 * below so they are still counted, just marked as idle.
 */
export function AnalyticsActiveUsers() {
  useUiTranslation();
    const live = useOnlinePresence(true);

    const liveUserIds = useMemo(
        () => live.filter((e) => e.user_id).map((e) => e.user_id as string),
        [live],
    );

    // Resolve member profiles for live user_ids (names/avatars).
    const { data: liveProfiles } = useQuery({
        queryKey: ['live_presence_profiles', liveUserIds.join(',')],
        queryFn: async () => {
            if (liveUserIds.length === 0) return [];
            const { data, error } = await supabase
                .from('profiles')
                .select('user_id, display_name, avatar_url, username')
                .in('user_id', liveUserIds);
            if (error) throw error;
            return data;
        },
        enabled: liveUserIds.length > 0,
        staleTime: 60_000,
    });

    // Fallback: members seen in the last 5 minutes (catches backgrounded tabs
    // whose presence heartbeat paused, plus clients on older builds).
    const activeThreshold = new Date(Date.now() - 300000).toISOString();
    const { data: recentlySeen, isLoading: loadingFallback } = useQuery({
        queryKey: ['active_users_list'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, user_id, display_name, avatar_url, username, last_seen')
                .gt('last_seen', activeThreshold)
                .order('last_seen', { ascending: false });
            if (error) throw error;
            return data;
        },
        refetchInterval: 60_000,
    });

    const profileByUserId = useMemo(() => {
        const m = new Map<string, { display_name?: string | null; avatar_url?: string | null; username?: string | null }>();
        (liveProfiles || []).forEach((p) => m.set(p.user_id, p));
        return m;
    }, [liveProfiles]);

    const liveMembers = live.filter((e) => e.user_id);
    const liveGuests = live.length - liveMembers.length;
    const fallbackOnly =
        (recentlySeen || []).filter((u) => !live.some((e) => e.user_id === u.user_id));

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <GlassPanel className="p-6 border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400">
                            <Radio className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-3xl font-black flex items-center gap-2">
                                {live.length}
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            </p>
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{uiI18n.t('app.live_right_now_12d15775')}</p>
                        </div>
                    </div>
                </GlassPanel>

                <GlassPanel className="p-6 border-primary/20 bg-primary/5">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-primary/20 text-primary">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-3xl font-black">{liveMembers.length}</p>
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{uiI18n.t('app.live_members_76db116a')}</p>
                        </div>
                    </div>
                </GlassPanel>

                <GlassPanel className="p-6 border-white/10 bg-white/5">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400">
                            <Globe className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-3xl font-black">{liveGuests}</p>
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{uiI18n.t('app.live_guests_022344a7')}</p>
                        </div>
                    </div>
                </GlassPanel>
            </div>

            <GlassPanel className="p-6">
                <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" />
                        {uiI18n.t('app.live_user_activity_8ee3a8a1')}
                    </h3>
                    <a
                        href={GA4_REALTIME_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-muted-foreground hover:text-primary flex items-center gap-1"
                    >
                        {uiI18n.t('app.open_ga4_realtime_58369591')} <ExternalLink className="w-3 h-3" />
                    </a>
                </div>

                {live.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {live.map((entry) => {
                            const prof = entry.user_id ? profileByUserId.get(entry.user_id) : undefined;
                            const name = prof?.display_name || prof?.username || (entry.user_id ? 'Member' : 'Guest');
                            return (
                                <div key={entry.session_id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all">
                                    <Avatar className="w-10 h-10 ring-2 ring-emerald-500/30">
                                        <AvatarImage src={prof?.avatar_url || ''} />
                                        <AvatarFallback className="bg-emerald-500/20 text-emerald-300 font-bold text-xs">
                                            {name?.[0]?.toUpperCase() || 'G'}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm truncate">{name}</p>
                                        <p className="text-[11px] text-muted-foreground truncate font-mono">{entry.page_path}</p>
                                        <p className="text-[10px] text-muted-foreground">
                                            {formatDistanceToNow(new Date(entry.online_at), { addSuffix: true, includeSeconds: true })}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        {entry.user_id
                                            ? <Badge variant="outline" className="text-[9px] px-1.5 py-0">{uiI18n.t('app.member_6467baa3')}</Badge>
                                            : <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{uiI18n.t('app.guest_35675e68')}</Badge>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-3xl">
                        {loadingFallback
                            ? <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                            : <p className="text-muted-foreground text-sm">{uiI18n.t('app.no_live_tabs_right_now_presence_connects_when_a__f60e2f26')}</p>}
                    </div>
                )}

                {fallbackOnly.length > 0 && (
                    <div className="mt-6">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                            {uiI18n.t('app.recently_active_backgrounded_tabs_last_5_min_3cc8b66d')} {fallbackOnly.length}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70">
                            {fallbackOnly.slice(0, 9).map((user) => (
                                <div key={user.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
                                    <Avatar className="w-10 h-10">
                                        <AvatarImage src={user.avatar_url || ''} />
                                        <AvatarFallback className="bg-primary/20 text-primary font-bold text-xs">
                                            {user.display_name?.[0] || 'U'}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm truncate">{user.display_name || uiI18n.t('app.anonymous_9bed5104')}</p>
                                        <p className="text-[10px] text-muted-foreground truncate">
                                            {user.last_seen ? formatDistanceToNow(new Date(user.last_seen), { addSuffix: true }) : uiI18n.t('app.recently_fd92cc85')}
                                        </p>
                                    </div>
                                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </GlassPanel>
        </div>
    );
}
