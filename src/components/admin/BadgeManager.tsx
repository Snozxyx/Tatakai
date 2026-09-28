import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Search, Award, CheckCircle, Lock, UserCircle, Loader2, X, RefreshCw } from 'lucide-react';
import { BADGES, RARITY_STYLES } from '@/lib/badges';

/**
 * Admin panel to grant/revoke badges and trigger auto-recompute for a user.
 * Grants go through the SECURITY DEFINER RPCs (grant_badge/revoke_badge) — the
 * user_badges table has no direct-write RLS policy. admin/mod badges are derived
 * from role flags and are not manually managed here (shown as read-only).
 */
export function BadgeManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<{ user_id: string; display_name: string; username: string; avatar_url: string | null } | null>(null);
  const [note, setNote] = useState('');

  const { data: users = [], isFetching: searchFetching } = useQuery({
    queryKey: ['admin_badge_user_search', search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, username, avatar_url')
        .or(`display_name.ilike.%${search}%,username.ilike.%${search}%`)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: grants = [] } = useQuery({
    queryKey: ['admin_user_badges', selectedUser?.user_id],
    enabled: !!selectedUser,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('user_badges' as any)
        .select('badge_key, source, note')
        .eq('user_id', selectedUser!.user_id)) as any;
      if (error) throw error;
      return (data ?? []) as { badge_key: string; source: string; note: string | null }[];
    },
  });

  const grantByKey = new Map(grants.map((g) => [g.badge_key, g]));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin_user_badges', selectedUser?.user_id] });
    queryClient.invalidateQueries({ queryKey: ['user_badges', selectedUser?.user_id] });
    queryClient.invalidateQueries({ queryKey: ['user_badges_batch'] });
  };

  const grantMutation = useMutation({
    mutationFn: async (badgeKey: string) => {
      const { error } = await supabase.rpc('grant_badge' as any, {
        target_user_id: selectedUser!.user_id,
        p_badge_key: badgeKey,
        p_note: note.trim() || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Badge granted'); setNote(''); },
    onError: (e: any) => toast.error('Grant failed: ' + e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (badgeKey: string) => {
      const { error } = await supabase.rpc('revoke_badge' as any, {
        target_user_id: selectedUser!.user_id,
        p_badge_key: badgeKey,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Badge revoked'); },
    onError: (e: any) => toast.error('Revoke failed: ' + e.message),
  });

  const recomputeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('recompute_user_badges' as any, {
        p_user_id: selectedUser!.user_id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Auto badges recomputed'); },
    onError: (e: any) => toast.error('Recompute failed: ' + e.message),
  });

  const isPending = grantMutation.isPending || revokeMutation.isPending || recomputeMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Award className="w-5 h-5 text-violet-400" />
        <h2 className="text-lg font-bold font-display">Badge Manager</h2>
      </div>

      {/* User search */}
      <GlassPanel className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search user by name or @username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {searchFetching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {users.length > 0 && !selectedUser && (
          <div className="rounded-md border border-border divide-y divide-border">
            {users.map((u) => (
              <button
                key={u.user_id}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                onClick={() => { setSelectedUser(u); setSearch(''); }}
              >
                {u.avatar_url ? (
                  <img src={u.avatar_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                ) : (
                  <UserCircle className="w-7 h-7 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">{u.display_name}</span>
                <span className="text-xs text-muted-foreground">@{u.username}</span>
              </button>
            ))}
          </div>
        )}
      </GlassPanel>

      {selectedUser && (
        <>
          <GlassPanel className="p-4 flex items-center gap-4">
            {selectedUser.avatar_url ? (
              <img src={selectedUser.avatar_url} className="w-10 h-10 rounded-full object-cover" alt="" />
            ) : (
              <UserCircle className="w-10 h-10 text-muted-foreground" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold">{selectedUser.display_name}</div>
              <div className="text-xs text-muted-foreground">@{selectedUser.username}</div>
            </div>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => recomputeMutation.mutate()}>
              <RefreshCw className={cn('w-4 h-4 mr-1', recomputeMutation.isPending && 'animate-spin')} />
              Recompute auto
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedUser(null)}>
              <X className="w-4 h-4" />
            </Button>
          </GlassPanel>

          <GlassPanel className="p-4">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Grant note (optional, attached to next grant)
            </label>
            <Textarea
              rows={2}
              placeholder="e.g. Season 1 event reward"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </GlassPanel>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {BADGES.map((b) => {
              const grant = grantByKey.get(b.key);
              const held = !!grant;
              const isDerived = b.key === 'admin' || b.key === 'mod';
              const rarity = RARITY_STYLES[b.rarity];

              return (
                <GlassPanel
                  key={b.key}
                  className={cn(
                    'p-3 flex flex-col items-center gap-2 text-center relative overflow-hidden',
                    !held && !isDerived && 'opacity-60',
                  )}
                >
                  <div className="absolute top-2 left-2 flex gap-1">
                    {grant?.source === 'auto' && <Badge variant="secondary" className="text-[9px] px-1 py-0">auto</Badge>}
                    {grant?.source === 'admin' && <Badge className="text-[9px] px-1 py-0 bg-amber-500/80">admin</Badge>}
                    {isDerived && <Badge variant="secondary" className="text-[9px] px-1 py-0">role</Badge>}
                  </div>
                  <span className={cn('absolute top-2 right-2 text-[9px] font-bold uppercase', rarity.text)}>{rarity.label}</span>

                  <img src={b.image} alt={b.label} className="w-10 h-10 object-contain mt-2" />

                  <div>
                    <div className="text-xs font-bold leading-tight">{b.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{b.description}</div>
                  </div>

                  <div className="w-full mt-auto pt-1 flex gap-1">
                    {isDerived ? (
                      <span className="flex-1 text-[10px] text-muted-foreground py-1">from role</span>
                    ) : !held ? (
                      <Button size="sm" variant="outline" className="flex-1 h-6 text-[10px]" disabled={isPending}
                        onClick={() => grantMutation.mutate(b.key)}>
                        <CheckCircle className="w-3 h-3 mr-1" /> Grant
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive" className="flex-1 h-6 text-[10px]" disabled={isPending}
                        onClick={() => revokeMutation.mutate(b.key)}>
                        <Lock className="w-3 h-3 mr-1" /> Revoke
                      </Button>
                    )}
                  </div>
                </GlassPanel>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
