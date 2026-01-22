/**
 * AnimeHindiDubbed.in integration
 * Client-side wrapper for the animehindidubbed-scraper Supabase function
 */

import { supabase } from './supabase/client';

export interface ServerVideo {
  name: string; // Episode identifier like "01", "02", "S5E1", etc.
  url: string;  // Direct embed URL
}

export interface AnimePageData {
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
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
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
  const episodeSet = new Set<string>();
  
  // Collect from all servers
  animeData.servers.filemoon.forEach(ep => episodeSet.add(ep.name));
  animeData.servers.servabyss.forEach(ep => episodeSet.add(ep.name));
  animeData.servers.vidgroud.forEach(ep => episodeSet.add(ep.name));
  
  // Convert to array and sort
  const episodes = Array.from(episodeSet);
  episodes.sort((a, b) => {
    const parsedA = parseEpisodeNumber(a);
    const parsedB = parseEpisodeNumber(b);
    
    if (!parsedA || !parsedB) return a.localeCompare(b);
    
    // Compare seasons first if both have them
    if (parsedA.season !== undefined && parsedB.season !== undefined) {
      if (parsedA.season !== parsedB.season) {
        return parsedA.season - parsedB.season;
      }
    }
    
    // Compare episodes
    return parsedA.episode - parsedB.episode;
  });
  
  return episodes;
}

/**
 * Get episode URL for a specific server and episode
 */
export function getEpisodeUrl(
  animeData: AnimePageData, 
  episodeName: string, 
  server: 'filemoon' | 'servabyss' | 'vidgroud' = 'filemoon'
): string | null {
  const serverVideos = animeData.servers[server];
  const episode = serverVideos.find(ep => ep.name === episodeName);
  return episode?.url || null;
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
  const counts = {
    filemoon: animeData.servers.filemoon.length,
    servabyss: animeData.servers.servabyss.length,
    vidgroud: animeData.servers.vidgroud.length,
  };
  
  if (counts.filemoon >= counts.servabyss && counts.filemoon >= counts.vidgroud) {
    return 'filemoon';
  } else if (counts.vidgroud >= counts.servabyss) {
    return 'vidgroud';
  } else {
    return 'servabyss';
  }
}
