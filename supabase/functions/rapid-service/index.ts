import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, accept',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type',
};

// Retry fetch with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });
      
      // Return if successful or if it's a range response
      if (response.ok || response.status === 206) {
        return response;
      }
      
      // Don't retry 4xx errors except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }
      
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error as Error;
      console.warn(`Fetch attempt ${i + 1} failed:`, error);
    }
    
    // Wait before retry with exponential backoff
    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 500));
    }
  }
  
  throw lastError || new Error('Failed to fetch after retries');
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');
    const type = url.searchParams.get('type') || 'api';
    const refererParam = url.searchParams.get('referer');
    const debug = url.searchParams.get('debug') === '1';
    const inspectHeaders = url.searchParams.get('inspect') === '1';

    // If requested, return incoming request headers and parsed params for debugging
    if (debug && inspectHeaders) {
      const incoming: Record<string, string | null> = {};
      for (const [k, v] of req.headers) incoming[k] = v;
      return new Response(JSON.stringify({
        incomingHeaders: incoming,
        targetUrl: targetUrl || null,
        type,
        refererParam
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!targetUrl) {
      console.error('Missing url parameter');
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Proxying ${type} request for:`, targetUrl.substring(0, 100) + '...');

    // Build request headers
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': type === 'api' ? 'application/json' : '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
    };

    // Forward range header for video streaming
    const rangeHeader = req.headers.get('range');
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    // Add referer for sources that require it
    if (refererParam) {
      try {
        const refererUrl = new URL(refererParam);
        fetchHeaders['Referer'] = refererParam;
        fetchHeaders['Origin'] = refererUrl.origin;
      } catch {
        // Use target URL origin as fallback
        fetchHeaders['Referer'] = parsedUrl.origin;
        fetchHeaders['Origin'] = parsedUrl.origin;
      }
    } else {
      // Default referer to source origin
      fetchHeaders['Referer'] = parsedUrl.origin;
      fetchHeaders['Origin'] = parsedUrl.origin;
    }

    const response = await fetchWithRetry(targetUrl, {
      method: 'GET',
      headers: fetchHeaders,
    });

    // Always stream video responses (including manifests) with our CORS headers to avoid browser-level CORS blocks
    if (type === 'video') {
      const upstreamContentType = response.headers.get('content-type') || 'application/octet-stream';
      const isManifest = targetUrl.includes('.m3u8') || upstreamContentType.includes('mpegurl') || upstreamContentType.includes('m3u8');
      // Normalize status: if upstream blocked with 403/404 but delivered a body, serve 200 so HLS can still parse it
      const passthroughStatus = response.ok || response.status === 206 ? response.status : 200;

      if (isManifest) {
        const text = await response.text().catch(() => '');

        // If the body is clearly not a manifest (e.g., Cloudflare HTML), propagate original status to force failover
        if (!text.includes('#EXTM3U')) {
          const failStatus = response.status || 502;
          return new Response(text || '', {
            status: failStatus,
            headers: {
              ...corsHeaders,
              'Content-Type': upstreamContentType || 'text/plain',
            },
          });
        }

        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || (new URL(req.url)).origin;
        const proxyBase = supabaseUrl.replace(/\/+$/, '') + '/functions/v1/rapid-service';
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const keyParam = anonKey ? `&apikey=${encodeURIComponent(anonKey)}` : '';
        const refererQuery = refererParam ? `&referer=${encodeURIComponent(refererParam)}` : '';

        const rewritten = text.split('\n').map(line => {
          const trimmed = line.trim();
          if (!trimmed || (trimmed.startsWith('#') && !trimmed.includes('URI='))) return line;

          // Handle EXT tag URI values (e.g., KEY URIs)
          if (trimmed.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
              const absolute = uri.startsWith('http') ? uri : baseUrl + uri;
              return `URI="${proxyBase}?url=${encodeURIComponent(absolute)}&type=video${refererQuery}${keyParam}"`;
            });
          }

          // Segment or variant URLs
          if (!trimmed.startsWith('#')) {
            const absolute = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
            return `${proxyBase}?url=${encodeURIComponent(absolute)}&type=video${refererQuery}${keyParam}`;
          }

          return line;
        }).join('\n');

        return new Response(rewritten, {
          status: passthroughStatus,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'public, max-age=60',
          },
        });
      }

      const upstreamBody = await response.arrayBuffer().catch(() => new ArrayBuffer(0));
      const upstreamLength = response.headers.get('content-length');
      const streamHeaders: Record<string, string> = {
        ...corsHeaders,
        'Content-Type': upstreamContentType,
      };
      if (upstreamLength) streamHeaders['Content-Length'] = upstreamLength;
      
      return new Response(upstreamBody, {
        status: passthroughStatus,
        headers: streamHeaders,
      });
    }

    if (!response.ok && response.status !== 206) {
      console.error(`Upstream error: ${response.status} ${response.statusText} for ${targetUrl}`);

      // If debug=1 requested, capture upstream text and headers for easier debugging
      if (debug) {
        const upstreamText = await response.text().catch(() => '');
        const upstreamHeaders: Record<string, string | null> = {};
        ['content-type', 'content-length', 'content-range', 'x-cache', 'set-cookie'].forEach(h => {
          upstreamHeaders[h] = response.headers.get(h);
        });

        console.error('Upstream headers:', upstreamHeaders);

        return new Response(JSON.stringify({
          error: `Upstream error: ${response.status}`,
          status: response.status,
          upstream: {
            headers: upstreamHeaders,
            bodySnippet: upstreamText ? upstreamText.substring(0, 1000) : ''
          },
          url: targetUrl
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        error: `Upstream error: ${response.status}`,
        url: targetUrl.substring(0, 50) + '...'
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine content type
    let contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    if (type === 'subtitle') {
      if (targetUrl.includes('.vtt')) {
        contentType = 'text/vtt; charset=utf-8';
      } else if (targetUrl.includes('.srt')) {
        contentType = 'text/plain; charset=utf-8';
      } else if (targetUrl.includes('.ass')) {
        contentType = 'text/plain; charset=utf-8';
      }
    } else if (type === 'video') {
      if (targetUrl.includes('.m3u8')) {
        contentType = 'application/vnd.apple.mpegurl';
      } else if (targetUrl.includes('.ts')) {
        contentType = 'video/mp2t';
      } else if (targetUrl.includes('.mp4')) {
        contentType = 'video/mp4';
      }
    } else if (type === 'api') {
      contentType = 'application/json';
    }

    // Build response headers
    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': contentType,
      'Cache-Control': type === 'video' ? 'public, max-age=3600' : type === 'api' ? 'public, max-age=60' : 'public, max-age=86400',
    };

    // Forward relevant headers
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength;
    }

    const contentRange = response.headers.get('content-range');
    if (contentRange) {
      responseHeaders['Content-Range'] = contentRange;
    }

    // For non-video types, streaming is already handled above

    // For other content, stream directly
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Proxy error';
    console.error('Proxy error:', errorMessage);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
