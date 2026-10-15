import { supabase } from '@/integrations/supabase/client';

/** PostgREST caps each response; range paging must continue past that cap. */
export async function fetchAnalyticsRows(
  table: string,
  columns: string,
  from: string,
  to = new Date().toISOString()
) {
  const rows: any[] = [];
  const size = 500;
  for (let offset = 0; ; ) {
    const { data, error } = await supabase
      .from(table as any)
      .select(columns)
      .gte('created_at', from)
      .lt('created_at', to)
      .order('created_at')
      .order('id')
      .range(offset, offset + size - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data?.length) return rows;
    offset += data.length;
  }
}

export function resolveVisitorIdentities(
  visits: {
    visitor_id?: string | null;
    session_id?: string | null;
    user_id?: string | null;
  }[]
) {
  const members = new Map<string, Set<string>>();
  for (const visit of visits) {
    const device = visit.visitor_id || visit.session_id;
    if (device && visit.user_id) {
      const set = members.get(device) || new Set<string>();
      set.add(visit.user_id);
      members.set(device, set);
    }
  }
  return (visit: (typeof visits)[number]) => {
    const device = visit.visitor_id || visit.session_id || '';
    const accounts = members.get(device);
    const user =
      visit.user_id || (accounts?.size === 1 ? [...accounts][0] : null);
    return user ? `u:${user}` : device ? `v:${device}` : '';
  };
}
