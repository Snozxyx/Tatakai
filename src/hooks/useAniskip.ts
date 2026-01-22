import { useState, useCallback } from 'react';

interface SkipTime {
  interval: {
    startTime: number;
    endTime: number;
  };
  skipType: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap';
  skipId: string;
  episodeLength: number;
}

interface AniskipResponse {
  found: boolean;
  results: SkipTime[];
  message?: string;
  statusCode: number;
}

export function useAniskip() {
  const [skipTimes, setSkipTimes] = useState<SkipTime[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSkipTimes = useCallback(async (
    malId: number | null,
    episodeNumber: number,
    episodeLength?: number
  ) => {
    if (!malId) {
      console.log('No MAL ID provided, skipping aniskip fetch');
      return [];
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use v2 API endpoint with proper array params
      const params = new URLSearchParams();
      params.append('types[]', 'op');
      params.append('types[]', 'ed');
      params.append('types[]', 'recap');
      // AniSkip API requires episodeLength - use provided value or default to 1440 (24 min)
      const length = (typeof episodeLength === 'number' && !isNaN(episodeLength) && episodeLength > 0) 
        ? Math.floor(episodeLength) 
        : 1440;
      params.set('episodeLength', String(length));

      const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}?${params.toString()}`;

      console.log('Fetching skip times from:', url);

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      });

      // 404 means no skip times found - this is normal, not an error
      if (response.status === 404) {
        console.log('No skip times found for this episode (404)');
        setSkipTimes([]);
        return [];
      }

      if (!response.ok) {
        throw new Error(`Aniskip API error: ${response.status}`);
      }

      const data: AniskipResponse = await response.json();
      
      if (data.found && data.results) {
        console.log('Found skip times:', data.results);
        setSkipTimes(data.results);
        return data.results;
      } else {
        console.log('No skip times found for this episode');
        setSkipTimes([]);
        return [];
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch skip times';
      console.error('Aniskip fetch error:', message);
      setError(message);
      setSkipTimes([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getActiveSkip = useCallback((currentTime: number): SkipTime | null => {
    for (const skip of skipTimes) {
      if (currentTime >= skip.interval.startTime && currentTime < skip.interval.endTime) {
        return skip;
      }
    }
    return null;
  }, [skipTimes]);

  const getSkipLabel = (skipType: SkipTime['skipType']): string => {
    switch (skipType) {
      case 'op':
      case 'mixed-op':
        return 'Skip Intro';
      case 'ed':
      case 'mixed-ed':
        return 'Skip Outro';
      case 'recap':
        return 'Skip Recap';
      default:
        return 'Skip';
    }
  };

  return {
    skipTimes,
    isLoading,
    error,
    fetchSkipTimes,
    getActiveSkip,
    getSkipLabel,
  };
}
