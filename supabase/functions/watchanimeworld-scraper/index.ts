import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Simple in-memory cache with TTL
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = parseInt(Deno.env.get('WATCHAW_CACHE_TTL') || '600') * 1000; // 10 min default

// Rate limiting
const rateLimits = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = parseInt(Deno.env.get('WATCHAW_RATE_LIMIT') || '30');

interface StreamingSource {
  url: string;
  isM3U8: boolean;
  quality?: string;
  language?: string;
  langCode?: string;
  isDub?: boolean;
  providerName?: string;
  needsHeadless?: boolean;
}

interface Subtitle {
  lang: string;
  url: string;
  label?: string;
}

interface StreamingData {
  headers: {
    Referer: string;
    "User-Agent": string;
  };
  sources: StreamingSource[];
  subtitles: Subtitle[];
  anilistID: number | null;
  malID: number | null;
}

// Retry fetch with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000),
      });
      
      if (response.ok || response.status === 206 || response.status === 302) {
        return response;
      }
      
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }
      
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error as Error;
      console.warn(`Fetch attempt ${i + 1} failed:`, error);
    }
    
    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 500));
    }
  }
  
  throw lastError || new Error('Failed to fetch after retries');
}

// Check rate limit
function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  let limit = rateLimits.get(clientIp);
  
  if (!limit || now > limit.resetTime) {
    limit = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimits.set(clientIp, limit);
  }
  
  if (limit.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  limit.count++;
  return true;
}

// Parse episode URL
function parseEpisodeUrl(urlOrSlug: string): { slug: string; animeSlug: string; season: number; episode: number; fullUrl: string } | null {
  try {
    let slug = urlOrSlug;
    let fullUrl = urlOrSlug;

    if (urlOrSlug.startsWith('http')) {
      const url = new URL(urlOrSlug);
      const pathMatch = url.pathname.match(/\/episode\/([^\/]+)\/?$/);
      if (!pathMatch) return null;
      slug = pathMatch[1];
      fullUrl = urlOrSlug;
    } else {
      fullUrl = `https://watchanimeworld.in/episode/${slug}/`;
    }

    const seasonEpisodeMatch = slug.match(/^(.+?)-(\d+)x(\d+)$/);
    if (!seasonEpisodeMatch) return null;

    const [, animeSlug, seasonStr, episodeStr] = seasonEpisodeMatch;
    const season = parseInt(seasonStr, 10);
    const episode = parseInt(episodeStr, 10);

    if (isNaN(season) || isNaN(episode)) return null;

    return { slug, animeSlug, season, episode, fullUrl };
  } catch {
    return null;
  }
}

// Language mapping
const LANGUAGE_MAP: Record<string, { name: string; code: string; isDub: boolean }> = {
  'hindi': { name: 'Hindi', code: 'hi', isDub: true },
  'tamil': { name: 'Tamil', code: 'ta', isDub: true },
  'telugu': { name: 'Telugu', code: 'te', isDub: true },
  'malayalam': { name: 'Malayalam', code: 'ml', isDub: true },
  'bengali': { name: 'Bengali', code: 'bn', isDub: true },
  'marathi': { name: 'Marathi', code: 'mr', isDub: true },
  'kannada': { name: 'Kannada', code: 'kn', isDub: true },
  'english': { name: 'English', code: 'en', isDub: true },
  'japanese': { name: 'Japanese', code: 'ja', isDub: false },
  'korean': { name: 'Korean', code: 'ko', isDub: true },
  'und': { name: 'Unknown', code: 'und', isDub: false },
};

function normalizeLanguage(lang: string) {
  const normalized = lang.toLowerCase().trim();
  return LANGUAGE_MAP[normalized] || { name: lang, code: 'und', isDub: normalized !== 'japanese' };
}

// Check if response is Cloudflare challenge
function isCloudflareChallenge(html: string): boolean {
  return html.includes('challenge-platform') || html.includes('Just a moment') || html.includes('cf-chl-opt');
}

// Extract m3u8 links
function extractM3U8Links(content: string): string[] {
  const m3u8Regex = /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi;
  const matches = content.match(m3u8Regex);
  return matches ? [...new Set(matches)] : [];
}

// Resolve short link by following multiple redirects
async function resolveShortLink(shortUrl: string, maxHops = 5): Promise<string> {
  let currentUrl = shortUrl;
  
  for (let hop = 0; hop < maxHops; hop++) {
    try {
      const response = await fetchWithRetry(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }, 2);
      
      const location = response.headers.get('location');
      if (!location) {
        // No more redirects
        return currentUrl;
      }
      
      // Resolve relative URLs
      const nextUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href;
      
      console.log(`Redirect hop ${hop + 1}: ${currentUrl} -> ${nextUrl}`);
      
      // Avoid redirect loops
      if (nextUrl === currentUrl) {
        return currentUrl;
      }
      
      currentUrl = nextUrl;
    } catch (error) {
      console.warn(`Failed to resolve redirect at hop ${hop + 1}:`, currentUrl, error);
      return currentUrl;
    }
  }
  
  console.warn('Max redirect hops reached:', currentUrl);
  return currentUrl;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const episodeUrl = url.searchParams.get('episodeUrl');
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';

    if (!episodeUrl) {
      return new Response(JSON.stringify({ error: 'Missing episodeUrl parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting
    if (!checkRateLimit(clientIp)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check cache
    const cacheKey = `watchaw:${episodeUrl}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      console.log('Returning cached result for:', episodeUrl);
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse episode URL
    const parsed = parseEpisodeUrl(episodeUrl);
    if (!parsed) {
      return new Response(JSON.stringify({ error: 'Invalid episode URL format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Scraping episode:', parsed.fullUrl);

    // Fetch episode page
    const pageResponse = await fetchWithRetry(parsed.fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const html = await pageResponse.text();
    
    // Extract iframe sources
    const player1Match = html.match(/iframe[^>]+data-src="([^"]*\/api\/player1\.php\?data=([^"]+))"/i);
    
    const sources: StreamingSource[] = [];
    const subtitles: Subtitle[] = [];

    if (player1Match) {
      const player1Data = player1Match[2];
      
      try {
        // Decode base64 data
        const decoded = atob(player1Data);
        const servers = JSON.parse(decoded);

        console.log('Found servers:', servers.length);

        // Process each server
        for (const server of servers) {
          const language = server.language || 'Unknown';
          const link = server.link || '';
          
          if (!link) continue;

          const langInfo = normalizeLanguage(language);
          
          // Resolve short link
          const resolvedLink = await resolveShortLink(link);
          
          // Try to fetch provider page
          try {
            const providerResponse = await fetchWithRetry(resolvedLink, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': parsed.fullUrl,
              },
            }, 1);

            const providerHtml = await providerResponse.text();

            // Check if Cloudflare challenge
            if (isCloudflareChallenge(providerHtml)) {
              console.log('Cloudflare challenge detected for:', language);
              sources.push({
                url: resolvedLink,
                isM3U8: false,
                language: langInfo.name,
                langCode: langInfo.code,
                isDub: langInfo.isDub,
                needsHeadless: true,
                providerName: new URL(resolvedLink).hostname.split('.').slice(-2, -1)[0],
              });
              continue;
            }

            // Extract m3u8 links
            const m3u8Links = extractM3U8Links(providerHtml);
            
            if (m3u8Links.length > 0) {
              for (const m3u8Url of m3u8Links.slice(0, 2)) {
                sources.push({
                  url: m3u8Url,
                  isM3U8: true,
                  language: langInfo.name,
                  langCode: langInfo.code,
                  isDub: langInfo.isDub,
                  quality: 'HD',
                  providerName: new URL(resolvedLink).hostname.split('.').slice(-2, -1)[0],
                });
              }
            } else {
              // No direct m3u8 found, mark as needing headless
              sources.push({
                url: resolvedLink,
                isM3U8: false,
                language: langInfo.name,
                langCode: langInfo.code,
                isDub: langInfo.isDub,
                needsHeadless: true,
                providerName: new URL(resolvedLink).hostname.split('.').slice(-2, -1)[0],
              });
            }
          } catch (error) {
            console.warn('Failed to fetch provider for', language, ':', error);
            // Add as unresolved source
            sources.push({
              url: resolvedLink,
              isM3U8: false,
              language: langInfo.name,
              langCode: langInfo.code,
              isDub: langInfo.isDub,
              needsHeadless: true,
            });
          }
        }
      } catch (error) {
        console.error('Failed to parse player1 data:', error);
      }
    }

    const result: StreamingData = {
      headers: {
        Referer: parsed.fullUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      sources,
      subtitles,
      anilistID: null,
      malID: null,
    };

    // Cache the result
    cache.set(cacheKey, {
      data: result,
      expires: Date.now() + CACHE_TTL,
    });

    // Cleanup old cache entries periodically
    if (Math.random() < 0.1) {
      const now = Date.now();
      for (const [key, value] of cache.entries()) {
        if (now > value.expires) {
          cache.delete(key);
        }
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Scraper error';
    console.error('Scraper error:', errorMessage);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
