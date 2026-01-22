import { useState, useEffect } from 'react';
import { Search, Film, PlayCircle, Loader2 } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { searchAnime, fetchEpisodes, type AnimeCard, type EpisodeData } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { Skeleton } from '@/components/ui/skeleton-custom';

interface CustomVideoSourceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (anime: AnimeCard, episode?: EpisodeData) => void;
}

export function CustomVideoSourceModal({ isOpen, onClose, onSelect }: CustomVideoSourceModalProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 500);
    const [results, setResults] = useState<AnimeCard[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedAnime, setSelectedAnime] = useState<AnimeCard | null>(null);
    const [episodes, setEpisodes] = useState<EpisodeData[]>([]);
    const [loadingEpisodes, setLoadingEpisodes] = useState(false);

    // Reset state when closing
    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
            setResults([]);
            setSelectedAnime(null);
            setEpisodes([]);
        }
    }, [isOpen]);

    // Search Effect
    useEffect(() => {
        if (debouncedSearch.trim().length > 2) {
            setLoading(true);
            searchAnime(debouncedSearch)
                .then(res => {
                    setResults(res.animes || []);
                })
                .catch(err => {
                    console.error("Search failed", err);
                    setResults([]);
                })
                .finally(() => setLoading(false));
        } else {
            setResults([]);
        }
    }, [debouncedSearch]);

    // Fetch Episodes when anime selected
    useEffect(() => {
        if (selectedAnime) {
            setLoadingEpisodes(true);
            fetchEpisodes(selectedAnime.id)
                .then(res => {
                    setEpisodes(res.episodes || []);
                })
                .catch(err => {
                    console.error("Fetch episodes failed", err);
                    setEpisodes([]);
                })
                .finally(() => setLoadingEpisodes(false));
        }
    }, [selectedAnime]);

    const handleAnimeSelect = (anime: AnimeCard) => {
        setSelectedAnime(anime);
    };

    const handleEpisodeSelect = (episode: EpisodeData) => {
        onSelect(selectedAnime!, episode);
        onClose();
    };

    const handleBackToSearch = () => {
        setSelectedAnime(null);
        setEpisodes([]);
    };

    return (
        <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
            <DialogContent className="max-w-md md:max-w-lg lg:max-w-2xl bg-black/80 backdrop-blur-xl border-white/10 p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b border-white/10">
                    <DialogTitle className="flex items-center gap-2 text-xl font-display">
                        <Film className="w-5 h-5 text-primary" />
                        {selectedAnime ? 'Select Episode' : 'Select Anime Source'}
                    </DialogTitle>
                </DialogHeader>

                <div className="p-6 space-y-4">
                    {!selectedAnime ? (
                        /* Search View */
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search for anime..."
                                    className="pl-10 bg-white/5 border-white/10 focus:border-primary/50"
                                    autoFocus
                                />
                                {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />}
                            </div>

                            <ScrollArea className="h-[300px] md:h-[400px] pr-2">
                                {results.length === 0 && !loading && searchQuery.length > 2 && (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50 py-10">
                                        <Search className="w-12 h-12 mb-2" />
                                        <p>No results found</p>
                                    </div>
                                )}

                                {results.length === 0 && !loading && searchQuery.length <= 2 && (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-30 py-10">
                                        <PlayCircle className="w-12 h-12 mb-2" />
                                        <p>Type to search...</p>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-2">
                                    {results.map(anime => (
                                        <button
                                            key={anime.id}
                                            onClick={() => handleAnimeSelect(anime)}
                                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 transition-colors group text-left w-full border border-transparent hover:border-white/5"
                                        >
                                            <div className="w-10 h-14 md:w-12 md:h-16 bg-muted rounded overflow-hidden flex-shrink-0">
                                                <img src={anime.poster} alt={anime.name} className="w-full h-full object-cover" loading="lazy" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-semibold text-sm md:text-base truncate group-hover:text-primary transition-colors">{anime.name}</h4>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <span className="bg-white/10 px-1.5 py-0.5 rounded">{anime.type || 'TV'}</span>
                                                    <span>{anime.episodes.sub || '?'} Ep</span>
                                                </div>
                                            </div>
                                            <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all">
                                                Select
                                            </Button>
                                        </button>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    ) : (
                        /* Episode Selection View */
                        <div className="space-y-4">
                            <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                                <img src={selectedAnime.poster} alt={selectedAnime.name} className="w-16 h-24 object-cover rounded shadow-lg" />
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-lg leading-tight mb-1">{selectedAnime.name}</h3>
                                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{selectedAnime.episodes.sub} Episodes</p>
                                    <Button variant="outline" size="sm" onClick={handleBackToSearch} className="h-7 text-xs">
                                        Change Anime
                                    </Button>
                                </div>
                            </div>

                            <ScrollArea className="h-[250px] md:h-[300px]">
                                {loadingEpisodes ? (
                                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                                        {Array.from({ length: 15 }).map((_, i) => (
                                            <Skeleton key={i} className="h-10 w-full rounded" />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-1">
                                        {episodes.map(ep => (
                                            <Button
                                                key={ep.episodeId}
                                                variant="outline"
                                                onClick={() => handleEpisodeSelect(ep)}
                                                className="h-10 text-xs font-medium hover:bg-primary hover:text-primary-foreground border-white/10"
                                            >
                                                Ep {ep.number}
                                            </Button>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
