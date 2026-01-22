import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range, accept",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type",
};

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok || response.status === 206) return response;
      if (response.status >= 400 && response.status < 500 && response.status !== 429) return response;
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error as Error;
    }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, Math.pow(2, i) * 500));
  }
  throw lastError || new Error("Failed to fetch after retries");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get("url");
    const type = url.searchParams.get("type") || "api";
    const refererParam = url.searchParams.get("referer");

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "Missing url parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fetchHeaders: Record<string, string> = {
      "User-Agent":
        url.searchParams.get("userAgent") ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: type === "api" ? "application/json" : "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Connection: "keep-alive",
    };

    const rangeHeader = req.headers.get("range");
    if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

    if (refererParam) {
      try {
        const refererUrl = new URL(refererParam);
        fetchHeaders["Referer"] = refererParam;
        fetchHeaders["Origin"] = refererUrl.origin;
      } catch {
        fetchHeaders["Referer"] = parsedUrl.origin;
        fetchHeaders["Origin"] = parsedUrl.origin;
      }
    } else {
      fetchHeaders["Referer"] = parsedUrl.origin;
      fetchHeaders["Origin"] = parsedUrl.origin;
    }

    const response = await fetchWithRetry(targetUrl, { method: "GET", headers: fetchHeaders });

    // Video streaming: rewrite manifests so segments also flow through this proxy
    if (type === "video") {
      const upstreamContentType = response.headers.get("content-type") || "application/octet-stream";
      const isManifest =
        targetUrl.includes(".m3u8") || upstreamContentType.includes("mpegurl") || upstreamContentType.includes("m3u8");

      const passthroughStatus = response.ok || response.status === 206 ? response.status : 200;

      if (isManifest) {
        const text = await response.text().catch(() => "");
        if (!text.includes("#EXTM3U")) {
          return new Response(text || "", {
            status: response.status || 502,
            headers: { ...corsHeaders, "Content-Type": upstreamContentType || "text/plain" },
          });
        }

        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || new URL(req.url).origin;
        const proxyBase = supabaseUrl.replace(/\/+$/, "") + "/functions/v1/video-proxy-v2";
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
        const keyParam = anonKey ? `&apikey=${encodeURIComponent(anonKey)}` : "";
        const refererQuery = refererParam ? `&referer=${encodeURIComponent(refererParam)}` : "";

        const rewritten = text
          .split("\n")
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || (trimmed.startsWith("#") && !trimmed.includes("URI="))) return line;

            if (trimmed.includes('URI="')) {
              return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
                const absolute = uri.startsWith("http") ? uri : baseUrl + uri;
                return `URI="${proxyBase}?url=${encodeURIComponent(absolute)}&type=video${refererQuery}${keyParam}"`;
              });
            }

            if (!trimmed.startsWith("#")) {
              const absolute = trimmed.startsWith("http") ? trimmed : baseUrl + trimmed;
              return `${proxyBase}?url=${encodeURIComponent(absolute)}&type=video${refererQuery}${keyParam}`;
            }
            return line;
          })
          .join("\n");

        return new Response(rewritten, {
          status: passthroughStatus,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "public, max-age=60",
          },
        });
      }

      const upstreamBody = await response.arrayBuffer().catch(() => new ArrayBuffer(0));
      const upstreamLength = response.headers.get("content-length");
      const streamHeaders: Record<string, string> = { ...corsHeaders, "Content-Type": upstreamContentType };
      if (upstreamLength) streamHeaders["Content-Length"] = upstreamLength;
      const contentRange = response.headers.get("content-range");
      if (contentRange) streamHeaders["Content-Range"] = contentRange;

      return new Response(upstreamBody, { status: passthroughStatus, headers: streamHeaders });
    }

    // Non-video: stream as-is with safe content-type defaults
    let contentType = response.headers.get("content-type") || "application/octet-stream";
    if (type === "subtitle") {
      if (targetUrl.includes(".vtt")) contentType = "text/vtt; charset=utf-8";
      else if (targetUrl.includes(".srt") || targetUrl.includes(".ass")) contentType = "text/plain; charset=utf-8";
    } else if (type === "api") {
      contentType = "application/json";
    }

    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": type === "api" ? "public, max-age=60" : "public, max-age=86400",
    };
    const contentLength = response.headers.get("content-length");
    if (contentLength) responseHeaders["Content-Length"] = contentLength;

    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy error";
    return new Response(JSON.stringify({ error: message, timestamp: new Date().toISOString() }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

