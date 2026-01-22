// Fetch from Animeya using Supabase proxy
export async function fetchAnimeyaSources(
    episodeId: string
): Promise<StreamingSource[]> {
    const apiUrl = `https://tatakaiapi.vercel.app/api/v1/animeya/watch/${episodeId}`;

    // Use Supabase proxy to avoid CORS issues
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
    }

    const proxyParams = new URLSearchParams({
        url: apiUrl,
        type: 'api',
        referer: 'https://tatakaiapi.vercel.app'
    });
    if (apikey) proxyParams.set('apikey', apikey);

    const proxyUrl = `${supabaseUrl}/functions/v1/rapid-service?${proxyParams}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const headers: Record<string, string> = {
            'Accept': 'application/json',
        };
        if (apikey) {
            headers['apikey'] = apikey;
            headers['Authorization'] = `Bearer ${apikey}`;
        }

        const response = await fetch(proxyUrl, {
            signal: controller.signal,
            headers
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Animeya API returned status ${response.status}`);
        }

        const json = await response.json();

        if (json.status === 200 && json.data && json.data.sources) {
            // Map Animeya sources to StreamingSource format
            return json.data.sources.map((source: any, index: number) => ({
                url: source.url,
                isM3U8: source.type === 'hls',
                quality: source.quality || '720p',
                language: source.language || 'Unknown',
                langCode: `animeya-${source.language?.toLowerCase() || index}`,
                isDub: source.language !== 'Japanese',
                providerName: `Animeya ${source.language || `Server ${index + 1}`}`,
                isEmbed: !source.type || source.type !== 'hls',
                needsHeadless: !source.type || source.type !== 'hls',
            }));
        }

        return [];
    } catch (error) {
        console.error('Failed to fetch from Animeya:', error);
        return [];
    }
}
