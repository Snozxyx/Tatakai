export interface Anime {
  id: string;
  title: string;
  image: string;
  episodeCount?: number;
  year?: number;
  status?: string;
  description?: string;
  genres?: string[];
  rating?: number;
  trailer?: string;
}

export interface AnimeResponse {
  data: Anime[];
  pagination?: {
    current_page: number;
    has_next_page: boolean;
    total: number;
  };
}

class ApiService {
  private baseUrl = '/api/v4';
  private requestQueue: Promise<any> = Promise.resolve();
  
  // Add delay between requests to avoid rate limiting
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Queue requests to avoid hitting rate limits
  private async queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    this.requestQueue = this.requestQueue.then(async () => {
      await this.delay(300); // 300ms delay between requests
      return requestFn();
    });
    return this.requestQueue;
  }
  
  async get(endpoint: string): Promise<any> {
    return this.queueRequest(async () => {
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
    });
  }

  async getTopAnime(page: number = 1): Promise<AnimeResponse> {
    const response = await this.get(`/top/anime?page=${page}`);
    return {
      data: response.data?.map(this.transformAnime) || [],
      pagination: response.pagination
    };
  }

  async getSeasonNow(page: number = 1): Promise<AnimeResponse> {
    const response = await this.get(`/seasons/now?page=${page}`);
    return {
      data: response.data?.map(this.transformAnime) || [],
      pagination: response.pagination
    };
  }

  async searchAnime(query: string, page: number = 1): Promise<AnimeResponse> {
    const response = await this.get(`/anime?q=${encodeURIComponent(query)}&page=${page}`);
    return {
      data: response.data?.map(this.transformAnime) || [],
      pagination: response.pagination
    };
  }

  async getAnimeById(id: string): Promise<Anime> {
    const response = await this.get(`/anime/${id}`);
    return this.transformAnime(response.data);
  }

  async getRecentlyAdded(page: number = 1): Promise<AnimeResponse> {
    const response = await this.get(`/top/anime?filter=airing&page=${page}`);
    return {
      data: response.data?.map(this.transformAnime) || [],
      pagination: response.pagination
    };
  }

  private transformAnime(apiAnime: any): Anime {
    return {
      id: apiAnime.mal_id?.toString() || '',
      title: apiAnime.title || apiAnime.title_english || '',
      image: apiAnime.images?.jpg?.large_image_url || apiAnime.images?.jpg?.image_url || '',
      episodeCount: apiAnime.episodes,
      year: apiAnime.year || new Date(apiAnime.aired?.from).getFullYear(),
      status: apiAnime.status?.toLowerCase(),
      description: apiAnime.synopsis,
      genres: apiAnime.genres?.map((g: any) => g.name) || [],
      rating: apiAnime.score,
      trailer: apiAnime.trailer?.url
    };
  }
}

export const apiService = new ApiService();