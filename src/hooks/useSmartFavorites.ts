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

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

export function useSmartFavorites(limit = 10) {
    const { data: history = [], isLoading: historyLoading } = useWatchHistory(400);
    const { data: watchlist = [], isLoading: watchlistLoading } = useWatchlist();

    const smartFavorites = useMemo(() => {
        if (!history.length) return [];

        const watchlistIds = new Set(watchlist.map(item => item.anime_id));
        const animeStats = new Map<string, {
            name: string;
            poster: string | null;
            episodes: Set<number>;
            completed: boolean;
            lastWatched: string;
            firstWatched: string;
            views: number;
            completionHits: number;
            totalProgress: number;
            totalDuration: number;
            rewatchHits: number;
        }>();

        // Aggregate history with richer engagement signals.
        history.forEach(item => {
            if (watchlistIds.has(item.anime_id)) return;

            const existing = animeStats.get(item.anime_id) || {
                name: item.anime_name,
                poster: item.anime_poster,
                episodes: new Set(),
                completed: false,
                lastWatched: item.watched_at,
                firstWatched: item.watched_at,
                views: 0,
                completionHits: 0,
                totalProgress: 0,
                totalDuration: 0,
                rewatchHits: 0,
            };

            existing.views += 1;
            if (existing.episodes.has(item.episode_number)) {
                existing.rewatchHits += 1;
            }
            existing.episodes.add(item.episode_number);
            if (item.completed) existing.completed = true;
            if (item.completed) existing.completionHits += 1;
            existing.totalProgress += item.progress_seconds || 0;
            existing.totalDuration += item.duration_seconds || 0;

            if (new Date(item.watched_at).getTime() > new Date(existing.lastWatched).getTime()) {
                existing.lastWatched = item.watched_at;
            }
            if (new Date(item.watched_at).getTime() < new Date(existing.firstWatched).getTime()) {
                existing.firstWatched = item.watched_at;
            }

            animeStats.set(item.anime_id, existing);
        });

        // Calculate multi-factor scores.
        const suggestions: SmartFavorite[] = [];
        animeStats.forEach((stats, id) => {
            const daysSinceLastWatch = (Date.now() - new Date(stats.lastWatched).getTime()) / DAY_MS;
            const recencyFactor = Math.exp(-daysSinceLastWatch / 28); // 28-day half-life-like decay

            const totalDuration = Math.max(1, stats.totalDuration);
            const engagementRatio = clamp(stats.totalProgress / totalDuration, 0, 2);
            const completionRatio = clamp(stats.completionHits / Math.max(1, stats.views), 0, 1);
            const breadthScore = clamp(stats.episodes.size / 12, 0, 1);
            const consistencyScore = clamp(stats.views / 8, 0, 1);
            const rewatchAffinity = clamp(stats.rewatchHits / Math.max(1, stats.views), 0, 1);

            const scoreFloat =
                breadthScore * 26 +
                consistencyScore * 18 +
                completionRatio * 22 +
                recencyFactor * 22 +
                engagementRatio * 8 +
                rewatchAffinity * 4;

            const score = Math.round(scoreFloat);

            const reasonParts: string[] = [];
            if (completionRatio > 0.5 || stats.completed) reasonParts.push('strong completion pattern');
            if (breadthScore > 0.55) reasonParts.push(`wide episode coverage (${stats.episodes.size} eps)`);
            if (consistencyScore > 0.5) reasonParts.push('repeat engagement');
            if (recencyFactor > 0.55) reasonParts.push('recently active');

            const reason = reasonParts.length > 0
                ? reasonParts.slice(0, 2).join(' + ')
                : `emerging favorite (${stats.episodes.size} eps)`;

            suggestions.push({
                animeId: id,
                animeName: stats.name,
                animePoster: stats.poster,
                score,
                reason,
            });
        });

        // Sort by score, then latest activity.
        return suggestions
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

    }, [history, watchlist, limit]);

    return {
        data: smartFavorites,
        isLoading: historyLoading || watchlistLoading,
    };
}
