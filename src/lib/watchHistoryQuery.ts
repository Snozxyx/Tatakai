import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export function compareWatchHistory(
  a: { watched_at: string; episode_number: number; id: string },
  b: { watched_at: string; episode_number: number; id: string },
) {
  return Date.parse(b.watched_at) - Date.parse(a.watched_at)
    || b.episode_number - a.episode_number
    || a.id.localeCompare(b.id);
}

/** Range requests avoid PostgREST's response cap, including for explicit limits. */
export async function fetchWatchHistory(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  limit?: number,
  signal?: AbortSignal,
) {
  const rows: Database['public']['Tables']['watch_history']['Row'][] = [];
  if (limit !== undefined && limit <= 0) return rows;
  while (limit === undefined || rows.length < limit) {
    const size = Math.min(500, limit === undefined ? 500 : limit - rows.length);
    let query = client.from('watch_history').select('*').eq('user_id', userId)
      .order('watched_at', { ascending: false })
      .order('episode_number', { ascending: false })
      .order('id', { ascending: true })
      .range(rows.length, rows.length + size - 1);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    // Continue to an empty page even if the server's configured cap is <500.
  }
  return rows;
}
