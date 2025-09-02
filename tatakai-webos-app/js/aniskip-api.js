/**
 * AniSkip API Client for webOS
 * Provides intro/outro skip times for anime episodes
 */

class AniSkipAPI {
    static BASE_URL = 'https://api.aniskip.com/v2';

    /**
     * Get skip times for a specific anime episode
     * @param {number} malId MyAnimeList ID of the anime
     * @param {number} episodeNumber Episode number
     * @param {number} episodeLength Duration of the episode in seconds
     * @returns {Promise<Object>} Skip times response
     */
    static async getSkipTimes(malId, episodeNumber, episodeLength) {
        try {
            const url = new URL(`${this.BASE_URL}/skip-times/${malId}/${episodeNumber}`);
            url.searchParams.append('types', 'op');
            url.searchParams.append('types', 'ed');
            url.searchParams.append('episodeLength', episodeLength.toString());

            console.log('Fetching skip times from:', url.toString());

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return {
                        found: false,
                        results: [],
                        message: 'No skip times found',
                        statusCode: 404
                    };
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Skip times received:', data);
            return data;
        } catch (error) {
            console.error('AniSkip API Error:', error);
            return {
                found: false,
                results: [],
                message: error.message || 'Unknown error',
                statusCode: 500
            };
        }
    }

    /**
     * Check if a given time is within any skip interval
     * @param {number} currentTime Current video time in seconds
     * @param {Array} skipTimes Array of skip times
     * @returns {Object|null} Active skip time or null
     */
    static getActiveSkip(currentTime, skipTimes) {
        if (!skipTimes || skipTimes.length === 0) return null;
        
        return skipTimes.find(skip => 
            currentTime >= skip.interval.startTime && 
            currentTime <= skip.interval.endTime
        ) || null;
    }

    /**
     * Format skip type for display
     * @param {string} skipType Type of skip
     * @returns {string} Formatted string
     */
    static formatSkipType(skipType) {
        switch (skipType) {
            case 'op': return 'Opening';
            case 'ed': return 'Ending';
            case 'mixed-op': return 'Mixed Opening';
            case 'mixed-ed': return 'Mixed Ending';
            case 'recap': return 'Recap';
            default: return skipType;
        }
    }

    /**
     * Get MAL ID from anime data (helper method)
     * @param {Object} animeInfo Anime information object
     * @returns {number|null} MAL ID or null if not found
     */
    static extractMalId(animeInfo) {
        // Try to extract MAL ID from various possible fields
        if (animeInfo?.malId) return parseInt(animeInfo.malId);
        if (animeInfo?.info?.malId) return parseInt(animeInfo.info.malId);
        if (animeInfo?.anilistInfo?.idMal) return parseInt(animeInfo.anilistInfo.idMal);
        
        // Try to extract from URL or other fields
        if (animeInfo?.info?.stats?.episodes?.sub) {
            // This is a fallback - you might need to adjust based on actual API response
            return null;
        }
        
        return null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AniSkipAPI;
} else {
    window.AniSkipAPI = AniSkipAPI;
}