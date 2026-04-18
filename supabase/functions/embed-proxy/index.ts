import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      if (response.ok) return response;
      if (response.status === 403 || response.status === 404) return response; // Don't retry these
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
  throw lastError;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const urlArr = new URL(req.url);
    const targetUrl = urlArr.searchParams.get('url');
    const refererParam = urlArr.searchParams.get('referer');
    const userAgentParam = urlArr.searchParams.get('userAgent');

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let parsedTarget: URL;
    try {
      parsedTarget = new URL(targetUrl);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid target url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the embed page
    const response = await fetchWithRetry(targetUrl, {
      headers: {
        'User-Agent': userAgentParam || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': refererParam || (parsedTarget.origin + '/'),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch: ${response.status}`, url: targetUrl }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const contentType = response.headers.get('content-type') || 'text/html';
    const finalUrl = new URL(response.url);

    let body: string | ArrayBuffer;

    if (contentType.includes('text') || contentType.includes('html') || contentType.includes('javascript')) {
      let text = await response.text();

      // Inject <base> tag for HTML content to fix relative paths
      if (contentType.includes('html')) {
        const baseHref = finalUrl.origin + finalUrl.pathname;
        const baseTag = `<base href="${baseHref}">`;

        if (text.includes('<head>')) {
          text = text.replace('<head>', `<head>\n    ${baseTag}`);
        } else if (text.includes('<HEAD>')) {
          text = text.replace('<HEAD>', `<HEAD>\n    ${baseTag}`);
        } else if (text.includes('<html>')) {
          text = text.replace('<html>', `<html>\n<head>${baseTag}</head>`);
        } else if (text.includes('<HTML>')) {
          text = text.replace('<HTML>', `<HTML>\n<HEAD>${baseTag}</HEAD>`);
        } else {
          text = `<head>${baseTag}</head>\n${text}`;
        }
      }
      body = text;
    } else {
      body = await response.arrayBuffer();
    }

    // Explicitly remove X-Frame-Options to allow framing from any origin
    // Supabase might inject its own, so we set a permissive CSP as well
    const newHeaders = new Headers({
      ...corsHeaders,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Content-Security-Policy': "frame-ancestors *",
      'Referrer-Policy': 'no-referrer',
    });

    return new Response(body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (error: unknown) {
    console.error('Embed proxy error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
