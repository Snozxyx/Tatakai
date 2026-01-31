import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, User, Globe, Loader2, Activity, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function AnalyticsActiveUsers() {
    // We define "Active" as seen in the last 5 minutes
    const activeThreshold = new Date(Date.now() - 300000).toISOString();

    // Fetch active logged in users
    const { data: activeUsers, isLoading: loadingUsers } = useQuery({
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
        refetchInterval: 30000 // Refresh every 30 seconds
    });

    // Fetch count of active guests via events
    const { data: activeGuestsCount, isLoading: loadingGuests } = useQuery({
        queryKey: ['active_guests_count'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('analytics_events')
                .select('metadata')
                .eq('event_type', 'guest_heartbeat')
                .gt('created_at', activeThreshold);

            if (error) throw error;

            // Deduplicate by guest_id in metadata
            const uniqueGuests = new Set(data.map(e => (e.metadata as any)?.guest_id));
            return uniqueGuests.size;
        },
        refetchInterval: 30000
    });

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GlassPanel className="p-6 border-primary/20 bg-primary/5">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-primary/20 text-primary">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-3xl font-black">{activeUsers?.length || 0}</p>
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Active Members</p>
                        </div>
                    </div>
                </GlassPanel>

                <GlassPanel className="p-6 border-white/10 bg-white/5">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400">
                            <Globe className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-3xl font-black">{activeGuestsCount || 0}</p>
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Guest Sessions</p>
                        </div>
                    </div>
                </GlassPanel>
            </div>

            <GlassPanel className="p-6">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    Live User Activity
                </h3>

                {loadingUsers ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : activeUsers && activeUsers.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {activeUsers.map((user) => (
                            <div key={user.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group">
                                <Avatar className="w-10 h-10 ring-2 ring-primary/20">
                                    <AvatarImage src={user.avatar_url || ''} />
                                    <AvatarFallback className="bg-primary/20 text-primary font-bold text-xs">
                                        {user.display_name?.[0] || 'U'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm truncate">{user.display_name || 'Anonymous'}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">
                                        {formatDistanceToNow(new Date(user.last_seen || ''), { addSuffix: true })}
                                    </p>
                                </div>
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-3xl">
                        <p className="text-muted-foreground text-sm">No registered users currently active.</p>
                    </div>
                )}
            </GlassPanel>
        </div>
    );
}
