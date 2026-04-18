import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get('url');
    if (!target) return new Response('No URL', { status: 400 });

    const res = await fetch(target);
    const text = await res.text();

    // DISGUISE AS VIDEO TO SEE IF CSP IS BYPASSED
    return new Response(text, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'video/mp4', 
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': 'frame-ancestors *',
        'X-Debug-Type': 'disguised-html'
      }
    });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
});
