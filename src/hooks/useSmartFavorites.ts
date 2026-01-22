import { useMemo } from 'react';
import { useWatchHistory } from './useWatchHistory';
import { useWatchlist } from './useWatchlist';

export interface SmartFavorite {
    animeId: string;
    animeName: string;
    animePoster: string | null;
    score: number;
    reason: string;
}

export function useSmartFavorites(limit = 10) {
    const { data: history = [] } = useWatchHistory(300); // Fetch last 300 history items
    const { data: watchlist = [] } = useWatchlist();

    const smartFavorites = useMemo(() => {
        if (!history.length) return [];

        const watchlistIds = new Set(watchlist.map(item => item.anime_id));
        const animeStats = new Map<string, {
            name: string;
            poster: string | null;
            episodes: Set<number>;
            completed: boolean;
            lastWatched: string;
        }>();

        // Aggregate history
        history.forEach(item => {
            // potentially skip if already in watchlist? 
            // The requirement implies finding favorites based on views, maybe we suggest things to add?
            // "Suggested Favorites" usually means things NOT in favorites yet.
            if (watchlistIds.has(item.anime_id)) return;

            const existing = animeStats.get(item.anime_id) || {
                name: item.anime_name,
                poster: item.anime_poster,
                episodes: new Set(),
                completed: false,
                lastWatched: item.watched_at
            };

            existing.episodes.add(item.episode_number);
            if (item.completed) existing.completed = true;
            // Update stats
            animeStats.set(item.anime_id, existing);
        });

        // Calculate scores
        const suggestions: SmartFavorite[] = [];
        animeStats.forEach((stats, id) => {
            let score = 0;
            score += stats.episodes.size * 2; // 2 points per unique episode
            if (stats.completed) score += 20; // 20 points if marked as completed (even one episode)

            // Simple heuristic mapping
            let reason = '';
            if (stats.completed) reason = 'You finished an episode';
            else if (stats.episodes.size > 5) reason = 'Binge watching';
            else reason = 'Recently watched';

            suggestions.push({
                animeId: id,
                animeName: stats.name,
                animePoster: stats.poster,
                score,
                reason: `${reason} (${stats.episodes.size} eps)`
            });
        });

        // Sort by score
        return suggestions
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

    }, [history, watchlist]);

    return {
        data: smartFavorites,
        isLoading: !history && !watchlist
    };
}
