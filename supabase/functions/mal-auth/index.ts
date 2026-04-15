import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAL_CLIENT_ID = Deno.env.get("MAL_CLIENT_ID")!;
const MAL_CLIENT_SECRET = Deno.env.get("MAL_CLIENT_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim();

    if (action === "exchange") {
      const { code, code_verifier, redirect_uri } = body;

      const tokenParams = new URLSearchParams({
        client_id: MAL_CLIENT_ID,
        client_secret: MAL_CLIENT_SECRET || "",
        grant_type: "authorization_code",
        code,
        code_verifier,
        redirect_uri,
      });

      const res = await fetch("https://myanimelist.net/v1/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      });

      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: "Exchange failed", details: data }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (userId) {
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in);

        await supabase.from("profiles").update({
          mal_access_token: data.access_token,
          mal_refresh_token: data.refresh_token,
          mal_token_expires_at: expiresAt.toISOString(),
        }).eq("user_id", userId);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (
      action !== "sync" &&
      action !== "fetch_list" &&
      action !== "delete" &&
      action !== "sync_manga" &&
      action !== "fetch_manga_list" &&
      action !== "delete_manga"
    ) {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: dbError } = await supabase
      .from("profiles")
      .select("mal_access_token, mal_refresh_token, mal_token_expires_at")
      .eq("user_id", userId)
      .single();

    if (dbError || !profile?.mal_access_token) {
      return new Response(JSON.stringify({ error: "MAL not linked" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = profile.mal_access_token;
    const now = new Date();
    const expiresAt = profile.mal_token_expires_at ? new Date(profile.mal_token_expires_at) : null;

    if (expiresAt && now >= expiresAt) {
      const refreshParams = new URLSearchParams({
        client_id: MAL_CLIENT_ID,
        client_secret: MAL_CLIENT_SECRET || "",
        grant_type: "refresh_token",
        refresh_token: profile.mal_refresh_token,
      });

      const refreshRes = await fetch("https://myanimelist.net/v1/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: refreshParams.toString(),
      });

      const refreshData = await refreshRes.json();
      if (!refreshRes.ok) {
        return new Response(JSON.stringify({ error: "Refresh failed", details: refreshData }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      accessToken = refreshData.access_token;
      const newExpiresAt = new Date();
      newExpiresAt.setSeconds(newExpiresAt.getSeconds() + refreshData.expires_in);

      await supabase.from("profiles").update({
        mal_access_token: refreshData.access_token,
        mal_refresh_token: refreshData.refresh_token,
        mal_token_expires_at: newExpiresAt.toISOString(),
      }).eq("user_id", userId);
    }

    if (action === "sync") {
      const { malId, status, score, numWatchedEpisodes } = body;
      const updateParams = new URLSearchParams();
      updateParams.append("status", status);
      if (score !== undefined) updateParams.append("score", String(score));
      if (numWatchedEpisodes !== undefined) updateParams.append("num_watched_episodes", String(numWatchedEpisodes));

      const malRes = await fetch(`https://api.myanimelist.net/v2/anime/${malId}/my_list_status`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: updateParams.toString(),
      });

      const malData = await malRes.json();
      if (!malRes.ok) {
        return new Response(JSON.stringify({ error: "MAL update failed", details: malData }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, data: malData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_manga") {
      const { malId, status, score, numReadChapters } = body;
      const updateParams = new URLSearchParams();
      updateParams.append("status", status);
      if (score !== undefined) updateParams.append("score", String(score));
      if (numReadChapters !== undefined) updateParams.append("num_chapters_read", String(numReadChapters));

      const malRes = await fetch(`https://api.myanimelist.net/v2/manga/${malId}/my_list_status`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: updateParams.toString(),
      });

      const malData = await malRes.json();
      if (!malRes.ok) {
        return new Response(JSON.stringify({ error: "MAL manga update failed", details: malData }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, data: malData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "fetch_list") {
      const malRes = await fetch("https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status,num_episodes,main_picture,title&limit=1000", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      if (!malRes.ok) {
        const text = await malRes.text();
        let malErrorData;
        try { malErrorData = JSON.parse(text); } catch { malErrorData = { error: text }; }

        return new Response(JSON.stringify({
          error: "MAL fetch list failed",
          details: malErrorData,
          malStatus: malRes.status,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const malData = await malRes.json();
      return new Response(JSON.stringify({ success: true, data: malData.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "fetch_manga_list") {
      const malRes = await fetch("https://api.myanimelist.net/v2/users/@me/mangalist?fields=list_status,num_chapters,main_picture,title&limit=1000", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      if (!malRes.ok) {
        const text = await malRes.text();
        let malErrorData;
        try { malErrorData = JSON.parse(text); } catch { malErrorData = { error: text }; }

        return new Response(JSON.stringify({
          error: "MAL fetch manga list failed",
          details: malErrorData,
          malStatus: malRes.status,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const malData = await malRes.json();
      return new Response(JSON.stringify({ success: true, data: malData.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { malId } = body;

      const malRes = await fetch(`https://api.myanimelist.net/v2/anime/${malId}/my_list_status`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      if (!malRes.ok && malRes.status !== 404) {
        const malData = await malRes.json().catch(() => ({}));
        return new Response(JSON.stringify({ error: "MAL delete failed", details: malData }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { malId } = body;
    const malRes = await fetch(`https://api.myanimelist.net/v2/manga/${malId}/my_list_status`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!malRes.ok && malRes.status !== 404) {
      const malData = await malRes.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: "MAL manga delete failed", details: malData }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
