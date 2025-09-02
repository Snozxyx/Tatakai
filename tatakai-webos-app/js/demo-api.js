/**
 * Demo API Client with Mock Data
 * For testing webOS app functionality without external API
 */
class DemoAnimeAPI {
    static BASE_URL = 'https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime';
    static USE_MOCK_DATA = false; // Set to false to use real API

    // Mock data for demo
    static mockHomeData = {
        success: true,
        data: {
            genres: ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Sci-Fi", "Thriller"],
            spotlightAnimes: [
                {
                    id: "demon-slayer-1",
                    name: "Demon Slayer: Kimetsu no Yaiba",
                    jname: "Kimetsu no Yaiba",
                    poster: "https://cdn.myanimelist.net/images/anime/1286/99889.jpg",
                    description: "A young boy becomes a demon slayer to avenge his family and cure his sister.",
                    rank: 1,
                    otherInfo: ["TV", "2019", "26 Episodes"],
                    episodes: { sub: 26, dub: 26 }
                },
                {
                    id: "attack-on-titan-1",
                    name: "Attack on Titan",
                    jname: "Shingeki no Kyojin",
                    poster: "https://cdn.myanimelist.net/images/anime/10/47347.jpg",
                    description: "Humanity fights for survival against giant humanoid Titans.",
                    rank: 2,
                    otherInfo: ["TV", "2013", "25 Episodes"],
                    episodes: { sub: 25, dub: 25 }
                },
                {
                    id: "one-piece-1",
                    name: "One Piece",
                    jname: "One Piece",
                    poster: "https://cdn.myanimelist.net/images/anime/6/73245.jpg",
                    description: "A young pirate searches for the ultimate treasure known as One Piece.",
                    rank: 3,
                    otherInfo: ["TV", "1999", "1000+ Episodes"],
                    episodes: { sub: 1000, dub: 800 }
                }
            ],
            trendingAnimes: [
                {
                    id: "jujutsu-kaisen-1",
                    name: "Jujutsu Kaisen",
                    poster: "https://cdn.myanimelist.net/images/anime/1171/109222.jpg",
                    rank: 1
                },
                {
                    id: "my-hero-academia-1",
                    name: "My Hero Academia",
                    poster: "https://cdn.myanimelist.net/images/anime/10/78745.jpg",
                    rank: 2
                }
            ],
            latestEpisodeAnimes: [
                {
                    id: "naruto-1",
                    name: "Naruto",
                    poster: "https://cdn.myanimelist.net/images/anime/13/17405.jpg",
                    type: "TV",
                    episodes: { sub: 720, dub: 500 }
                },
                {
                    id: "bleach-1",
                    name: "Bleach",
                    poster: "https://cdn.myanimelist.net/images/anime/3/40451.jpg",
                    type: "TV",
                    episodes: { sub: 366, dub: 366 }
                }
            ],
            mostPopularAnimes: [
                {
                    id: "dragon-ball-z-1",
                    name: "Dragon Ball Z",
                    poster: "https://cdn.myanimelist.net/images/anime/6/21557.jpg",
                    type: "TV",
                    episodes: { sub: 291, dub: 291 }
                },
                {
                    id: "fullmetal-alchemist-1",
                    name: "Fullmetal Alchemist: Brotherhood",
                    poster: "https://cdn.myanimelist.net/images/anime/1223/96541.jpg",
                    type: "TV",
                    episodes: { sub: 64, dub: 64 }
                }
            ],
            topAiringAnimes: [],
            topUpcomingAnimes: [],
            mostFavoriteAnimes: [],
            latestCompletedAnimes: [],
            top10Animes: {
                today: [],
                week: [],
                month: []
            }
        }
    };

    static mockAnimeInfo = {
        success: true,
        data: {
            anime: {
                info: {
                    id: "demon-slayer-1",
                    name: "Demon Slayer: Kimetsu no Yaiba",
                    poster: "https://cdn.myanimelist.net/images/anime/1286/99889.jpg",
                    description: "Tanjiro Kamado is a kind-hearted and intelligent boy who lives with his family in the mountains. He has become the breadwinner for his family since his father's death. However, everything changes when Muzan Kibutsuji, the King of Demons, slaughters his family. To make matters worse, his younger sister Nezuko, the sole survivor, has been transformed into a demon herself. Though devastated by this grim reality, Tanjiro resolves to become a demon slayer so that he can turn his sister back into a human and kill the demon that massacred his family.",
                    stats: {
                        rating: "8.7",
                        quality: "HD",
                        episodes: { sub: 26, dub: 26 },
                        type: "TV",
                        duration: "23 min per ep"
                    }
                }
            },
            recommendedAnimes: [
                {
                    id: "jujutsu-kaisen-1",
                    name: "Jujutsu Kaisen",
                    poster: "https://cdn.myanimelist.net/images/anime/1171/109222.jpg",
                    duration: "23 min per ep",
                    type: "TV",
                    rating: "8.6",
                    episodes: { sub: 24, dub: 24 }
                }
            ],
            relatedAnimes: [],
            seasons: []
        }
    };

    static mockEpisodes = {
        success: true,
        data: {
            totalEpisodes: 26,
            episodes: [
                {
                    number: 1,
                    title: "Cruelty",
                    episodeId: "demon-slayer-1-ep-1",
                    isFiller: false
                },
                {
                    number: 2,
                    title: "Trainer Sakonji Urokodaki",
                    episodeId: "demon-slayer-1-ep-2",
                    isFiller: false
                },
                {
                    number: 3,
                    title: "Sabito and Makomo",
                    episodeId: "demon-slayer-1-ep-3",
                    isFiller: false
                }
            ]
        }
    };

    static mockSources = {
        success: true,
        data: {
            headers: {
                Referer: "https://aniwatch.to/",
                "User-Agent": "Mozilla/5.0"
            },
            sources: [
                {
                    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
                    isM3U8: false,
                    quality: "1080p"
                }
            ],
            subtitles: [
                {
                    lang: "English",
                    url: "data:text/vtt;base64,V0VCVlRUCgowMDowMDowMC4wMDAgLS0+IDAwOjAwOjA1LjAwMApTYW1wbGUgc3VidGl0bGUgdGV4dAoKMDA6MDA6MDUuMDAwIC0tPiAwMDowMDoxMC4wMDAKTW9yZSBzYW1wbGUgdGV4dA=="
                }
            ]
        }
    };

    /**
     * Generic fetch wrapper with mock data support
     */
    static async fetchAPI(endpoint, options = {}) {
        if (this.USE_MOCK_DATA) {
            console.log('Using mock data for:', endpoint);
            
            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
            
            // Return appropriate mock data based on endpoint
            if (endpoint === '/home') {
                return this.mockHomeData;
            } else if (endpoint.includes('/anime/') && !endpoint.includes('/episodes')) {
                return this.mockAnimeInfo;
            } else if (endpoint.includes('/episodes')) {
                return this.mockEpisodes;
            } else if (endpoint.includes('/search')) {
                return {
                    success: true,
                    data: {
                        animes: this.mockHomeData.data.spotlightAnimes.slice(0, 2),
                        currentPage: 1,
                        totalPages: 1,
                        hasNextPage: false,
                        searchQuery: "demo"
                    }
                };
            } else {
                return { success: true, data: { animes: [] } };
            }
        }
        
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
            console.log('Falling back to mock data');
            
            // Fallback to mock data on error
            if (endpoint === '/home') {
                return this.mockHomeData;
            } else if (endpoint.includes('/anime/') && !endpoint.includes('/episodes')) {
                return this.mockAnimeInfo;
            } else if (endpoint.includes('/episodes')) {
                return this.mockEpisodes;
            } else if (endpoint.includes('/episode/sources')) {
                return this.mockSources;
            }
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

            const data = await this.fetchAPI(endpoint);
            return data;
        } catch (error) {
            console.error('Error searching anime:', error);
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
            console.log('Using mock anime data for:', animeId);
            return this.mockAnimeInfo;
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
            console.log('Using mock episodes data for:', animeId);
            return this.mockEpisodes;
        }
    }

    /**
     * Get episode servers
     */
    static async getEpisodeServers(episodeId) {
        try {
            return {
                success: true,
                data: {
                    episodeId: episodeId,
                    episodeNo: 1,
                    sub: [{ serverId: 1, serverName: "hd-1" }],
                    dub: [{ serverId: 2, serverName: "hd-2" }],
                    raw: []
                }
            };
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
            return this.mockSources;
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
            return {
                success: true,
                data: {
                    category: category,
                    animes: this.mockHomeData.data.mostPopularAnimes
                }
            };
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
            return {
                success: true,
                data: {
                    genreName: genre,
                    animes: this.mockHomeData.data.spotlightAnimes
                }
            };
        }
    }
}

// Replace the original AnimeAPI with DemoAnimeAPI
window.AnimeAPI = DemoAnimeAPI;