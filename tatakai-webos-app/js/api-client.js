/**
 * Tatakai Anime API Client
 * Production API client following tatakai-app architecture
 */
class TatakaiAnimeAPI {
    static BASE_URL = 'https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime';
    static LOCAL_PROXY = 'http://localhost:3001/api';

    /**
     * Generic fetch wrapper for API calls
     */
    static async fetchAPI(endpoint, options = {}) {
        try {
            let url = `${this.BASE_URL}${endpoint}`;
            
            console.log('Fetching:', url);
            
            const response = await fetch(url, {
                mode: 'cors',
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
            
            // Return fallback data for demo purposes
            if (endpoint === '/home') {
                return this.getFallbackHomeData();
            }
            
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

    /**
     * Get fallback home data for demo purposes
     */
    static getFallbackHomeData() {
        return {
            success: true,
            data: {
                genres: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Romance', 'Sci-Fi'],
                latestEpisodeAnimes: [
                    {
                        id: 'demon-slayer-kimetsu-no-yaiba-swordsmith-village-arc-18056',
                        name: 'Demon Slayer: Swordsmith Village Arc',
                        poster: 'https://cdn.noitatnemucod.net/thumbnail/300x400/100/bcd84731a3eda4f4a306250769675065.jpg',
                        type: 'TV',
                        episodes: { sub: 11, dub: 11 }
                    },
                    {
                        id: 'jujutsu-kaisen-2nd-season-18413',
                        name: 'Jujutsu Kaisen 2nd Season',
                        poster: 'https://cdn.noitatnemucod.net/thumbnail/300x400/100/bcd84731a3eda4f4a306250769675066.jpg',
                        type: 'TV',
                        episodes: { sub: 23, dub: 23 }
                    }
                ],
                spotlightAnimes: [
                    {
                        id: 'one-piece-100',
                        name: 'One Piece',
                        jname: 'ワンピース',
                        poster: 'https://cdn.noitatnemucod.net/thumbnail/300x400/100/bcd84731a3eda4f4a306250769675067.jpg',
                        description: 'Follow Monkey D. Luffy, a young pirate who gains rubber powers after eating a Devil Fruit.',
                        rank: 1,
                        otherInfo: ['TV', 'Ongoing', '1999']
                    }
                ],
                top10Animes: {
                    today: [],
                    week: [],
                    month: []
                },
                topAiringAnimes: [],
                topUpcomingAnimes: [],
                trendingAnimes: [
                    {
                        id: 'attack-on-titan-final-season-the-final-chapters-18329',
                        name: 'Attack on Titan: Final Season - The Final Chapters',
                        poster: 'https://cdn.noitatnemucod.net/thumbnail/300x400/100/bcd84731a3eda4f4a306250769675068.jpg',
                        type: 'Special',
                        episodes: { sub: 2, dub: 2 }
                    }
                ],
                mostPopularAnimes: [
                    {
                        id: 'naruto-shippuden-355',
                        name: 'Naruto: Shippuden',
                        poster: 'https://cdn.noitatnemucod.net/thumbnail/300x400/100/bcd84731a3eda4f4a306250769675069.jpg',
                        type: 'TV',
                        episodes: { sub: 500, dub: 500 }
                    }
                ],
                mostFavoriteAnimes: [],
                latestCompletedAnimes: []
            }
        };
    }
}

// Replace the original AnimeAPI with TatakaiAnimeAPI
window.AnimeAPI = TatakaiAnimeAPI;