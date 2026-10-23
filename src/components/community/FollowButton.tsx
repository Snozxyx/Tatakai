import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

export function FollowButton({ kind, id }: { kind: 'thread' | 'community'; id: string }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const table = kind === 'thread' ? 'thread_follows' : 'community_follows';
  const column = kind === 'thread' ? 'post_id' : 'community_id';
  const key = ['follows', kind, id, user?.id];
  const db = supabase as any;
  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db.from(table).select(column).eq(column, id).eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
  const toggle = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sign in to follow.');
      const { error } = query.data
        ? await db.from(table).delete().eq(column, id).eq('user_id', user.id)
        : await db.from(table).upsert({ [column]: id, user_id: user.id }, { ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: () => toast.error('Could not update following. Please try again.'),
  });
  if (!user) return null;
  const Icon = query.data ? BellOff : Bell;
  return <Button type="button" variant="secondary" size="sm" className="gap-1.5 rounded-full border border-white/10 bg-white/[0.06] text-white backdrop-blur-md hover:bg-white/[0.12]" aria-pressed={!!query.data}
    title={query.data ? `Stop notifications for this ${kind}` : `Get notifications for this ${kind}`}
    disabled={query.isLoading || query.isError || toggle.isPending} onClick={() => toggle.mutate()}>
    <Icon className="h-4 w-4" />{query.isError ? 'Following unavailable' : query.data ? 'Following' : `Follow ${kind}`}
  </Button>;
}
