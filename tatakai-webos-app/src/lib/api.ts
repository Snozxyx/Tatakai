// API client for Tatakai backend
const TATAKAI_API_BASE = process.env.NEXT_PUBLIC_TATAKAI_API_BASE || 'http://localhost:5000'
const HIANIME_API_BASE = 'https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime'

export interface AnimeInfo {
  id: string
  name: string
  poster: string
  description?: string
  type?: string
  episodes?: {
    sub: number
    dub: number
  }
  rating?: string
  duration?: string
  genres?: string[]
  status?: string
  jname?: string
  rank?: number
  otherInfo?: string[]
}

export interface HomePageData {
  success: boolean
  data: {
    genres: string[]
    latestEpisodeAnimes: AnimeInfo[]
    spotlightAnimes: AnimeInfo[]
    top10Animes: {
      today: AnimeInfo[]
      week: AnimeInfo[]
      month: AnimeInfo[]
    }
    topAiringAnimes: AnimeInfo[]
    topUpcomingAnimes: AnimeInfo[]
    trendingAnimes: AnimeInfo[]
    mostPopularAnimes: AnimeInfo[]
    mostFavoriteAnimes: AnimeInfo[]
    latestCompletedAnimes: AnimeInfo[]
  }
}

export interface SearchResult {
  success: boolean
  data: {
    animes: AnimeInfo[]
    mostPopularAnimes: AnimeInfo[]
    currentPage: number
    totalPages: number
    hasNextPage: boolean
    searchQuery: string
    searchFilters: Record<string, string>
  }
}

export interface EpisodeInfo {
  number: number
  title: string
  episodeId: string
  isFiller: boolean
}

export interface EpisodeSource {
  url: string
  isM3U8: boolean
  quality?: string
}

export interface SkipTime {
  interval: {
    startTime: number
    endTime: number
  }
  skipType: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap'
  skipId: string
  episodeLength: number
}

// Create auth headers
export const auth = (token?: string) => ({
  headers: {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  }
})

export class TatakaiAPI {
  // Authentication
  static async login(email: string, password: string) {
    const response = await fetch(`${TATAKAI_API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    return response.json()
  }

  static async register(username: string, email: string, password: string) {
    const response = await fetch(`${TATAKAI_API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    })
    return response.json()
  }

  static async getCurrentUser(token: string) {
    const response = await fetch(`${TATAKAI_API_BASE}/api/auth/me`, auth(token))
    return response.json()
  }

  // Watch History
  static async addWatchHistory(token: string, animeId: string, episode: number, progress: number, completed: boolean = false) {
    const response = await fetch(`${TATAKAI_API_BASE}/api/watch-history`, {
      method: 'POST',
      ...auth(token),
      body: JSON.stringify({ animeId, episode, progress, completed })
    })
    return response.json()
  }

  static async getWatchHistory(token: string, page: number = 1) {
    const response = await fetch(`${TATAKAI_API_BASE}/api/watch-history?page=${page}`, auth(token))
    return response.json()
  }

  static async getRecentlyWatched(token: string) {
    const response = await fetch(`${TATAKAI_API_BASE}/api/watch-history/recent`, auth(token))
    return response.json()
  }

  // Favorites
  static async addToFavorites(token: string, animeId: string, rating?: number, notes?: string) {
    const response = await fetch(`${TATAKAI_API_BASE}/api/favorites`, {
      method: 'POST',
      ...auth(token),
      body: JSON.stringify({ animeId, rating, notes })
    })
    return response.json()
  }

  static async getFavorites(token: string, page: number = 1) {
    const response = await fetch(`${TATAKAI_API_BASE}/api/favorites?page=${page}`, auth(token))
    return response.json()
  }

  static async isFavorited(token: string, animeId: string) {
    const response = await fetch(`${TATAKAI_API_BASE}/api/favorites/check/${animeId}`, auth(token))
    return response.json()
  }

  static async removeFromFavorites(token: string, animeId: string) {
    const response = await fetch(`${TATAKAI_API_BASE}/api/favorites/${animeId}`, {
      method: 'DELETE',
      ...auth(token)
    })
    return response.json()
  }
}

export class AnimeAPI {
  // Home page data
  static async getHomePage(): Promise<HomePageData> {
    const response = await fetch(`${HIANIME_API_BASE}/home`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json()
  }

  // Search anime
  static async searchAnime(query: string, page: number = 1): Promise<SearchResult> {
    const response = await fetch(`${HIANIME_API_BASE}/search?q=${encodeURIComponent(query)}&page=${page}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json()
  }

  // Get anime info
  static async getAnimeInfo(animeId: string) {
    const response = await fetch(`${HIANIME_API_BASE}/anime/${animeId}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json()
  }

  // Get anime episodes
  static async getAnimeEpisodes(animeId: string) {
    const response = await fetch(`${HIANIME_API_BASE}/anime/${animeId}/episodes`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json()
  }

  // Get episode servers
  static async getEpisodeServers(episodeId: string) {
    const response = await fetch(`${HIANIME_API_BASE}/episode/servers?animeEpisodeId=${encodeURIComponent(episodeId)}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json()
  }

  // Get episode sources
  static async getEpisodeSources(episodeId: string, server: string = 'hd-1', category: 'sub' | 'dub' | 'raw' = 'sub') {
    const response = await fetch(`${HIANIME_API_BASE}/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${category}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json()
  }

  // Get skip times
  static async getSkipTimes(malId: number, episode: number): Promise<SkipTime[]> {
    try {
      const response = await fetch(`${TATAKAI_API_BASE}/api/anime/skip-times/${malId}/${episode}`)
      if (!response.ok) {
        return []
      }
      const data = await response.json()
      return data.found ? data.results : []
    } catch (error) {
      console.error('Error fetching skip times:', error)
      return []
    }
  }

  // Get search suggestions
  static async getSearchSuggestions(query: string) {
    const response = await fetch(`${HIANIME_API_BASE}/search/suggestion?q=${encodeURIComponent(query)}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json()
  }

  // Get category anime
  static async getCategoryAnime(category: string, page: number = 1) {
    const response = await fetch(`${HIANIME_API_BASE}/category/${category}?page=${page}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json()
  }

  // Get genre anime
  static async getGenreAnime(genre: string, page: number = 1) {
    const response = await fetch(`${HIANIME_API_BASE}/genre/${genre}?page=${page}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json()
  }
}