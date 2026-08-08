import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow POST or scheduled invocations (Supabase cron sends POST)
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const now = new Date().toISOString();

    // -------------------------------------------------------------------------
    // Step 1: Find user_ids in ban_history where the ban has expired but not
    //         yet been marked as unbanned. These are the users whose profile
    //         ban fields need to be cleared.
    // -------------------------------------------------------------------------
    const { data: expiredBanRows, error: selectError } = await supabase
      .from('ban_history')
      .select('user_id')
      .is('unbanned_at', null)
      .not('expires_at', 'is', null)
      .lt('expires_at', now);

    if (selectError) {
      console.error('[expire-bans] Failed to query expired bans:', selectError);
      return new Response(
        JSON.stringify({ success: false, error: selectError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const expiredUserIds: string[] = expiredBanRows
      ? [...new Set(expiredBanRows.map((row: { user_id: string }) => row.user_id))]
      : [];

    console.log(`[expire-bans] Found ${expiredUserIds.length} user(s) with expired bans`);

    let profilesUpdated = 0;
    let historyUpdated = 0;

    if (expiredUserIds.length > 0) {
      // -----------------------------------------------------------------------
      // Step 2 (Statement 1): Clear ban fields on profiles for expired bans.
      //
      //   UPDATE public.profiles
      //   SET is_banned = false, banned_at = NULL, banned_by = NULL, ban_reason = NULL
      //   WHERE is_banned = true
      //     AND id IN (<expiredUserIds>);
      // -----------------------------------------------------------------------
      const { error: profilesError, count: profilesCount } = await supabase
        .from('profiles')
        .update({
          is_banned: false,
          banned_at: null,
          banned_by: null,
          ban_reason: null,
        })
        .eq('is_banned', true)
        .in('id', expiredUserIds);

      if (profilesError) {
        console.error('[expire-bans] Failed to clear profile ban fields:', profilesError);
        return new Response(
          JSON.stringify({ success: false, error: profilesError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      profilesUpdated = profilesCount ?? expiredUserIds.length;
      console.log(`[expire-bans] Cleared ban fields on ${profilesUpdated} profile(s)`);
    }

    // -------------------------------------------------------------------------
    // Step 3 (Statement 2): Mark expired ban_history rows as unbanned.
    //
    //   UPDATE public.ban_history
    //   SET unbanned_at = now(), unbanned_by = NULL
    //   WHERE unbanned_at IS NULL
    //     AND expires_at IS NOT NULL
    //     AND expires_at < now();
    // -------------------------------------------------------------------------
    const { error: historyError, count: historyCount } = await supabase
      .from('ban_history')
      .update({ unbanned_at: now, unbanned_by: null })
      .is('unbanned_at', null)
      .not('expires_at', 'is', null)
      .lt('expires_at', now);

    if (historyError) {
      console.error('[expire-bans] Failed to update ban_history rows:', historyError);
      return new Response(
        JSON.stringify({ success: false, error: historyError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    historyUpdated = historyCount ?? 0;
    console.log(`[expire-bans] Marked ${historyUpdated} ban_history row(s) as unbanned`);

    return new Response(
      JSON.stringify({
        success: true,
        expiredUserCount: expiredUserIds.length,
        profilesCleared: profilesUpdated,
        banHistoryMarked: historyUpdated,
        processedAt: now,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('[expire-bans] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
