export interface Anime {
  id: string;
  title: string;
  image: string;
  episodeCount?: {
    sub: number;
    dub: number;
  };
  year?: number;
  status?: string;
  description?: string;
  genres?: string[];
  rating?: string;
  trailer?: string;
  type?: string;
  duration?: string;
  jname?: string;
}

export interface AnimeResponse {
  data: Anime[];
  pagination?: {
    currentPage: number;
    hasNextPage: boolean;
    totalPages: number;
  };
}

export interface HomeData {
  spotlightAnimes: Anime[];
  trendingAnimes: Anime[];
  topAiringAnimes: Anime[];
  mostPopularAnimes: Anime[];
  latestEpisodeAnimes: Anime[];
  latestCompletedAnimes: Anime[];
  mostFavoriteAnimes: Anime[];
}

class ApiService {
  private baseUrl = '/api/v2/hianime';
  
  async get(endpoint: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  async getHomeData(): Promise<HomeData> {
    const response = await this.get('/home');
    const data = response.data;
    
    return {
      spotlightAnimes: data.spotlightAnimes?.map(this.transformAnime) || [],
      trendingAnimes: data.trendingAnimes?.map(this.transformAnime) || [],
      topAiringAnimes: data.topAiringAnimes?.map(this.transformAnime) || [],
      mostPopularAnimes: data.mostPopularAnimes?.map(this.transformAnime) || [],
      latestEpisodeAnimes: data.latestEpisodeAnimes?.map(this.transformAnime) || [],
      latestCompletedAnimes: data.latestCompletedAnimes?.map(this.transformAnime) || [],
      mostFavoriteAnimes: data.mostFavoriteAnimes?.map(this.transformAnime) || []
    };
  }

  async searchAnime(query: string, page: number = 1): Promise<AnimeResponse> {
    const response = await this.get(`/search?q=${encodeURIComponent(query)}&page=${page}`);
    return {
      data: response.data?.animes?.map(this.transformAnime) || [],
      pagination: {
        currentPage: response.data?.currentPage || 1,
        hasNextPage: response.data?.hasNextPage || false,
        totalPages: response.data?.totalPages || 1
      }
    };
  }

  async getCategoryAnimes(category: string, page: number = 1): Promise<AnimeResponse> {
    const response = await this.get(`/category/${category}?page=${page}`);
    return {
      data: response.data?.animes?.map(this.transformAnime) || [],
      pagination: {
        currentPage: response.data?.currentPage || 1,
        hasNextPage: response.data?.hasNextPage || false,
        totalPages: response.data?.totalPages || 1
      }
    };
  }

  async getAnimeById(id: string): Promise<Anime> {
    const response = await this.get(`/anime/${id}`);
    return this.transformAnime(response.data.anime);
  }

  // Convenience methods for specific categories
  async getTrendingAnimes(page: number = 1): Promise<AnimeResponse> {
    return this.getCategoryAnimes('most-popular', page);
  }

  async getTopRatedAnimes(page: number = 1): Promise<AnimeResponse> {
    return this.getCategoryAnimes('most-favorite', page);
  }

  async getRecentlyAdded(page: number = 1): Promise<AnimeResponse> {
    return this.getCategoryAnimes('recently-added', page);
  }

  async getMovies(page: number = 1): Promise<AnimeResponse> {
    return this.getCategoryAnimes('movie', page);
  }

  async getTVSeries(page: number = 1): Promise<AnimeResponse> {
    return this.getCategoryAnimes('tv', page);
  }

  private transformAnime(apiAnime: any): Anime {
    return {
      id: apiAnime.id || '',
      title: apiAnime.name || apiAnime.title || '',
      image: apiAnime.poster || '',
      episodeCount: apiAnime.episodes || { sub: 0, dub: 0 },
      type: apiAnime.type || '',
      status: apiAnime.status?.toLowerCase(),
      description: apiAnime.description || '',
      genres: apiAnime.genres || [],
      rating: apiAnime.rating || apiAnime.malscore || '',
      duration: apiAnime.duration || '',
      jname: apiAnime.jname || ''
    };
  }
}

export const apiService = new ApiService();