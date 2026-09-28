import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TATAKAI_API_URL, withClientHeaders, unwrapApiData } from '@/lib/api/api-client';

/**
 * Admin news management — list / refresh / pin / delete of the bot-authored
 * News posts. These all go through the JWT-guarded TatakaiAPI `/admin/news`
 * routes because bot-owned forum_posts rows can't be read-for-management,
 * edited, or deleted from the browser under RLS. Auth = the admin's live
 * Supabase access token as a Bearer header (no client-shipped secret).
 */

export interface AdminNewsPost {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  is_pinned: boolean;
  created_at: string;
  metadata: {
    source?: string;
    news_url?: string | null;
    news_link?: string;
    tags?: string[];
    excerpt?: string | null;
    manual?: boolean;
    published_at?: string;
  } | null;
}

export interface NewsRefreshResult {
  aggregated: number;
  inserted: number;
  existing: number;
  purged: number;
}

/** Bearer-authed fetch against a `/admin/news` sub-path; unwraps the envelope. */
async function adminNewsFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('You must be signed in as an admin.');

  const res = await fetch(`${TATAKAI_API_URL}/admin/news${path}`, {
    ...init,
    headers: withClientHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Request failed (HTTP ${res.status})`);
  return unwrapApiData<T>(json);
}

/** Recent bot-authored News posts (pinned first, then newest). */
export function useNewsPosts(page = 1, limit = 30) {
  return useQuery({
    queryKey: ['admin-news', page, limit],
    queryFn: () => adminNewsFetch<AdminNewsPost[]>(`?page=${page}&limit=${limit}`),
  });
}

/** Run one ingestion pass now (pull upstream sources → insert new stories). */
export function useRefreshNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminNewsFetch<NewsRefreshResult>('/refresh', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-news'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

/** Pin / unpin a News post. */
export function useSetNewsPinned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; is_pinned: boolean }) =>
      adminNewsFetch<{ id: string; is_pinned: boolean }>(`/${args.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_pinned: args.is_pinned }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-news'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

/** Delete a News post. */
export function useDeleteNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminNewsFetch<{ id: string }>(`/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-news'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
