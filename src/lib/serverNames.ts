// Anime-themed server names with descriptions for hover tooltips
export interface ServerNameInfo {
  name: string;
  description: string;
}

export const ANIME_SERVER_NAMES: Record<string, ServerNameInfo> = {
  // TatakaiAPI / HiAnime servers - Main characters
  'hd-1': { name: 'Goku', description: 'Ultra HD (Vidstreaming)' },
  'hd-2': { name: 'Saitama', description: 'HD Elite (T-Cloud)' },
  'megacloud': { name: 'Domo', description: 'MegaCloud HLS Streaming' },
  'streamsb': { name: 'Oni', description: 'StreamSB Server' },
  'streamtape': { name: 'Shinigami', description: 'StreamTape Server' },
  'vidstreaming': { name: 'Titan', description: 'VidStreaming' },
  'vidcloud': { name: 'Mecha', description: 'VidCloud Server' },
  'justanime': { name: 'Koro', description: 'Koro Fast Server' },

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
  'filemoon': { name: 'Filemoon', description: 'Filemoon Embed Server' },
  'servabyss': { name: 'Servabyss', description: 'Servabyss Embed Server' },
  'vidgroud': { name: 'Vidgroud', description: 'Vidgroud Embed Server' },

  // ToonStream - Hindi/Multi-language servers
  'toonstream-short': { name: 'Short', description: 'ToonStream Short Server' },
  'toonstream-ruby': { name: 'Ruby', description: 'ToonStream Ruby Server' },
  'toonstream-cloudy': { name: 'Cloudy', description: 'ToonStream Cloudy Server' },
  'toonstream-strmup': { name: 'Strmup', description: 'ToonStream Strmup Server' },
  'toonstream-watch/dl': { name: 'Watch/DL', description: 'ToonStream Watch/Download Server' },
  'toonstream-turbo': { name: 'Turbo', description: 'ToonStream Turbo Server' },
  'toonstream-moly': { name: 'Moly', description: 'ToonStream Moly Server' },

  // HindiAPI (TechInMind) - Provider-based
  'hindiapi-upns': { name: 'UPNS', description: 'HindiAPI UPNS Server (HLS)' },
  'hindiapi-strmup': { name: 'StrmUp', description: 'HindiAPI StrmUp Server' },
  'hindiapi-dropload': { name: 'DropLoad', description: 'HindiAPI DropLoad Server' },
  'hindiapi-plrx': { name: 'PlrX', description: 'HindiAPI PlrX Server' },
  'hindiapi-strmrb': { name: 'StrmRb', description: 'HindiAPI StrmRb Server' },

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

const SIMPLE_CHARACTER_POOL = [
  "Naruto",
  "Hinata",
  "Sasuke",
  "Haikyuu",
  "Luffy",
  "Zoro",
  "Nami",
  "Itachi",
  "Madara",
  "Levi",
  "Eren",
  "Mikasa",
  "Gojo",
  "Yuji",
  "Tanjiro",
  "Nezuko",
  "Saitama",
  "Goku",
  "Vegeta",
  "Kakashi",
  "Aizen",
  "Ichigo",
  "Rukia",
  "Kenpachi",
  "Killua",
  "Gon",
  "Kurapika",
  "Hisoka",
  "Light",
  "L",
  "Ryuk",
  "Natsu",
  "Erza",
  "Gray",
  "Lucy",
  "Jotaro",
  "Dio",
  "Joseph",
  "Mob",
  "Reigen",
  "Rimuru",
  "Anos",
  "Sung",
  "Jinwoo",
  "Frieren",
  "Fern",
  "Stark",
  "Senku",
  "Inosuke",
  "Zenitsu",
  "Rengoku",
  "Akaza",
  "Bakugo",
  "Deku",
  "Todoroki",
  "AllMight",
  "Shanks",
  "Sanji",
  "Usopp",
  "Robin",
  "Chopper",
  "Ace",
  "Law",
] as const;

function hashStable(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

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

export function getSimpleServerDisplayName(serverKey: string, fallback?: string): string {
  const key = (serverKey || "").toLowerCase().trim();
  if (!key) return "Naruto";

  if (ANIME_SERVER_NAMES[key]) {
    return ANIME_SERVER_NAMES[key].name;
  }

  const partialMatch = Object.keys(ANIME_SERVER_NAMES).find(k => key.includes(k));
  if (partialMatch) {
    return ANIME_SERVER_NAMES[partialMatch].name;
  }

  if (fallback) {
    const fallbackKey = fallback.toLowerCase().trim();
    if (ANIME_SERVER_NAMES[fallbackKey]) {
      return ANIME_SERVER_NAMES[fallbackKey].name;
    }
  }

  const picked = SIMPLE_CHARACTER_POOL[hashStable(key) % SIMPLE_CHARACTER_POOL.length];
  return picked;
}

export function buildUniqueSimpleNameMap(
  keys: string[],
  fallbackByKey: Record<string, string> = {}
): Record<string, string> {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  const used = new Set<string>();
  const out: Record<string, string> = {};

  for (const key of uniqueKeys) {
    const fallback = fallbackByKey[key];
    const preferred = getSimpleServerDisplayName(key, fallback);
    if (!used.has(preferred)) {
      out[key] = preferred;
      used.add(preferred);
      continue;
    }

    let resolved = "";
    const start = hashStable(key) % SIMPLE_CHARACTER_POOL.length;
    for (let i = 0; i < SIMPLE_CHARACTER_POOL.length; i += 1) {
      const candidate = SIMPLE_CHARACTER_POOL[(start + i) % SIMPLE_CHARACTER_POOL.length];
      if (!used.has(candidate)) {
        resolved = candidate;
        break;
      }
    }

    if (!resolved) {
      let n = 2;
      while (used.has(`${preferred} ${n}`)) n += 1;
      resolved = `${preferred} ${n}`;
    }

    out[key] = resolved;
    used.add(resolved);
  }

  return out;
}

// Legacy function for compatibility
export function getFriendlyServerName(serverName: string): string {
  return getAnimeServerName(serverName).name;
}

