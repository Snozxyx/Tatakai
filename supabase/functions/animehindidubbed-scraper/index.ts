import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Simple in-memory cache with TTL
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = parseInt(Deno.env.get('ANIMEHINDI_CACHE_TTL') || '600') * 1000; // 10 min default

// Rate limiting
const rateLimits = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = parseInt(Deno.env.get('ANIMEHINDI_RATE_LIMIT') || '20');

interface ServerVideo {
  name: string;
  url: string;
}

interface AnimePageData {
  title: string;
  slug: string;
  thumbnail?: string;
  description?: string;
  rating?: string;
  servers: {
    filemoon: ServerVideo[];
    servabyss: ServerVideo[];
    vidgroud: ServerVideo[];
  };
}

interface SearchResult {
  animeList: Array<{
    title: string;
    slug: string;
    url: string;
    thumbnail?: string;
    categories?: string[];
  }>;
  totalFound: number;
}

// Retry fetch with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://animehindidubbed.in/',
          ...options.headers,
        },
        signal: AbortSignal.timeout(30000),
      });
      
      if (response.ok || response.status === 206) {
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

/**
 * Search for anime by title on AnimeHindiDubbed.in
 */
async function searchAnime(title: string): Promise<SearchResult> {
  const cacheKey = `search:${title}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() < cached.expires) {
    console.log('Cache hit for search:', title);
    return cached.data;
  }
  
  const searchUrl = `https://animehindidubbed.in/?s=${encodeURIComponent(title)}`;
  console.log('Searching:', searchUrl);
  
  const response = await fetchWithRetry(searchUrl);
  const html = await response.text();
  
  const animeList: SearchResult['animeList'] = [];
  
  // Use regex to parse HTML since DOMParser might have issues
  // Match article tags and extract links
  const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  const linkRegex = /<a[^>]*href=["']([^"']*animehindidubbed\.in\/([^"'\/]+)\/?)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i;
  const imgRegex = /<img[^>]*(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i;
  const categoryRegex = /<a[^>]*class=["'][^"']*cat[^"']*["'][^>]*>([^<]+)<\/a>/gi;
  
  let articleMatch;
  while ((articleMatch = articleRegex.exec(html)) !== null) {
    const articleHtml = articleMatch[1];
    
    const linkMatch = linkRegex.exec(articleHtml);
    if (linkMatch) {
      const url = linkMatch[1];
      const slug = linkMatch[2];
      const linkContent = linkMatch[3];
      
      // Extract title from link content (remove HTML tags)
      const titleMatch = linkContent.match(/>([^<]+)</);
      const title = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' ');
      
      // Extract thumbnail
      const imgMatch = imgRegex.exec(articleHtml);
      const thumbnail = imgMatch ? imgMatch[1] : undefined;
      
      // Extract categories
      const categories: string[] = [];
      let catMatch;
      while ((catMatch = categoryRegex.exec(articleHtml)) !== null) {
        categories.push(catMatch[1].trim());
      }
      
      if (url && slug) {
        animeList.push({
          title: title || slug.replace(/-/g, ' '),
          slug,
          url: url.startsWith('http') ? url : `https://animehindidubbed.in${url}`,
          thumbnail,
          categories,
        });
      }
    }
  }
  
  const result: SearchResult = {
    animeList,
    totalFound: animeList.length,
  };
  
  console.log(`Search found ${animeList.length} results for: ${title}`);
  
  // Cache the result
  cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL });
  
  return result;
}

/**
 * Extract anime page data including all episodes and servers
 * This parses the serverVideos JavaScript object from the page
 */
async function getAnimePage(slug: string): Promise<AnimePageData> {
  const cacheKey = `anime:${slug}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() < cached.expires) {
    console.log('Cache hit for anime:', slug);
    return cached.data;
  }
  
  const animeUrl = `https://animehindidubbed.in/${slug}/`;
  console.log('Fetching anime page:', animeUrl);
  
  const response = await fetchWithRetry(animeUrl);
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  
  if (!doc) {
    throw new Error('Failed to parse HTML');
  }
  
  // Extract basic info
  const h1 = doc.querySelector('h1');
  const title = h1?.textContent?.trim() || slug.replace(/-/g, ' ');
  
  const wpContentImg = doc.querySelector('img[src*="wp-content"]');
  const ogImage = doc.querySelector('meta[property="og:image"]');
  const thumbnail = wpContentImg?.getAttribute('src') || ogImage?.getAttribute('content');
  
  const shortDesc = doc.querySelector('#short-desc');
  const ogDesc = doc.querySelector('meta[property="og:description"]');
  const description = shortDesc?.textContent?.trim() || ogDesc?.getAttribute('content');
  
  const ratingEl = doc.querySelector('.rating, [class*="rating"]');
  const rating = ratingEl?.textContent?.trim();
  
  // Extract serverVideos from JavaScript
  const servers: AnimePageData['servers'] = {
    filemoon: [],
    servabyss: [],
    vidgroud: [],
  };
  
  // Find the script containing serverVideos
  const scripts = doc.querySelectorAll('script');
  
  scripts.forEach((script) => {
    const scriptContent = script.textContent || '';
    
    if (scriptContent.includes('serverVideos')) {
      try {
        // Extract the serverVideos object
        const serverVideosMatch = scriptContent.match(/const\s+serverVideos\s*=\s*({[\s\S]*?});/);
        
        if (serverVideosMatch) {
          // Clean up the JavaScript to make it parseable JSON
          let serverVideosStr = serverVideosMatch[1];
          
          // Replace single quotes with double quotes for JSON
          serverVideosStr = serverVideosStr.replace(/'/g, '"');
          
          // Parse the server data
          try {
            const serverData = JSON.parse(serverVideosStr);
            
            if (serverData.filemoon) servers.filemoon = serverData.filemoon;
            if (serverData.servabyss) servers.servabyss = serverData.servabyss;
            if (serverData.vidgroud) servers.vidgroud = serverData.vidgroud;
            
            console.log(`Extracted ${servers.filemoon.length} filemoon, ${servers.servabyss.length} servabyss, ${servers.vidgroud.length} vidgroud episodes`);
          } catch (jsonError) {
            console.error('Failed to parse serverVideos as JSON, trying manual extraction');
            
            // Fallback: manually extract episodes using regex
            const extractEpisodes = (serverName: string): ServerVideo[] => {
              const pattern = new RegExp(`${serverName}:\\s*\\[([\\s\\S]*?)\\]`, 'i');
              const match = serverVideosStr.match(pattern);
              
              if (match) {
                const episodesStr = match[1];
                const episodes: ServerVideo[] = [];
                
                // Match individual episode objects
                const episodeMatches = episodesStr.matchAll(/\{\s*"name":\s*"([^"]+)"\s*,\s*"url":\s*"([^"]+)"\s*\}/g);
                
                for (const epMatch of episodeMatches) {
                  episodes.push({
                    name: epMatch[1],
                    url: epMatch[2],
                  });
                }
                
                return episodes;
              }
              
              return [];
            };
            
            servers.filemoon = extractEpisodes('filemoon');
            servers.servabyss = extractEpisodes('servabyss');
            servers.vidgroud = extractEpisodes('vidgroud');
          }
        }
      } catch (error) {
        console.error('Error extracting serverVideos:', error);
      }
    }
  });
  
  const result: AnimePageData = {
    title,
    slug,
    thumbnail,
    description,
    rating,
    servers,
  };
  
  console.log(`Found anime: ${title} with ${servers.filemoon.length + servers.servabyss.length + servers.vidgroud.length} total episodes`);
  
  // Cache the result
  cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL });
  
  return result;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    
    // Get client IP for rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded', 
          retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000) 
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'search') {
      const title = url.searchParams.get('title');
      
      if (!title) {
        return new Response(
          JSON.stringify({ error: 'Missing title parameter' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const result = await searchAnime(title);
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'anime') {
      const slug = url.searchParams.get('slug');
      
      if (!slug) {
        return new Response(
          JSON.stringify({ error: 'Missing slug parameter' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const animeData = await getAnimePage(slug);
      
      return new Response(JSON.stringify(animeData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Invalid action
    return new Response(
      JSON.stringify({ 
        error: 'Invalid action. Use action=search or action=anime' 
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error processing request:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
        stack: Deno.env.get('DEBUG') === 'true' && error instanceof Error ? error.stack : undefined
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
