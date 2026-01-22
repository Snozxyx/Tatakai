/**
 * WatchAnimeWorld scraper integration
 * Parses episode URLs, extracts servers from HTML, and resolves provider links
 */

export interface ParsedEpisodeUrl {
  slug: string;
  animeSlug: string;
  season: number;
  episode: number;
  fullUrl: string;
}

export interface LanguageInfo {
  name: string;
  code: string; // ISO 639-1 code
  isDub: boolean;
}

export interface WatchAnimeWorldServer {
  language: string;
  link: string;
  providerName?: string;
}

export interface ResolvedSource {
  url: string;
  isM3U8: boolean;
  quality?: string;
  language?: string;
  langCode?: string;
  isDub?: boolean;
  providerName?: string;
  needsHeadless?: boolean;
}

// Language mapping: normalize to canonical names and ISO codes
const LANGUAGE_MAP: Record<string, LanguageInfo> = {
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
  'chinese': { name: 'Chinese', code: 'zh', isDub: true },
  'und': { name: 'Unknown', code: 'und', isDub: false },
};

/**
 * Parse episode URL to extract anime slug, season, and episode
 * @param urlOrSlug - Full URL or slug like "naruto-shippuden-1x1"
 * @returns Parsed episode information
 */
export function parseEpisodeUrl(urlOrSlug: string): ParsedEpisodeUrl | null {
  try {
    let slug = urlOrSlug;
    let fullUrl = urlOrSlug;

    // If it's a full URL, extract the slug
    if (urlOrSlug.startsWith('http')) {
      const url = new URL(urlOrSlug);
      const pathMatch = url.pathname.match(/\/episode\/([^\/]+)\/?$/);
      if (!pathMatch) return null;
      slug = pathMatch[1];
      fullUrl = urlOrSlug;
    } else {
      fullUrl = `https://watchanimeworld.in/episode/${slug}/`;
    }

    // Extract season and episode: e.g., "naruto-shippuden-1x1"
    const seasonEpisodeMatch = slug.match(/^(.+?)-(\d+)x(\d+)$/);
    if (!seasonEpisodeMatch) return null;

    const [, animeSlug, seasonStr, episodeStr] = seasonEpisodeMatch;
    const season = parseInt(seasonStr, 10);
    const episode = parseInt(episodeStr, 10);

    if (isNaN(season) || isNaN(episode)) return null;

    return {
      slug,
      animeSlug,
      season,
      episode,
      fullUrl,
    };
  } catch (error) {
    console.error('Error parsing episode URL:', error);
    return null;
  }
}

/**
 * Normalize language string to canonical LanguageInfo
 */
export function normalizeLanguage(lang: string): LanguageInfo {
  const normalized = lang.toLowerCase().trim();
  return LANGUAGE_MAP[normalized] || {
    name: lang,
    code: 'und',
    isDub: normalized !== 'japanese' && normalized !== 'jpn',
  };
}

/**
 * Extract server list from /api/player1.php iframe data attribute
 * The data param is a base64-encoded JSON array of servers
 */
export function parsePlayer1Data(dataParam: string): WatchAnimeWorldServer[] {
  try {
    // Decode base64
    const decoded = atob(dataParam);
    const servers = JSON.parse(decoded);

    if (!Array.isArray(servers)) return [];

    return servers.map((server: any) => ({
      language: server.language || 'Unknown',
      link: server.link || '',
      providerName: extractProviderName(server.link),
    }));
  } catch (error) {
    console.error('Error parsing player1 data:', error);
    return [];
  }
}

/**
 * Extract provider name from URL
 */
function extractProviderName(url: string): string | undefined {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // Extract main domain name
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return hostname;
  } catch {
    return undefined;
  }
}

/**
 * Extract iframe src from episode HTML
 */
export function extractIframeSources(html: string): {
  player1Url?: string;
  player1Data?: string;
  providerIframes: string[];
} {
  const result: {
    player1Url?: string;
    player1Data?: string;
    providerIframes: string[];
  } = {
    providerIframes: [],
  };

  try {
    // Extract /api/player1.php iframe with data attribute
    const player1Match = html.match(/iframe[^>]+data-src="([^"]*\/api\/player1\.php\?data=([^"]+))"/i);
    if (player1Match) {
      result.player1Url = player1Match[1];
      result.player1Data = player1Match[2];
    }

    // Extract other provider iframes (e.g., play.zephyrflick.top)
    const iframeRegex = /<iframe[^>]+src="([^"]+)"[^>]*>/gi;
    let match;
    while ((match = iframeRegex.exec(html)) !== null) {
      const src = match[1];
      // Skip player1.php and empty/local sources
      if (src && !src.includes('player1.php') && src.startsWith('http')) {
        result.providerIframes.push(src);
      }
    }
  } catch (error) {
    console.error('Error extracting iframe sources:', error);
  }

  return result;
}

/**
 * Detect if a response is a Cloudflare challenge
 */
export function isCloudflareChallenge(html: string): boolean {
  return (
    html.includes('challenge-platform') ||
    html.includes('Just a moment') ||
    html.includes('Enable JavaScript and cookies to continue') ||
    html.includes('cf-chl-opt')
  );
}

/**
 * Extract m3u8 URLs from HTML/JS
 */
export function extractM3U8Links(content: string): string[] {
  const m3u8Regex = /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi;
  const matches = content.match(m3u8Regex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extract video quality from URL or context
 */
export function extractQuality(url: string, context?: string): string | undefined {
  const qualityPatterns = [
    /(\d{3,4}p)/i,
    /(hd|sd|fhd|uhd|4k|2k|1080|720|480|360)/i,
  ];

  const searchText = `${url} ${context || ''}`;
  for (const pattern of qualityPatterns) {
    const match = searchText.match(pattern);
    if (match) return match[1].toUpperCase();
  }

  return undefined;
}

/**
 * Generate anime search query from slug
 * e.g., "naruto-shippuden" -> "naruto shippuden"
 */
export function slugToSearchQuery(animeSlug: string): string {
  return animeSlug
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate string similarity (simple Levenshtein distance normalized)
 */
export function stringSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  const s1 = normalize(a);
  const s2 = normalize(b);

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // Simple substring check for speed
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8 + 0.2 * (Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length));
  }

  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[s1.length][s2.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - distance / maxLength;
}
