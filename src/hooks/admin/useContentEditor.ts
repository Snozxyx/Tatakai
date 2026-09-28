import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TATAKAI_API_URL, withClientHeaders, unwrapApiData } from '@/lib/api/api-client';
import { contentGraph } from '@/core/content/content-graph';
import type { TatakaiMedia } from '@/core/content/types';

/**
 * Admin content-editor mutation.
 *
 * PATCHes a catalog item to the TatakaiAPI `/admin/content/:id` route, which
 * verifies the caller's Supabase JWT (profiles.is_admin) and writes to
 * content_items with the service-role client. `id` is either the AniList
 * numeric id or the tatakai uuid — the backend resolves (and creates the row if
 * the item wasn't stored yet). On success we purge the item's cached copies so
 * the info page refetches the edited values.
 */

export interface UpdateContentInput {
  /** AniList numeric id (as string) or tatakai uuid. */
  id: string;
  /** content_items columns → new values (only whitelisted keys are applied). */
  fields: Record<string, unknown>;
  reason?: string;
}

export function useUpdateContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, fields, reason }: UpdateContentInput) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('You must be signed in as an admin to edit content.');

      const res = await fetch(`${TATAKAI_API_URL}/admin/content/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: withClientHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        body: JSON.stringify({ fields, reason }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || `Failed to save (HTTP ${res.status})`);
      }
      return unwrapApiData<TatakaiMedia>(json);
    },
    onSuccess: async (_data, variables) => {
      await contentGraph.purgeMedia(variables.id);
      // Refetch the info pages / feeds that may show the edited item.
      queryClient.invalidateQueries();
    },
  });
}
