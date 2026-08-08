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

export function useAniskip(initialSkipTimes: SkipTime[] = []) {
  const [skipTimes, setSkipTimes] = useState<SkipTime[]>(initialSkipTimes);

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
      const v2Params = new URLSearchParams();
      v2Params.append('types[]', 'op');
      v2Params.append('types[]', 'ed');
      v2Params.append('types[]', 'recap');

      const length = (typeof episodeLength === 'number' && !isNaN(episodeLength) && episodeLength > 0)
        ? Math.floor(episodeLength)
        : 1440;
      v2Params.set('episodeLength', String(length));

      const v2Url = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}?${v2Params.toString()}`;
      console.log('Fetching skip times from v2:', v2Url);

      let response = await fetch(v2Url, {
        headers: { 'Accept': 'application/json' },
      });

      // Fallback to v1 if v2 fails or returns 404
      if (response.status === 404 || !response.ok) {
        console.log(`v2 failed with ${response.status}, trying v1 fallback...`);

        // v1 uses singular 'type' param (not array), and only supports op/ed
        const v1Url = `https://api.aniskip.com/v1/skip-times/${malId}/${episodeNumber}?type=op&type=ed`;
        console.log('Fetching skip times from v1:', v1Url);

        response = await fetch(v1Url, {
          headers: { 'Accept': 'application/json' },
        });

        if (response.status === 404 || !response.ok) {
          console.log(`No skip times found (v1 returned ${response.status})`);
          setSkipTimes([]);
          return [];
        }
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
