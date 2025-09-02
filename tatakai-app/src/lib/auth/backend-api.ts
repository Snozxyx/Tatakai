// Backend API client for authentication and user data
const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

interface User {
  id: string;
  username: string;
  email: string;
  profile: {
    displayName?: string;
    avatar?: string;
    bio?: string;
    preferences: {
      theme: 'light' | 'dark' | 'system';
      language: string;
      autoPlay: boolean;
      autoSkip: boolean;
    };
  };
  isEmailVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

interface AuthResponse {
  success: boolean;
  message?: string;
  data?: {
    token: string;
    user: User;
  };
  errors?: ValidationError[];
}

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: ValidationError[];
}

interface ValidationError {
  msg: string;
  param: string;
  location: string;
}

// Watch history types
interface WatchHistoryItem {
  _id: string;
  animeId: string;
  animeTitle: string;
  animePoster?: string;
  episode: {
    number: number;
    title?: string;
    id: string;
  };
  progress: {
    currentTime: number;
    duration: number;
    percentage: number;
  };
  isCompleted: boolean;
  lastWatchedAt: string;
}

interface Pagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// Favorites types
interface FavoriteItem {
  _id: string;
  animeId: string;
  animeTitle: string;
  animePoster?: string;
  animeType: string;
  animeStatus: string;
  animeRating?: string;
  genres: string[];
  personalRating?: number;
  notes?: string;
  addedAt: string;
}

interface GenreStat {
  _id: string;
  count: number;
}

interface RecommendationData {
  favoriteGenres: string[];
  favoriteTypes: string[];
  averageRating: number;
  totalFavorites: number;
}

class BackendAPI {
  private static getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  private static async makeRequest<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
        headers: this.getAuthHeaders(),
        ...options,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Authentication methods
  static async register(userData: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<AuthResponse> {
    return this.makeRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  static async login(credentials: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    return this.makeRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  static async getCurrentUser(): Promise<ApiResponse<{ user: User }>> {
    return this.makeRequest('/auth/me');
  }

  static async refreshToken(): Promise<ApiResponse<{ token: string }>> {
    return this.makeRequest('/auth/refresh', {
      method: 'POST',
    });
  }

  // User profile methods
  static async updateProfile(profileData: {
    displayName?: string;
    bio?: string;
    avatar?: string;
    preferences?: Partial<User['profile']['preferences']>;
  }): Promise<ApiResponse<{ user: User }>> {
    return this.makeRequest('/user/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  }

  static async changePassword(passwordData: {
    currentPassword: string;
    newPassword: string;
  }): Promise<ApiResponse> {
    return this.makeRequest('/user/password', {
      method: 'PUT',
      body: JSON.stringify(passwordData),
    });
  }

  // Watch history methods
  static async getWatchHistory(page = 1, limit = 20): Promise<ApiResponse<{
    history: WatchHistoryItem[];
    pagination: Pagination;
  }>> {
    return this.makeRequest(`/watch-history?page=${page}&limit=${limit}`);
  }

  static async updateWatchProgress(progressData: {
    animeId: string;
    animeTitle: string;
    animePoster?: string;
    episode: {
      number: number;
      title?: string;
      id: string;
    };
    progress: {
      currentTime: number;
      duration: number;
    };
  }): Promise<ApiResponse> {
    return this.makeRequest('/watch-history', {
      method: 'POST',
      body: JSON.stringify(progressData),
    });
  }

  static async getAnimeProgress(animeId: string): Promise<ApiResponse<{
    animeId: string;
    episodes: WatchHistoryItem[];
  }>> {
    return this.makeRequest(`/watch-history/anime/${animeId}`);
  }

  static async getRecentlyWatched(limit = 10): Promise<ApiResponse<{
    recentAnime: WatchHistoryItem[];
  }>> {
    return this.makeRequest(`/watch-history/recent?limit=${limit}`);
  }

  // Favorites methods
  static async getFavorites(page = 1, limit = 20, sortBy = 'addedAt', sortOrder = 'desc'): Promise<ApiResponse<{
    favorites: FavoriteItem[];
    pagination: Pagination;
  }>> {
    return this.makeRequest(`/favorites?page=${page}&limit=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}`);
  }

  static async addToFavorites(favoriteData: {
    animeId: string;
    animeTitle: string;
    animePoster?: string;
    animeType?: string;
    animeStatus?: string;
    animeRating?: string;
    genres?: string[];
    personalRating?: number;
    notes?: string;
  }): Promise<ApiResponse> {
    return this.makeRequest('/favorites', {
      method: 'POST',
      body: JSON.stringify(favoriteData),
    });
  }

  static async removeFromFavorites(animeId: string): Promise<ApiResponse> {
    return this.makeRequest(`/favorites/${animeId}`, {
      method: 'DELETE',
    });
  }

  static async checkIsFavorited(animeId: string): Promise<ApiResponse<{
    isFavorited: boolean;
    favorite: FavoriteItem | null;
  }>> {
    return this.makeRequest(`/favorites/check/${animeId}`);
  }

  static async updateFavorite(animeId: string, updateData: {
    personalRating?: number;
    notes?: string;
    genres?: string[];
  }): Promise<ApiResponse> {
    return this.makeRequest(`/favorites/${animeId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  }

  static async getFavoriteStats(): Promise<ApiResponse<{
    totalCount: number;
    favoriteGenres: GenreStat[];
    recommendationData: RecommendationData;
  }>> {
    return this.makeRequest('/favorites/stats');
  }

  // Enhanced anime methods (using backend proxy)
  static async getAnimeWithUserData(animeId: string): Promise<ApiResponse> {
    return this.makeRequest(`/anime/info/${animeId}`);
  }

  static async getSkipTimes(malId: number, episode: number, episodeLength: number): Promise<unknown> {
    try {
      return await this.makeRequest(`/anime/skip-times/${malId}/${episode}?episodeLength=${episodeLength}`);
    } catch {
      // Return empty response for skip times errors to not break playback
      return {
        found: false,
        results: [],
        message: 'Skip times not available',
        statusCode: 404
      };
    }
  }
}

export default BackendAPI;
export type { User, AuthResponse, ApiResponse };