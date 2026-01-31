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
        console.log(`[MAL Auth] Incoming Auth Header: ${authHeader ? 'Present' : 'Missing'}`);
        let userId: string | null = null;

        if (authHeader) {
            const token = authHeader.replace("Bearer ", "");
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            if (user) {
                userId = user.id;
                console.log(`[MAL Auth] Authenticated user: ${userId}`);
            } else {
                console.warn(`[MAL Auth] User retrieval failed: ${userError?.message}`);
            }
        }

        const body = await req.json().catch(() => ({}));
        const action = body.action?.trim();
        console.log(`[MAL Auth] Processing action: ${action} for userId: ${userId}`);

        if (action === "exchange") {
            const { code, code_verifier, redirect_uri } = body;
            console.log(`[MAL Auth] Exchanging code... redirect_uri: ${redirect_uri}`);
            console.log(`[MAL Auth] Using Client ID: ${MAL_CLIENT_ID ? MAL_CLIENT_ID.substring(0, 5) + '...' : 'MISSING'}`);

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
                console.error(`[MAL Auth] Exchange failed: ${JSON.stringify(data)}`);
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
                console.log(`[MAL Auth] Tokens stored for user ${userId}`);
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });

        } else if (action === "sync" || action === "fetch_list" || action === "delete") {
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
                console.warn(`[MAL Auth] MAL tokens not found for user ${userId}: ${dbError?.message}`);
                return new Response(JSON.stringify({ error: "MAL not linked" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            let accessToken = profile.mal_access_token;
            const now = new Date();
            const expiresAt = profile.mal_token_expires_at ? new Date(profile.mal_token_expires_at) : null;

            if (expiresAt && now >= expiresAt) {
                console.log(`[MAL Auth] Token expired, refreshing...`);
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
                if (refreshRes.ok) {
                    accessToken = refreshData.access_token;
                    const newExpiresAt = new Date();
                    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + refreshData.expires_in);

                    await supabase.from("profiles").update({
                        mal_access_token: refreshData.access_token,
                        mal_refresh_token: refreshData.refresh_token,
                        mal_token_expires_at: newExpiresAt.toISOString(),
                    }).eq("user_id", userId);
                    console.log("[MAL Auth] Refresh successful");
                } else {
                    console.error(`[MAL Auth] Refresh failed: ${JSON.stringify(refreshData)}`);
                    return new Response(JSON.stringify({ error: "Refresh failed", details: refreshData }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }
            }

            if (action === "sync") {
                const { malId, status, score, numWatchedEpisodes } = body;
                console.log(`[MAL Auth] Syncing MAL ID: ${malId}, Status: ${status}, Ep: ${numWatchedEpisodes}`);

                // Perform update to MAL
                console.log(`[MAL Auth] Updating MAL anime ${malId}...`);
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
                    console.error(`[MAL Auth] MAL Update failed: ${JSON.stringify(malData)}`);
                    return new Response(JSON.stringify({ error: "MAL update failed", details: malData }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                console.log(`[MAL Auth] Successfully synced ${malId}`);
                return new Response(JSON.stringify({ success: true, data: malData }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            } else if (action === "fetch_list") {
                console.log(`[MAL Auth] Fetching user anime list...`);

                const malRes = await fetch("https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status,num_episodes,main_picture,title&limit=1000", {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${accessToken}`,
                    },
                });

                if (!malRes.ok) {
                    const text = await malRes.text();
                    console.error(`[MAL Auth] MAL Fetch List raw error status ${malRes.status}: ${text}`);
                    let malErrorData;
                    try { malErrorData = JSON.parse(text); } catch (e) { malErrorData = { error: text }; }

                    return new Response(JSON.stringify({
                        error: "MAL fetch list failed",
                        details: malErrorData,
                        malStatus: malRes.status
                    }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                const malData = await malRes.json();
                console.log(`[MAL Auth] Successfully fetched ${malData.data?.length || 0} items`);
                return new Response(JSON.stringify({ success: true, data: malData.data }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            } else if (action === "delete") {
                const { malId } = body;
                console.log(`[MAL Auth] Deleting MAL ID: ${malId}`);

                const malRes = await fetch(`https://api.myanimelist.net/v2/anime/${malId}/my_list_status`, {
                    method: "DELETE",
                    headers: {
                        "Authorization": `Bearer ${accessToken}`,
                    },
                });

                if (!malRes.ok && malRes.status !== 404) {
                    const malData = await malRes.json().catch(() => ({}));
                    console.error(`[MAL Auth] MAL Delete failed: ${JSON.stringify(malData)}`);
                    return new Response(JSON.stringify({ error: "MAL delete failed", details: malData }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                console.log(`[MAL Auth] Successfully deleted ${malId}`);
                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
        }

        return new Response(JSON.stringify({ error: "Invalid action" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error(`[MAL Auth] Critical error: ${error.message}`);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
