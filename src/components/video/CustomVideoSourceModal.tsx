import { useState, useEffect, type CSSProperties } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, Film, PlayCircle, Loader2, ArrowLeft, Play, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type AnimeCard, type EpisodeData } from '@/lib/api';
import { contentGraph, toAnimeCard } from '@/core';
import { useDebounce } from '@/hooks/ui/useDebounce';
import { useEpisodes } from '@/hooks/api/useAnimeData';
import { Skeleton } from '@/components/ui/skeleton-custom';
import { cn } from '@/lib/utils';

// Scoped rose accent — mirrors the value WatchRoomPage sets on its root. The
// Dialog renders through a portal outside that root, so the var is redeclared
// here to keep the modal on-brand without depending on inherited context.
const ISSHONI_ACCENT = '327 82% 60%';

interface CustomVideoSourceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (anime: AnimeCard, episode?: EpisodeData) => void;
}

export function CustomVideoSourceModal({ isOpen, onClose, onSelect }: CustomVideoSourceModalProps) {
    const reduceMotion = useReducedMotion();
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 400);
    const [results, setResults] = useState<AnimeCard[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedAnime, setSelectedAnime] = useState<AnimeCard | null>(null);

    // Episodes for the selected title, resolved through the same hook the room
    // uses (ani.zip → fallbacks). Drives both the grid and the "start from
    // Episode 1" quick action.
    const { data: episodesData, isLoading: loadingEpisodes } = useEpisodes(selectedAnime?.id);
    const episodes = episodesData?.episodes || [];

    // Reset everything when the modal closes so it reopens clean.
    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
            setResults([]);
            setSelectedAnime(null);
            setLoading(false);
        }
    }, [isOpen]);

    // Search as you type (min 3 chars).
    useEffect(() => {
        let cancelled = false;
        if (debouncedSearch.trim().length > 2) {
            setLoading(true);
            contentGraph.search({ query: debouncedSearch, page: 1, perPage: 24 })
                .then(res => { if (!cancelled) setResults((res.media || []).map(toAnimeCard)); })
                .catch(err => { console.error('Search failed', err); if (!cancelled) setResults([]); })
                .finally(() => { if (!cancelled) setLoading(false); });
        } else {
            setResults([]);
        }
        return () => { cancelled = true; };
    }, [debouncedSearch]);

    const handleEpisodeSelect = (episode: EpisodeData) => {
        onSelect(selectedAnime!, episode);
        onClose();
    };

    // Switch series and start at the beginning in one click. Falls back to
    // no episode (the room auto-syncs Episode 1 from its own episode list) if
    // resolution hasn't produced one yet.
    const handleStartFromFirst = () => {
        onSelect(selectedAnime!, episodes[0]);
        onClose();
    };

    const accentStyle = { ['--isshoni-accent' as any]: ISSHONI_ACCENT } as CSSProperties;
    const ease = [0.16, 1, 0.3, 1] as const;

    return (
        <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
            <DialogContent
                style={accentStyle}
                className="max-w-md md:max-w-lg lg:max-w-2xl overflow-hidden border-white/[0.06] bg-background/60 p-0 backdrop-blur-2xl"
            >
                {/* Ambient accent glow — decorative, non-interactive. */}
                <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[hsl(var(--isshoni-accent)/0.18)] blur-[90px]" />
                    <div className="absolute -bottom-28 -left-20 h-56 w-56 rounded-full bg-[hsl(var(--isshoni-accent)/0.10)] blur-[100px]" />
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                </div>

                <DialogHeader className="relative z-10 border-b border-white/[0.06] p-6 pb-4">
                    <DialogTitle className="flex items-center gap-2.5 font-display text-xl font-black tracking-tight">
                        {selectedAnime ? (
                            <button
                                onClick={() => setSelectedAnime(null)}
                                className="grid h-7 w-7 place-items-center rounded-full bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                                aria-label="Back to search"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </button>
                        ) : (
                            <span className="grid h-7 w-7 place-items-center rounded-full bg-[hsl(var(--isshoni-accent)/0.15)] text-[hsl(var(--isshoni-accent))]">
                                <Film className="h-4 w-4" />
                            </span>
                        )}
                        {selectedAnime ? 'Choose an episode' : 'Change anime'}
                    </DialogTitle>
                </DialogHeader>

                <div className="relative z-10 p-6 pt-4">
                    <AnimatePresence mode="wait" initial={false}>
                        {!selectedAnime ? (
                            <motion.div
                                key="search"
                                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                                transition={{ duration: 0.25, ease }}
                                className="space-y-4"
                            >
                                <div className="relative">
                                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search for an anime…"
                                        className="h-11 rounded-full border-white/10 bg-white/5 pl-10 focus-visible:border-[hsl(var(--isshoni-accent)/0.5)] focus-visible:ring-[hsl(var(--isshoni-accent)/0.25)]"
                                        autoFocus
                                    />
                                    {loading && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[hsl(var(--isshoni-accent))]" />}
                                </div>

                                <ScrollArea className="h-[300px] pr-3 md:h-[400px]">
                                    {results.length === 0 && !loading && (
                                        <div className="flex h-[280px] flex-col items-center justify-center text-center text-muted-foreground md:h-[380px]">
                                            {searchQuery.trim().length > 2 ? (
                                                <>
                                                    <Search className="mb-3 h-10 w-10 opacity-40" />
                                                    <p className="text-sm opacity-70">No results for “{searchQuery}”</p>
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles className="mb-3 h-10 w-10 text-[hsl(var(--isshoni-accent))] opacity-30" />
                                                    <p className="text-sm opacity-50">Type to search the library</p>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 gap-1.5">
                                        {results.map((anime, i) => (
                                            <motion.button
                                                key={anime.id}
                                                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3), ease }}
                                                onClick={() => setSelectedAnime(anime)}
                                                className="group flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-colors hover:border-white/[0.06] hover:bg-white/[0.04]"
                                            >
                                                <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-muted shadow-lg">
                                                    <img src={anime.poster} alt={anime.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="truncate text-sm font-semibold transition-colors group-hover:text-[hsl(var(--isshoni-accent))] md:text-base">{anime.name}</h4>
                                                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                                        <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium uppercase tracking-wide">{anime.type || 'TV'}</span>
                                                        <span className="tabular-nums">{anime.episodes.sub || '?'} eps</span>
                                                    </div>
                                                </div>
                                                <PlayCircle className="h-5 w-5 flex-shrink-0 text-[hsl(var(--isshoni-accent))] opacity-0 transition-all -translate-x-1 group-hover:translate-x-0 group-hover:opacity-100" />
                                            </motion.button>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="episodes"
                                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                                transition={{ duration: 0.25, ease }}
                                className="space-y-4"
                            >
                                <div className="flex items-start gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                                    <img src={selectedAnime.poster} alt={selectedAnime.name} className="h-24 w-16 flex-shrink-0 rounded-lg object-cover shadow-xl" />
                                    <div className="min-w-0 flex-1">
                                        <h3 className="mb-0.5 truncate font-display text-lg font-black leading-tight">{selectedAnime.name}</h3>
                                        <p className="mb-3 text-xs text-muted-foreground tabular-nums">{selectedAnime.episodes.sub || '?'} episodes</p>
                                        <Button
                                            size="sm"
                                            onClick={handleStartFromFirst}
                                            disabled={loadingEpisodes}
                                            className="h-8 gap-1.5 rounded-full bg-[hsl(var(--isshoni-accent))] px-3.5 text-xs font-semibold text-white hover:bg-[hsl(var(--isshoni-accent)/0.85)]"
                                        >
                                            <Play className="h-3.5 w-3.5 fill-current" />
                                            Start from Episode 1
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="px-1 text-[11px] font-black uppercase tracking-wider text-muted-foreground/70">Or pick an episode</p>
                                    <ScrollArea className="h-[240px] md:h-[280px]">
                                        {loadingEpisodes ? (
                                            <div className="grid grid-cols-3 gap-2 p-1 md:grid-cols-5">
                                                {Array.from({ length: 15 }).map((_, i) => (
                                                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                                                ))}
                                            </div>
                                        ) : episodes.length === 0 ? (
                                            <div className="flex h-[220px] flex-col items-center justify-center text-center text-muted-foreground md:h-[260px]">
                                                <Film className="mb-3 h-10 w-10 opacity-40" />
                                                <p className="text-sm opacity-70">No episode list for this title</p>
                                                <p className="mt-1 text-xs opacity-50">Use “Start from Episode 1” — the room resolves episodes on its own.</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-3 gap-2 p-1 md:grid-cols-4 lg:grid-cols-5">
                                                {episodes.map(ep => (
                                                    <Button
                                                        key={ep.episodeId}
                                                        variant="outline"
                                                        onClick={() => handleEpisodeSelect(ep)}
                                                        className={cn(
                                                            'h-10 rounded-lg border-white/10 text-xs font-medium tabular-nums',
                                                            'hover:border-[hsl(var(--isshoni-accent)/0.5)] hover:bg-[hsl(var(--isshoni-accent)/0.15)] hover:text-[hsl(var(--isshoni-accent))]'
                                                        )}
                                                        title={ep.title || `Episode ${ep.number}`}
                                                    >
                                                        {ep.number}
                                                    </Button>
                                                ))}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </DialogContent>
        </Dialog>
    );
}