const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Configuration
const supabaseUrl = process.env.SUPABASE_URL 
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY 
const hianimeApiUrl = 'http://de-fsn01.na1.host:4270/api/v2/hianime';
const tatakaiApiUrl = process.env.TATAKAI_API_URL || 'https://tatakaiapi.vercel.app/api/v1';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchAnimeInfo(animeId) {
    try {
        console.log(`Fetching info for anime ID: ${animeId}`);

        // Use HiAnime API to get anime info with MAL and AniList IDs
        const response = await fetch(`${hianimeApiUrl}/anime/${animeId}`);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching info for ${animeId}:`, error.message);
        return null;
    }
}

// Try to fetch MAL ID from episode sources endpoint (more reliable)
async function fetchFromEpisodeSources(episodeId) {
    try {
        console.log(`Fetching from episode sources: ${episodeId}`);
        const response = await fetch(`${tatakaiApiUrl}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=hd-1&category=sub`);

        if (!response.ok) {
            return null;
        }

        const json = await response.json();
        if (json.status === 200 && json.data) {
            return {
                malID: json.data.malID || null,
                anilistID: json.data.anilistID || null
            };
        }
    } catch (error) {
        console.error(`Error fetching episode sources for ${episodeId}:`, error.message);
    }
    return null;
}

async function backfillTable(tableName) {
    console.log(`\n=== Starting ${tableName} backfill ===`);

    // Get all items without MAL IDs
    const { data: items, error } = await supabase
        .from(tableName)
        .select('id, anime_id, anime_name, episode_id')
        .is('mal_id', null)
        .limit(50); // Process in batches

    if (error) {
        console.error(`Error fetching ${tableName} items:`, error);
        return { updated: 0, errors: 0 };
    }

    console.log(`Found ${items.length} items to process in ${tableName}`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const item of items) {
        try {
            console.log(`\nProcessing: ${item.anime_name} (ID: ${item.anime_id})`);

            let malId = null;
            let anilistId = null;

            // Strategy 1: Extract from anime_id if it's numeric or has mal- prefix
            if (/^\d+$/.test(item.anime_id)) {
                malId = parseInt(item.anime_id);
                console.log(`Extracted MAL ID from anime_id: ${malId}`);
            } else if (item.anime_id.startsWith('mal-')) {
                malId = parseInt(item.anime_id.replace('mal-', ''));
                console.log(`Extracted MAL ID from mal- prefix: ${malId}`);
            } else {
                // Strategy 2: Try episode sources endpoint first (most reliable)
                if (item.episode_id) {
                    const sourcesData = await fetchFromEpisodeSources(item.episode_id);
                    if (sourcesData) {
                        malId = sourcesData.malID;
                        anilistId = sourcesData.anilistID;
                        console.log(`Episode sources - MAL ID: ${malId}, AniList ID: ${anilistId}`);
                    }
                }

                // Strategy 3: Fallback to anime info endpoint
                if (!malId && !anilistId) {
                    const apiData = await fetchAnimeInfo(item.anime_id);

                    if (apiData && apiData.data) {
                        malId = apiData.data.anime?.info?.malID || apiData.data.anime?.info?.mal_id;
                        anilistId = apiData.data.anime?.info?.anilistID || apiData.data.anime?.info?.anilist_id;

                        console.log(`HiAnime API response - MAL ID: ${malId}, AniList ID: ${anilistId}`);
                    }
                }
            }

            // Update the database if we found IDs
            if (malId || anilistId) {
                const updateData = { updated_at: new Date().toISOString() };
                if (malId) updateData.mal_id = malId;
                if (anilistId) updateData.anilist_id = anilistId;

                const { error: updateError } = await supabase
                    .from(tableName)
                    .update(updateData)
                    .eq('id', item.id);

                if (updateError) {
                    console.error(`Error updating item ${item.id}:`, updateError);
                    errorCount++;
                } else {
                    console.log(`✅ Updated: ${item.anime_name} - MAL: ${malId}, AniList: ${anilistId}`);
                    updatedCount++;
                }
            } else {
                console.log(`⚠️  No MAL/AniList IDs found for: ${item.anime_name}`);
                errorCount++;
            }

            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error(`Error processing item ${item.id}:`, error);
            errorCount++;
        }
    }

    return { updated: updatedCount, errors: errorCount };
}

async function backfillMalIds() {
    console.log('===================================================');
    console.log('Starting MAL/AniList ID backfill process...');
    console.log('===================================================');

    try {
        // Backfill watchlist table
        const watchlistResults = await backfillTable('watchlist');

        // Backfill watch_history table
        const historyResults = await backfillTable('watch_history');

        console.log('\n===================================================');
        console.log('=== Backfill Complete ===');
        console.log('===================================================');
        console.log(`Watchlist - Updated: ${watchlistResults.updated}, Errors: ${watchlistResults.errors}`);
        console.log(`Watch History - Updated: ${historyResults.updated}, Errors: ${historyResults.errors}`);
        console.log(`\nTotal Updated: ${watchlistResults.updated + historyResults.updated}`);
        console.log(`Total Errors: ${watchlistResults.errors + historyResults.errors}`);

        if (watchlistResults.errors + historyResults.errors > 0) {
            console.log('\n⚠️  Some items could not be updated. This may be because:');
            console.log('- The anime ID format is not recognized');
            console.log('- The API does not have MAL/AniList IDs for this anime');
            console.log('- Rate limiting or API errors occurred');
        }

    } catch (error) {
        console.error('Backfill process failed:', error);
    }
}

// Run the backfill
backfillMalIds();

