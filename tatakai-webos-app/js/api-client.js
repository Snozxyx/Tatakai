/**
 * Tatakai Anime API Client
 * Production API client following tatakai-app architecture
 */
class TatakaiAnimeAPI {
    static BASE_URL = 'https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime';

    /**
     * Generic fetch wrapper for API calls
     */
    static async fetchAPI(endpoint, options = {}) {
        try {
            const url = `${this.BASE_URL}${endpoint}`;
            console.log('Fetching:', url);
            
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Web0S; Linux; SmartTV) Tatakai/1.0.0',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Transform the response to match our expected structure
            const transformedData = {
                success: data.status === 200,
                data: data.data || data,
                status: data.status
            };
            
            return transformedData;
        } catch (error) {
            console.error('API Error:', error);
            throw new Error(`Failed to fetch data: ${error.message}`);
        }
    }

    /**
     * Get home page data
     */
    static async getHomePage() {
        return await this.fetchAPI('/home');
    }

    /**
     * Search anime
     */
    static async searchAnime(query, page = 1, filters = {}) {
        let endpoint = `/search?q=${encodeURIComponent(query)}&page=${page}`;
        
        // Add filters if provided
        if (filters.type) endpoint += `&type=${filters.type}`;
        if (filters.status) endpoint += `&status=${filters.status}`;
        if (filters.genres) endpoint += `&genres=${filters.genres}`;

        return await this.fetchAPI(endpoint);
    }

    /**
     * Get anime details
     */
    static async getAnimeInfo(animeId) {
        return await this.fetchAPI(`/anime/${animeId}`);
    }

    /**
     * Get anime episodes
     */
    static async getAnimeEpisodes(animeId) {
        return await this.fetchAPI(`/anime/${animeId}/episodes`);
    }

    /**
     * Get episode servers
     */
    static async getEpisodeServers(episodeId) {
        return await this.fetchAPI(`/episode/servers?animeEpisodeId=${encodeURIComponent(episodeId)}`);
    }

    /**
     * Get episode streaming sources
     */
    static async getEpisodeSources(episodeId, server = 'hd-1', category = 'sub') {
        return await this.fetchAPI(`/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${encodeURIComponent(server)}&category=${category}`);
    }

    /**
     * Get anime by category
     */
    static async getAnimeByCategory(category, page = 1) {
        return await this.fetchAPI(`/category/${category}?page=${page}`);
    }

    /**
     * Get anime by genre
     */
    static async getAnimeByGenre(genre, page = 1) {
        return await this.fetchAPI(`/genre/${genre}?page=${page}`);
    }
}

// Replace the original AnimeAPI with TatakaiAnimeAPI
window.AnimeAPI = TatakaiAnimeAPI;