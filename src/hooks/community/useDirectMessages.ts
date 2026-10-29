import { useEffect } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { DirectConversation, DirectMessage } from '@/lib/directMessages';
import { sanitizeEmbeds } from '@/lib/commentEmbeds';
const db = supabase as any;
export function useDirectConversations(enabled = true) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const query = useQuery<DirectConversation[]>({
    queryKey: ['direct-conversations', user?.id], enabled: !!user && enabled, refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await db.from('direct_conversations').select('*').or(`user_a.eq.${user!.id},user_b.eq.${user!.id}`).order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!user || !enabled) return;
    const refresh = () => {
      void cache.invalidateQueries({ queryKey: ['direct-conversations', user.id] });
      void cache.invalidateQueries({ queryKey: ['direct-unread', user.id] });
    };
    const channel = supabase.channel(`direct-inbox:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_conversations', filter: `user_a=eq.${user.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_conversations', filter: `user_b=eq.${user.id}` }, refresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    return () => { void supabase.removeChannel(channel); };
  }, [user, cache, enabled]);
  return query;
}
export function useDirectMessageHistory(conversationId?: string, enabled = true) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['direct-messages', user?.id, conversationId], enabled: !!user && !!conversationId && enabled,
    initialPageParam: null as number | null, refetchInterval: 30_000,
    queryFn: async ({ pageParam }): Promise<DirectMessage[]> => {
      let q = db.from('direct_messages').select('*').eq('conversation_id', conversationId).order('seq', { ascending: false }).limit(40);
      if (pageParam != null) q = q.lt('seq', pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((message: DirectMessage) => ({ ...message, attachments: Array.isArray(message.attachments) ? message.attachments.slice(0, 4) : [], embeds: sanitizeEmbeds(message.embeds) }));
    },
    getNextPageParam: last => last.length === 40 ? last[last.length - 1].seq : undefined,
  });
  useEffect(() => {
    if (!user || !conversationId || !enabled) return;
    const channel = supabase.channel(`direct-history:${user.id}:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` }, () => {
        void cache.invalidateQueries({ queryKey: ['direct-messages', user.id, conversationId] });
      }).subscribe(status => { if (status === 'SUBSCRIBED') void cache.invalidateQueries({ queryKey: ['direct-messages', user.id, conversationId] }); });
    return () => { void supabase.removeChannel(channel); };
  }, [user, conversationId, cache, enabled]);
  return query;
}
export function useDirectUnread() {
  const { user } = useAuth();
  return useQuery<number>({
    queryKey: ['direct-unread', user?.id], enabled: !!user, refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_direct_unread');
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}
