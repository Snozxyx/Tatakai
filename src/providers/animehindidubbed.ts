/**
 * AnimeHindiDubbed.in integration
 * Client-side wrapper for the animehindidubbed-scraper Supabase function
 */

import { supabase } from './supabase/client';

export interface ServerVideo {
  name: string; // Episode identifier like "01", "02", "S5E1", etc.
  url: string;  // Direct embed URL
}

export interface Episode {
  number: number;
  title: string;
  servers: EpisodeServer[];
}

export interface EpisodeServer {
  name: string;
  url: string;
  language: string;
}

export interface AnimePageData {
  title: string;
  slug: string;
  thumbnail?: string;
  description?: string;
  rating?: string;
  episodes: Episode[];
}

export interface AnimeSearchResult {
  title: string;
  slug: string;
  url: string;
  thumbnail?: string;
  categories?: string[];
}

export interface SearchResult {
  animeList: AnimeSearchResult[];
  totalFound: number;
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/animehindidubbed-scraper`;

/**
 * Search for anime on AnimeHindiDubbed.in
 * @param title - Anime title to search for
 * @returns Search results with anime list
 */
export async function searchAnimeHindiDubbed(title: string): Promise<SearchResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(
      `${FUNCTION_URL}?action=search&title=${encodeURIComponent(title)}`,
      {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error searching AnimeHindiDubbed:', error);
    throw error;
  }
}

/**
 * Get anime page data with all episodes and servers
 * @param slug - Anime slug from search results (e.g., "black-butler")
 * @returns Complete anime data with episodes for all servers
 */
export async function getAnimeHindiDubbedData(slug: string): Promise<AnimePageData> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(
      `${FUNCTION_URL}?action=anime&slug=${encodeURIComponent(slug)}`,
      {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('[AnimeHindiDubbed] Fetch failed:', error);
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[AnimeHindiDubbed] Raw API Response:', data);
    return data;
  } catch (error) {
    console.error('Error fetching AnimeHindiDubbed data:', error);
    throw error;
  }
}

/**
 * Extract episode number from episode name
 * Handles formats like "01", "02", "S5E1", "S5E12", etc.
 */
export function parseEpisodeNumber(name: string): { season?: number; episode: number } | null {
  // Season format: S5E12
  const seasonMatch = name.match(/S(\d+)E(\d+)/i);
  if (seasonMatch) {
    return {
      season: parseInt(seasonMatch[1], 10),
      episode: parseInt(seasonMatch[2], 10),
    };
  }

  // Simple number format: 01, 02, etc.
  const simpleMatch = name.match(/^(\d+)$/);
  if (simpleMatch) {
    return {
      episode: parseInt(simpleMatch[1], 10),
    };
  }

  return null;
}

/**
 * Get all episodes across all servers for an anime
 * Returns unique episode identifiers
 */
export function getAllEpisodes(animeData: AnimePageData): string[] {
  if (!animeData.episodes) return [];

  const episodes = animeData.episodes.map(ep => ep.number.toString());

  // Sort numerically
  episodes.sort((a, b) => parseInt(a) - parseInt(b));

  return episodes;
}

/**
 * Get episode URL for a specific server and episode
 */
export function getEpisodeUrl(
  animeData: AnimePageData,
  episodeName: string,
  server: string = 'filemoon'
): string | null {
  const epNum = parseInt(episodeName, 10);
  const episode = animeData.episodes?.find(ep => ep.number === epNum);

  if (!episode) return null;

  // Find server within this episode
  const serverNode = episode.servers.find(s => s.name.toLowerCase() === server.toLowerCase());
  return serverNode?.url || null;
}

/**
 * Check if AnimeHindiDubbed source is available for an anime
 * @param animeTitle - Anime title to search for
 * @returns True if any anime found
 */
export async function isAnimeHindiDubbedAvailable(animeTitle: string): Promise<boolean> {
  try {
    const result = await searchAnimeHindiDubbed(animeTitle);
    return result.totalFound > 0;
  } catch (error) {
    console.error('Error checking AnimeHindiDubbed availability:', error);
    return false;
  }
}

/**
 * Get preferred server based on availability
 * Returns the server with the most episodes available
 */
export function getPreferredServer(animeData: AnimePageData): 'filemoon' | 'servabyss' | 'vidgroud' {
  // Return default as we now show all servers per episode
  return 'filemoon';
}
