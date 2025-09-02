/**
 * API Client for HiAnime API
 * Handles all API calls to the backend
 */
class AnimeAPI {
    static BASE_URL = 'https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime';

    /**
     * Generic fetch wrapper with error handling
     */
    static async fetchAPI(endpoint, options = {}) {
        try {
            const url = `${this.BASE_URL}${endpoint}`;
            console.log('Fetching:', url);
            
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Web0S; rv:1.0) Gecko/20100101 Firefox/1.0',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    /**
     * Get home page data
     */
    static async getHomePage() {
        try {
            const data = await this.fetchAPI('/home');
            return data;
        } catch (error) {
            console.error('Error fetching home page:', error);
            throw error;
        }
    }

    /**
     * Search anime
     */
    static async searchAnime(query, page = 1, filters = {}) {
        try {
            let endpoint = `/search?q=${encodeURIComponent(query)}&page=${page}`;
            
            // Add filters if provided
            if (filters.type) endpoint += `&type=${filters.type}`;
            if (filters.status) endpoint += `&status=${filters.status}`;
            if (filters.genres) endpoint += `&genres=${filters.genres}`;
            if (filters.sort) endpoint += `&sort=${filters.sort}`;
            if (filters.season) endpoint += `&season=${filters.season}`;
            if (filters.language) endpoint += `&language=${filters.language}`;
            if (filters.rated) endpoint += `&rated=${filters.rated}`;
            if (filters.start_date) endpoint += `&start_date=${filters.start_date}`;
            if (filters.end_date) endpoint += `&end_date=${filters.end_date}`;
            if (filters.score) endpoint += `&score=${filters.score}`;

            const data = await this.fetchAPI(endpoint);
            return data;
        } catch (error) {
            console.error('Error searching anime:', error);
            throw error;
        }
    }

    /**
     * Get search suggestions
     */
    static async getSearchSuggestions(query) {
        try {
            const data = await this.fetchAPI(`/search/suggestion?q=${encodeURIComponent(query)}`);
            return data;
        } catch (error) {
            console.error('Error fetching search suggestions:', error);
            throw error;
        }
    }

    /**
     * Get anime details
     */
    static async getAnimeInfo(animeId) {
        try {
            const data = await this.fetchAPI(`/anime/${animeId}`);
            return data;
        } catch (error) {
            console.error('Error fetching anime info:', error);
            throw error;
        }
    }

    /**
     * Get anime episodes
     */
    static async getAnimeEpisodes(animeId) {
        try {
            const data = await this.fetchAPI(`/anime/${animeId}/episodes`);
            return data;
        } catch (error) {
            console.error('Error fetching anime episodes:', error);
            throw error;
        }
    }

    /**
     * Get episode servers
     */
    static async getEpisodeServers(episodeId) {
        try {
            const data = await this.fetchAPI(`/episode/servers?animeEpisodeId=${encodeURIComponent(episodeId)}`);
            return data;
        } catch (error) {
            console.error('Error fetching episode servers:', error);
            throw error;
        }
    }

    /**
     * Get episode streaming sources
     */
    static async getEpisodeSources(episodeId, server = 'hd-1', category = 'sub') {
        try {
            const data = await this.fetchAPI(`/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${category}`);
            return data;
        } catch (error) {
            console.error('Error fetching episode sources:', error);
            throw error;
        }
    }

    /**
     * Get anime by category
     */
    static async getAnimeByCategory(category, page = 1) {
        try {
            const data = await this.fetchAPI(`/category/${category}?page=${page}`);
            return data;
        } catch (error) {
            console.error('Error fetching anime by category:', error);
            throw error;
        }
    }

    /**
     * Get anime by genre
     */
    static async getAnimeByGenre(genre, page = 1) {
        try {
            const data = await this.fetchAPI(`/genre/${genre}?page=${page}`);
            return data;
        } catch (error) {
            console.error('Error fetching anime by genre:', error);
            throw error;
        }
    }

    /**
     * Get anime by producer
     */
    static async getAnimeByProducer(producer, page = 1) {
        try {
            const data = await this.fetchAPI(`/producer/${producer}?page=${page}`);
            return data;
        } catch (error) {
            console.error('Error fetching anime by producer:', error);
            throw error;
        }
    }

    /**
     * Get anime A-Z list
     */
    static async getAnimeAZList(sortOption = 'all', page = 1) {
        try {
            const data = await this.fetchAPI(`/azlist/${sortOption}?page=${page}`);
            return data;
        } catch (error) {
            console.error('Error fetching A-Z list:', error);
            throw error;
        }
    }

    /**
     * Get anime schedule
     */
    static async getAnimeSchedule(date) {
        try {
            const data = await this.fetchAPI(`/schedule?date=${date}`);
            return data;
        } catch (error) {
            console.error('Error fetching anime schedule:', error);
            throw error;
        }
    }

    /**
     * Get anime quick tip info
     */
    static async getAnimeQtip(animeId) {
        try {
            const data = await this.fetchAPI(`/qtip/${animeId}`);
            return data;
        } catch (error) {
            console.error('Error fetching anime qtip:', error);
            throw error;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnimeAPI;
} else {
    window.AnimeAPI = AnimeAPI;
}