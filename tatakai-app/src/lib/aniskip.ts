/**
 * AniSkip API Client
 * Provides intro/outro skip times for anime episodes
 */

export interface SkipTime {
  interval: {
    startTime: number;
    endTime: number;
  };
  skipType: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap';
  skipId: string;
  episodeLength: number;
}

export interface SkipTimesResponse {
  found: boolean;
  results: SkipTime[];
  message?: string;
  statusCode: number;
}

class AniSkipAPI {
  private static readonly BASE_URL = 'https://api.aniskip.com/v2';

  /**
   * Get skip times for a specific anime episode
   * @param malId MyAnimeList ID of the anime
   * @param episodeNumber Episode number
   * @param episodeLength Duration of the episode in seconds
   * @returns Promise<SkipTimesResponse>
   */
  static async getSkipTimes(
    malId: number,
    episodeNumber: number,
    episodeLength: number
  ): Promise<SkipTimesResponse> {
    try {
      const url = new URL(`${this.BASE_URL}/skip-times/${malId}/${episodeNumber}`);
      url.searchParams.append('types', 'op');
      url.searchParams.append('types', 'ed');
      url.searchParams.append('episodeLength', episodeLength.toString());

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
      return data;
    } catch (error) {
      console.error('AniSkip API Error:', error);
      return {
        found: false,
        results: [],
        message: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500
      };
    }
  }

  /**
   * Check if a given time is within any skip interval
   * @param currentTime Current video time in seconds
   * @param skipTimes Array of skip times
   * @returns SkipTime | null
   */
  static getActiveSkip(currentTime: number, skipTimes: SkipTime[]): SkipTime | null {
    return skipTimes.find(skip => 
      currentTime >= skip.interval.startTime && 
      currentTime <= skip.interval.endTime
    ) || null;
  }

  /**
   * Format skip type for display
   * @param skipType Type of skip
   * @returns Formatted string
   */
  static formatSkipType(skipType: string): string {
    switch (skipType) {
      case 'op': return 'Opening';
      case 'ed': return 'Ending';
      case 'mixed-op': return 'Mixed Opening';
      case 'mixed-ed': return 'Mixed Ending';
      case 'recap': return 'Recap';
      default: return skipType;
    }
  }
}

export default AniSkipAPI;