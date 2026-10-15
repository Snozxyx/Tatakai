import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TATAKAI_API_URL, withClientHeaders, unwrapApiData } from '@/lib/api/api-client';

/**
 * Admin "publish news" mutation.
 *
 * News posts are authored by the Tatakai News bot (NEWS_BOT_USER_ID), which a
 * browser can't do under RLS — so we POST to the TatakaiAPI `/admin/news`
 * route, which verifies the caller's Supabase JWT server-side (profiles.is_admin)
 * and writes the forum_posts row with the service-role client. We send the live
 * access token as a Bearer header; there is NO client-shipped admin secret.
 */

export interface CreateNewsInput {
  title: string;
  content: string;
  excerpt?: string;
  image_url?: string;
  /** Optional source article URL — sets content_type=link and the dedup key. */
  link?: string;
  source?: string;
  tags?: string[];
  published_at?: string;
  is_pinned?: boolean;
}

export function useCreateNews() {
  useUiTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateNewsInput) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error(uiI18n.t('app.you_must_be_signed_in_as_an_admin_to_publish_new_ba92a265'));

      const res = await fetch(`${TATAKAI_API_URL}/admin/news`, {
        method: 'POST',
        headers: withClientHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        body: JSON.stringify(input),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || `Failed to publish (HTTP ${res.status})`);
      }
      return unwrapApiData<any>(json);
    },
    onSuccess: () => {
      // The News tab and For You feed both read forum_posts flair='News'.
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
