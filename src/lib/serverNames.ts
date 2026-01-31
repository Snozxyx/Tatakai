// Anime-themed server names with descriptions for hover tooltips
export interface ServerNameInfo {
  name: string;
  description: string;
}

export const ANIME_SERVER_NAMES: Record<string, ServerNameInfo> = {
  // TatakaiAPI / HiAnime servers - Main characters
  'hd-1': { name: 'Goku', description: 'Ultra HD Server' },
  'hd-2': { name: 'Luffy', description: 'HD Pro - Recommended' },
  'hd-3': { name: 'Saitama', description: 'HD Elite' },
  'megacloud': { name: 'Domo', description: 'MegaCloud HLS Streaming' },
  'streamsb': { name: 'Oni', description: 'StreamSB Server' },
  'streamtape': { name: 'Shinigami', description: 'StreamTape Server' },
  'vidstreaming': { name: 'Titan', description: 'VidStreaming' },
  'vidcloud': { name: 'Mecha', description: 'VidCloud Server' },

  // WatchAnimeWorld - Named by language
  'watchaw-ita': { name: 'Sakura (ITA)', description: 'Italian Audio' },
  'watchaw-jap': { name: 'Naruto (JAP)', description: 'Japanese Audio' },
  'watchaw-eng': { name: 'Edward (ENG)', description: 'English Audio' },
  'watchaw-ger': { name: 'Eren (GER)', description: 'German Audio' },
  'watchaw-fre': { name: 'Spike (FRE)', description: 'French Audio' },

  // AnimeHindiDubbed - Special names
  'berlin': { name: 'Madara (Hindi)', description: 'Berlin Server - Hindi Dubbed' },
  'madrid': { name: 'Itachi (Hindi)', description: 'Madrid Server - Hindi Dubbed' },
  'abyss': { name: 'Stream', description: 'Abyss Server' },

  // Animelok - Server-based names
  'animelok-bato': { name: 'Totoro', description: 'Animelok Bato Server' },
  'animelok-kuro': { name: 'Kuro', description: 'Animelok Kuro Server' },
  'animelok-abyss': { name: 'Ads', description: 'Animelok Abyss Server' },

  // Animeya - Provider-based
  'animeya-vidnest': { name: 'Bebop', description: 'Vidnest Multi-Quality' },
  'animeya-pahe': { name: 'Pahe', description: 'AnimePahe Source' },
  'animeya-player': { name: 'Player', description: 'Animeya Player' },
  'animeya-mp4': { name: 'Mp4', description: 'Mp4Upload' },
};

export function getAnimeServerName(serverKey: string, fallback?: string): ServerNameInfo {
  const key = serverKey.toLowerCase();

  // Try exact match first
  if (ANIME_SERVER_NAMES[key]) {
    return ANIME_SERVER_NAMES[key];
  }

  // Try partial match for dynamic keys
  const partialMatch = Object.keys(ANIME_SERVER_NAMES).find(k => key.includes(k));
  if (partialMatch) {
    return ANIME_SERVER_NAMES[partialMatch];
  }

  // Return fallback or capitalize first letter
  const displayName = fallback || (serverKey.charAt(0).toUpperCase() + serverKey.slice(1));
  return {
    name: displayName,
    description: fallback ? `${fallback} Server` : 'Video Server'
  };
}

// Legacy function for compatibility
export function getFriendlyServerName(serverName: string): string {
  return getAnimeServerName(serverName).name;
}

