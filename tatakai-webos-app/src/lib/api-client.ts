interface AnimeData {
  id: string
  title: string
  image: string
  description?: string
  rating?: number
  episodes?: number
  status?: string
  genres?: string[]
}

export class ApiClient {
  private readonly baseUrl: string = 'https://api.jikan.moe/v4'
  private cache: Map<string, any> = new Map()

  async fetchTrendingAnime(): Promise<AnimeData[]> {
    try {
      const cacheKey = 'trending'
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)
      }

      const response = await fetch(`${this.baseUrl}/top/anime?limit=20`)
      const data = await response.json()
      
      const animeList = data.data.map((anime: any) => ({
        id: anime.mal_id.toString(),
        title: anime.title,
        image: anime.images.jpg.large_image_url,
        description: anime.synopsis,
        rating: anime.score,
        episodes: anime.episodes,
        status: anime.status,
        genres: anime.genres?.map((g: any) => g.name) || []
      }))

      this.cache.set(cacheKey, animeList)
      return animeList
    } catch (error) {
      console.error('Error fetching trending anime:', error)
      return []
    }
  }

  async searchAnime(query: string): Promise<AnimeData[]> {
    try {
      if (!query.trim()) return []

      const response = await fetch(`${this.baseUrl}/anime?q=${encodeURIComponent(query)}&limit=20`)
      const data = await response.json()
      
      return data.data.map((anime: any) => ({
        id: anime.mal_id.toString(),
        title: anime.title,
        image: anime.images.jpg.large_image_url,
        description: anime.synopsis,
        rating: anime.score,
        episodes: anime.episodes,
        status: anime.status,
        genres: anime.genres?.map((g: any) => g.name) || []
      }))
    } catch (error) {
      console.error('Error searching anime:', error)
      return []
    }
  }

  async getAnimeDetails(id: string): Promise<AnimeData | null> {
    try {
      const response = await fetch(`${this.baseUrl}/anime/${id}`)
      const data = await response.json()
      const anime = data.data

      return {
        id: anime.mal_id.toString(),
        title: anime.title,
        image: anime.images.jpg.large_image_url,
        description: anime.synopsis,
        rating: anime.score,
        episodes: anime.episodes,
        status: anime.status,
        genres: anime.genres?.map((g: any) => g.name) || []
      }
    } catch (error) {
      console.error('Error fetching anime details:', error)
      return null
    }
  }

  async getFeaturedAnime(): Promise<AnimeData | null> {
    try {
      const response = await fetch(`${this.baseUrl}/seasons/now?limit=1`)
      const data = await response.json()
      
      if (data.data && data.data.length > 0) {
        const anime = data.data[0]
        return {
          id: anime.mal_id.toString(),
          title: anime.title,
          image: anime.images.jpg.large_image_url,
          description: anime.synopsis,
          rating: anime.score,
          episodes: anime.episodes,
          status: anime.status,
          genres: anime.genres?.map((g: any) => g.name) || []
        }
      }
      return null
    } catch (error) {
      console.error('Error fetching featured anime:', error)
      return null
    }
  }
}