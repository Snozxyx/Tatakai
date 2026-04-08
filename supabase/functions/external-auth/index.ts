
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const allowedOrigins = new Set(
    (Deno.env.get('ALLOWED_ORIGINS') || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
)

function getCorsHeaders(origin: string | null) {
    const isOriginAllowed = !!origin && (allowedOrigins.size === 0 || allowedOrigins.has(origin))
    const allowOrigin = allowedOrigins.size === 0
        ? (origin || '*')
        : (isOriginAllowed ? origin : 'null')

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Vary': 'Origin',
    }
}

serve(async (req) => {
    const origin = req.headers.get('origin')
    const corsHeaders = getCorsHeaders(origin)

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    if (allowedOrigins.size > 0 && origin && !allowedOrigins.has(origin)) {
        return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    try {
        const body = await req.json()
        const { action, code, redirectUri } = body

        if (action === 'anilist') {
            const ANILIST_CLIENT_ID = Deno.env.get('ANILIST_CLIENT_ID') 
            const ANILIST_CLIENT_SECRET = Deno.env.get('ANILIST_CLIENT_SECRET') 

            if (!ANILIST_CLIENT_ID || !ANILIST_CLIENT_SECRET) {
                console.error('[AniList] Missing ANILIST_CLIENT_ID or ANILIST_CLIENT_SECRET env vars')
                return new Response(JSON.stringify({ error: 'AniList integration not configured on server' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }

            if (!code || !redirectUri) {
                return new Response(JSON.stringify({ error: 'Missing code or redirectUri' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }

            const response = await fetch('https://anilist.co/api/v2/oauth/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    grant_type: 'authorization_code',
                    client_id: ANILIST_CLIENT_ID,
                    client_secret: ANILIST_CLIENT_SECRET,
                    redirect_uri: redirectUri,
                    code: code,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                console.error('AniList Error:', data)
                return new Response(JSON.stringify(data), {
                    status: response.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
