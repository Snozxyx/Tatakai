// API client for HiAnime backend integration
// Based on backend.md documentation

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://aniwatch-api-taupe-eight.vercel.app'

export interface AnimeBase {
  id: string
  name: string
  poster: string
  type: string
  episodes: {
    sub: number
    dub: number
  }
}

export interface SpotlightAnime extends AnimeBase {
  jname: string
  description: string
  rank: number
  otherInfo: string[]
}

export interface AnimeDetails {
  id: string
  name: string
  poster?: string
  malscore: string
  quality: string
  episodes: {
    sub: number
    dub: number
  }
  type: string
  description: string
  jname: string
  synonyms: string
  aired: string
  status: string
  genres: string[]
}

export interface Episode {
  number: number
  title: string
  episodeId: string
  isFiller: boolean
}

export interface HomePageData {
  genres: string[]
  latestEpisodeAnimes: AnimeBase[]
  spotlightAnimes: SpotlightAnime[]
  top10Animes: {
    today: AnimeBase[]
    week: AnimeBase[]
    month: AnimeBase[]
  }
  topAiringAnimes: AnimeBase[]
  topUpcomingAnimes: AnimeBase[]
  trendingAnimes: AnimeBase[]
  mostPopularAnimes: AnimeBase[]
}

export interface SearchResult {
  animes: AnimeBase[]
  totalPages: number
  currentPage: number
  hasNextPage: boolean
}

export interface StreamingData {
  sources: Array<{
    url: string
    quality: string
    isM3U8: boolean
  }>
  subtitles: Array<{
    url: string
    lang: string
  }>
  intro?: {
    start: number
    end: number
  }
  outro?: {
    start: number
    end: number
  }
}

class ApiClient {
  private baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  private async fetchAPI<T>(endpoint: string): Promise<T> {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      
      if (!data.success) {
        throw new Error('API request failed')
      }

      return data.data
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error)
      throw error
    }
  }

  // Get home page data with all sections
  async getHomePage(): Promise<HomePageData> {
    return this.fetchAPI<HomePageData>('/api/v2/hianime/home')
  }

  // Get anime details by ID
  async getAnimeDetails(animeId: string): Promise<AnimeDetails> {
    return this.fetchAPI<AnimeDetails>(`/api/v2/hianime/anime/${animeId}`)
  }

  // Get anime episodes
  async getAnimeEpisodes(animeId: string): Promise<{ totalEpisodes: number; episodes: Episode[] }> {
    return this.fetchAPI<{ totalEpisodes: number; episodes: Episode[] }>(`/api/v2/hianime/anime/${animeId}/episodes`)
  }

  // Search anime
  async searchAnime(query: string, page: number = 1): Promise<SearchResult> {
    return this.fetchAPI<SearchResult>(`/api/v2/hianime/search?q=${encodeURIComponent(query)}&page=${page}`)
  }

  // Get anime by genre
  async getAnimeByGenre(genre: string, page: number = 1): Promise<SearchResult> {
    return this.fetchAPI<SearchResult>(`/api/v2/hianime/genre/${encodeURIComponent(genre)}?page=${page}`)
  }

  // Get streaming data for episode
  async getStreamingData(episodeId: string): Promise<StreamingData> {
    return this.fetchAPI<StreamingData>(`/api/v2/hianime/episode/sources?animeEpisodeId=${episodeId}`)
  }

  // Get anime quick info (tooltip data)
  async getAnimeQuickInfo(animeId: string): Promise<{ anime: AnimeDetails }> {
    return this.fetchAPI<{ anime: AnimeDetails }>(`/api/v2/hianime/anime/${animeId}/qtip`)
  }
}

// Export singleton instance
export const apiClient = new ApiClient()

// React Query query keys
export const queryKeys = {
  homePage: ['homePage'],
  animeDetails: (id: string) => ['animeDetails', id],
  animeEpisodes: (id: string) => ['animeEpisodes', id],
  search: (query: string, page: number) => ['search', query, page],
  genre: (genre: string, page: number) => ['genre', genre, page],
  streamingData: (episodeId: string) => ['streamingData', episodeId],
  quickInfo: (id: string) => ['quickInfo', id],
} as const