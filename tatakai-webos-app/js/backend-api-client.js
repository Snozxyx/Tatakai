/**
 * Backend API Client for WebOS App
 * Handles authentication and backend data integration
 */
class BackendAPIClient {
    static BASE_URL = 'http://localhost:5000/api';
    static _authToken = null;
    static _currentUser = null;

    /**
     * Initialize backend connection
     */
    static async init() {
        try {
            // Try to restore auth token from localStorage
            const token = localStorage.getItem('auth_token');
            if (token) {
                BackendAPIClient._authToken = token;
                // Verify token is still valid
                try {
                    const userData = await BackendAPIClient.getCurrentUser();
                    if (userData.success) {
                        BackendAPIClient._currentUser = userData.data.user;
                        console.log('User authenticated:', BackendAPIClient._currentUser.username);
                    }
                } catch {
                    // Token invalid, clear it
                    BackendAPIClient.logout();
                }
            }
            console.log('Backend API client initialized');
        } catch (error) {
            console.warn('Backend connection failed, continuing without auth:', error);
        }
    }

    /**
     * Get auth headers
     */
    static getAuthHeaders() {
        return {
            'Content-Type': 'application/json',
            ...(BackendAPIClient._authToken && { 
                Authorization: `Bearer ${BackendAPIClient._authToken}` 
            }),
        };
    }

    /**
     * Make authenticated request
     */
    static async makeRequest(endpoint, options = {}) {
        try {
            const response = await fetch(`${BackendAPIClient.BASE_URL}${endpoint}`, {
                headers: BackendAPIClient.getAuthHeaders(),
                ...options,
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('Backend API request failed:', error);
            throw error;
        }
    }

    /**
     * Authentication methods
     */
    static async login(email, password) {
        try {
            const response = await BackendAPIClient.makeRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });

            if (response.success && response.data) {
                BackendAPIClient._authToken = response.data.token;
                BackendAPIClient._currentUser = response.data.user;
                localStorage.setItem('auth_token', response.data.token);
                return response;
            }
            throw new Error(response.message || 'Login failed');
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    static async register(userData) {
        try {
            const response = await BackendAPIClient.makeRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify(userData),
            });

            if (response.success && response.data) {
                BackendAPIClient._authToken = response.data.token;
                BackendAPIClient._currentUser = response.data.user;
                localStorage.setItem('auth_token', response.data.token);
                return response;
            }
            throw new Error(response.message || 'Registration failed');
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    static async getCurrentUser() {
        return BackendAPIClient.makeRequest('/auth/me');
    }

    static logout() {
        BackendAPIClient._authToken = null;
        BackendAPIClient._currentUser = null;
        localStorage.removeItem('auth_token');
    }

    /**
     * Watch History methods
     */
    static async updateWatchProgress(progressData) {
        try {
            return await BackendAPIClient.makeRequest('/watch-history', {
                method: 'POST',
                body: JSON.stringify(progressData),
            });
        } catch (error) {
            console.warn('Failed to update watch progress:', error);
            // Don't throw error to avoid breaking playback
            return { success: false };
        }
    }

    static async getWatchHistory(page = 1, limit = 20) {
        try {
            return await BackendAPIClient.makeRequest(`/watch-history?page=${page}&limit=${limit}`);
        } catch (error) {
            console.warn('Failed to get watch history:', error);
            return { success: false, data: { history: [], pagination: {} } };
        }
    }

    static async getAnimeProgress(animeId) {
        try {
            return await BackendAPIClient.makeRequest(`/watch-history/anime/${animeId}`);
        } catch (error) {
            console.warn('Failed to get anime progress:', error);
            return { success: false, data: { episodes: [] } };
        }
    }

    /**
     * Favorites methods
     */
    static async getFavorites(page = 1, limit = 20) {
        try {
            return await BackendAPIClient.makeRequest(`/favorites?page=${page}&limit=${limit}`);
        } catch (error) {
            console.warn('Failed to get favorites:', error);
            return { success: false, data: { favorites: [], pagination: {} } };
        }
    }

    static async addToFavorites(animeData) {
        try {
            return await BackendAPIClient.makeRequest('/favorites', {
                method: 'POST',
                body: JSON.stringify(animeData),
            });
        } catch (error) {
            console.warn('Failed to add to favorites:', error);
            return { success: false };
        }
    }

    static async removeFromFavorites(animeId) {
        try {
            return await BackendAPIClient.makeRequest(`/favorites/${animeId}`, {
                method: 'DELETE',
            });
        } catch (error) {
            console.warn('Failed to remove from favorites:', error);
            return { success: false };
        }
    }

    static async checkIsFavorited(animeId) {
        try {
            return await BackendAPIClient.makeRequest(`/favorites/check/${animeId}`);
        } catch (error) {
            console.warn('Failed to check favorite status:', error);
            return { success: false, data: { isFavorited: false } };
        }
    }

    /**
     * Enhanced anime methods
     */
    static async getSkipTimes(malId, episode, episodeLength) {
        try {
            return await BackendAPIClient.makeRequest(`/anime/skip-times/${malId}/${episode}?episodeLength=${episodeLength}`);
        } catch (error) {
            console.warn('Failed to get skip times:', error);
            return {
                found: false,
                results: [],
                message: 'Skip times not available',
                statusCode: 404
            };
        }
    }

    /**
     * Utility methods
     */
    static isAuthenticated() {
        return !!BackendAPIClient._authToken && !!BackendAPIClient._currentUser;
    }

    static getCurrentUser() {
        return BackendAPIClient._currentUser;
    }

    static getAuthToken() {
        return BackendAPIClient._authToken;
    }
}

// Initialize backend client when loaded
if (typeof window !== 'undefined') {
    BackendAPIClient.init();
    window.BackendAPIClient = BackendAPIClient;
}