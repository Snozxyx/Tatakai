import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, accept',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type',
};

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
      if (response.ok || response.status === 206) return response;
      if (response.status >= 400 && response.status < 500 && response.status !== 429) return response;
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error as Error;
      console.warn(`Fetch attempt ${i + 1} failed:`, error);
    }
    if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 500));
  }
  throw lastError || new Error('Failed to fetch after retries');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');
    const type = url.searchParams.get('type') || 'api';
    const refererParam = url.searchParams.get('referer');
    const debug = url.searchParams.get('debug') === '1';

    if (!targetUrl) return new Response(JSON.stringify({ error: 'Missing url' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let parsedUrl: URL;
    try { parsedUrl = new URL(targetUrl); } catch { return new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Connection': 'keep-alive',
    };

    const rangeHeader = req.headers.get('range');
    if (rangeHeader) fetchHeaders['Range'] = rangeHeader;
    if (refererParam) {
      fetchHeaders['Referer'] = refererParam;
      try { fetchHeaders['Origin'] = new URL(refererParam).origin; } catch { fetchHeaders['Origin'] = parsedUrl.origin; }
    } else {
      fetchHeaders['Referer'] = parsedUrl.origin;
      fetchHeaders['Origin'] = parsedUrl.origin;
    }

    const response = await fetchWithRetry(targetUrl, { method: 'GET', headers: fetchHeaders });
    const passthroughStatus = response.ok || response.status === 206 ? response.status : 200;
    const upstreamContentType = (response.headers.get('content-type') || 'application/octet-stream').toLowerCase();

    // 1. Handle HTML Injection
    if (upstreamContentType.includes('text/html') || upstreamContentType.includes('application/xhtml')) {
      let text = await response.text().catch(() => '');
      text = text.replace(/<meta[^>]+Content-Security-Policy[^>]*>/gi, '<!-- CSP removed -->');
      const protectionScript = `<script>(function(){window.open=()=>({closed:true,focus:()=>{}});Object.defineProperty(document,'onclick',{set:()=>{},get:()=>null,configurable:true});})();</script>`;
      text = text.includes('<head>') ? text.replace('<head>', '<head>' + protectionScript) : protectionScript + text;
      return new Response(text, { status: passthroughStatus, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // 2. Handle Manifest Rewriting
    const isManifestByExt = targetUrl.includes('.m3u8') || upstreamContentType.includes('mpegurl') || upstreamContentType.includes('m3u8');

    if (type === 'video' || type === 'm3u8' || isManifestByExt) {
      const bodyBlob = await response.blob();
      const bodyText = await bodyBlob.text().catch(() => '');
      const isManifestByContent = bodyText.trim().startsWith('#EXTM3U');

      if (isManifestByContent) {
        const proxyBase = new URL(req.url).origin + new URL(req.url).pathname;
        const keyParam = Deno.env.get('SUPABASE_ANON_KEY') ? `&apikey=${encodeURIComponent(Deno.env.get('SUPABASE_ANON_KEY')!)}` : '';
        const refererQuery = refererParam ? `&referer=${encodeURIComponent(refererParam)}` : '';
        const useType = type === 'm3u8' ? 'm3u8' : 'video';

        const rewritten = bodyText.split('\n').map(line => {
          const trimmed = line.trim();
          if (!trimmed || (trimmed.startsWith('#') && !trimmed.includes('URI='))) return line;
          if (trimmed.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (_, uri) => {
              const abs = new URL(uri, targetUrl).href;
              return `URI="${proxyBase}?url=${encodeURIComponent(abs)}&type=${useType}${refererQuery}${keyParam}"`;
            });
          }
          if (!trimmed.startsWith('#')) {
            const abs = new URL(trimmed, targetUrl).href;
            return `${proxyBase}?url=${encodeURIComponent(abs)}&type=${useType}${refererQuery}${keyParam}`;
          }
          return line;
        }).join('\n');

        return new Response(rewritten, { status: passthroughStatus, headers: { ...corsHeaders, 'Content-Type': 'application/vnd.apple.mpegurl' } });
      }

      // 3. Fallthrough for Binary Data (Segments)
      const resHeaders: Record<string, string> = { ...corsHeaders, 'Content-Type': upstreamContentType };
      if (response.headers.get('content-length')) resHeaders['Content-Length'] = response.headers.get('content-length')!;
      if (response.headers.get('content-range')) resHeaders['Content-Range'] = response.headers.get('content-range')!;
      return new Response(await bodyBlob.arrayBuffer(), { status: passthroughStatus, headers: resHeaders });
    }

    // 4. Default JSON/API/Other handling
    const resHeaders: Record<string, string> = { ...corsHeaders, 'Content-Type': upstreamContentType };
    return new Response(response.body, { status: response.status, headers: resHeaders });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
