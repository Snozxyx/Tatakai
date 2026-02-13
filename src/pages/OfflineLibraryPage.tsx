import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Play, Trash2, FolderOpen, Info, Search, RefreshCw, Plus, FolderSync, HardDrive, Wrench, Loader2, X } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { Skeleton } from '@/components/ui/skeleton-custom';
import { toast } from 'sonner';
import { fetchCombinedSources } from '@/lib/api';
import { useDownload } from '@/hooks/useDownload';

interface OfflineAnime {
    name: string;
    path: string;
    poster: string | null;
    posterUrl?: string;
    episodes: {
        id: string;
        number: number;
        file: string;
        subtitles?: { lang: string; label: string; file: string }[];
    }[];
    totalEpisodes?: number;
    downloadedEpisodes?: number;
}

export default function OfflineLibraryPage() {
    const [animes, setAnimes] = useState<OfflineAnime[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [search, setSearch] = useState('');
    const [downloadPath, setDownloadPath] = useState<string | null>(null);
    const isNative = useIsNativeApp();
    const navigate = useNavigate();
    const { downloadStates = {}, cancelDownload } = useDownload();

    // Get active downloads
    const activeDownloads = Object.entries(downloadStates).filter(
        ([_, state]) => state.status === 'downloading' || state.status === 'queued'
    );

    // Get custom download path from localStorage
    const getDownloadPath = () => {
        return localStorage.getItem('tatakai_download_path') || null;
    };

    const loadOfflineLibrary = async () => {
        if (!isNative) {
            setLoading(false);
            return;
        }
        
        try {
            const customPath = getDownloadPath();
            setDownloadPath(customPath);
            console.log('Loading offline library from:', customPath || 'default path');
            const library = await (window as any).electron.getOfflineLibrary(customPath);
            console.log('Loaded offline library:', library);
            setAnimes(library || []);
        } catch (err) {
            console.error('Failed to load offline library:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOfflineLibrary();
    }, [isNative]);

    const handleSyncLibrary = async () => {
        if (!isNative) return;
        
        setSyncing(true);
        try {
            const customPath = getDownloadPath();
            const result = await (window as any).electron.syncOfflineLibrary(customPath);
            console.log('Sync result:', result);
            toast.success(result.message);
            
            // Reload the library after sync
            await loadOfflineLibrary();
        } catch (err) {
            console.error('Sync failed:', err);
            toast.error('Failed to sync library');
        } finally {
            setSyncing(false);
        }
    };

    const handleImportVideos = async () => {
        if (!isNative) return;
        
        try {
            const result = await (window as any).electron.importVideoFiles();
            if (result.success) {
                toast.success(result.message);
                await loadOfflineLibrary();
            } else if (result.message !== 'No files selected' && result.message !== 'Import cancelled') {
                toast.error(result.message);
            }
        } catch (err) {
            console.error('Import failed:', err);
            toast.error('Failed to import videos');
        }
    };

    const handleRepairAnime = async (anime: OfflineAnime, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent navigation
        if (!isNative) return;
        
        try {
            toast.info(`Repairing ${anime.name}...`);
            
            // Try to get poster and subtitles from the first episode
            let posterUrl = anime.posterUrl || null;
            let subtitles: any[] = [];
            
            if (anime.episodes.length > 0) {
                const firstEpisode = anime.episodes[0];
                try {
                    // Fetch sources to get poster and subtitles
                    const sources = await fetchCombinedSources(
                        firstEpisode.id,
                        anime.name,
                        firstEpisode.number,
                        'hd-2',
                        'sub'
                    );
                    
                    // Get subtitles
                    subtitles = sources.subtitles || sources.tracks || [];
                } catch (err) {
                    console.warn('Could not fetch sources for repair:', err);
                }
            }
            
            const result = await (window as any).electron.repairAnime({
                animePath: anime.path,
                posterUrl,
                subtitles,
                animeName: anime.name
            });
            
            if (result.success) {
                toast.success(result.message);
                await loadOfflineLibrary();
            } else {
                toast.error(result.error || 'Repair failed');
            }
        } catch (err) {
            console.error('Repair failed:', err);
            toast.error('Failed to repair anime');
        }
    };

    const handleOpenFolder = async () => {
        if (!isNative) return;
        
        try {
            const customPath = getDownloadPath();
            await (window as any).electron.openDownloadsFolder(customPath);
        } catch (err) {
            console.error('Failed to open folder:', err);
        }
    };

    const handleDeleteAnime = async (anime: OfflineAnime, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isNative) return;
        
        const confirmed = await new Promise<boolean>((resolve) => {
            const result = window.confirm(
                `Delete "${anime.name}" and all its episodes?\n\nThis action cannot be undone.`
            );
            resolve(result);
        });
        
        if (!confirmed) return;
        
        try {
            toast.loading(`Deleting ${anime.name}...`);
            const result = await (window as any).electron.deleteAnime(anime.path);
            
            if (result.success) {
                toast.success(result.message);
                await loadOfflineLibrary();
            } else {
                toast.error(result.error || 'Failed to delete anime');
            }
        } catch (err) {
            console.error('Delete failed:', err);
            toast.error('Failed to delete anime');
        }
    };

    if (!isNative) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6 text-center">
                <GlassPanel className="p-12 space-y-6 max-w-md">
                    <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <Download className="w-10 h-10" />
                    </div>
                    <h1 className="text-3xl font-bold">Native Feature</h1>
                    <p className="text-muted-foreground">
                        The offline library is only available in the Tatakai Desktop and Mobile apps.
                    </p>
                    <Button onClick={() => navigate('/')} className="w-full h-12 rounded-full">
                        Back to Home
                    </Button>
                </GlassPanel>
            </div>
        );
    }

    const filteredAnimes = animes.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Sidebar />

            <main className={isNative ? "pl-6 pr-6 py-12 max-w-[1600px] mx-auto space-y-8" : "pl-6 md:pl-32 pr-6 py-12 max-w-[1600px] mx-auto space-y-8"}>
                {/* Header */}
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                        <div className="space-y-2">
                            <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight">Offline Library</h1>
                            <p className="text-muted-foreground">Continue your journey without an internet connection.</p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handleSyncLibrary}
                                disabled={syncing}
                                className="gap-2"
                            >
                                <FolderSync className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                                {syncing ? 'Syncing...' : 'Sync Folder'}
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handleImportVideos}
                                className="gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Import Videos
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={handleOpenFolder}
                                className="gap-2"
                            >
                                <FolderOpen className="w-4 h-4" />
                                Open Folder
                            </Button>
                        </div>
                    </div>

                    {/* Search and Stats */}
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                        <div className="relative group flex-1 max-w-md">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                placeholder="Search your library..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full h-12 pl-12 pr-4 rounded-xl bg-white/5 border border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none text-sm"
                            />
                        </div>
                        
                        {animes.length > 0 && (
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <HardDrive className="w-4 h-4" />
                                    <span>{animes.length} anime</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Download className="w-4 h-4" />
                                    <span>{animes.reduce((acc, a) => acc + a.episodes.length, 0)} episodes</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Active Downloads Section */}
                {activeDownloads.length > 0 && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            Active Downloads ({activeDownloads.length})
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {activeDownloads.map(([episodeId, state]) => (
                                <GlassPanel key={episodeId} className="p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-sm truncate">{state.animeName}</h3>
                                            <p className="text-xs text-muted-foreground">Episode {state.episodeNumber}</p>
                                        </div>
                                        <button 
                                            onClick={() => cancelDownload(episodeId)}
                                            className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                                            title="Cancel download"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    
                                    {/* Progress bar */}
                                    <div className="space-y-1.5">
                                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-300"
                                                style={{ width: `${state.progress || 0}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                            <span>{state.status === 'queued' ? 'Queued' : `${state.progress?.toFixed(0) || 0}%`}</span>
                                            <div className="flex items-center gap-3">
                                                {state.speed && <span>{state.speed}</span>}
                                                {state.eta && <span>ETA: {state.eta}</span>}
                                            </div>
                                        </div>
                                    </div>
                                </GlassPanel>
                            ))}
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
                        ))}
                    </div>
                ) : filteredAnimes.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                        {filteredAnimes.map((anime) => (
                            <GlassPanel
                                key={anime.path}
                                className="group relative overflow-hidden h-fit cursor-pointer border-transparent hover:border-primary/50 transition-all duration-300"
                                onClick={() => {
                                    if (anime.episodes.length > 0) {
                                        navigate(`/watch/${encodeURIComponent(anime.episodes[0].id)}?offline=true&path=${encodeURIComponent(anime.path)}`);
                                    }
                                }}
                            >
                                <div className="aspect-[3/4] relative overflow-hidden bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                                    {anime.poster ? (
                                        <img 
                                            src={anime.poster} 
                                            alt={anime.name} 
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Download className="w-12 h-12 text-white/20" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />

                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-xl shadow-primary/40 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                            <Play className="w-6 h-6 text-white fill-current ml-1" />
                                        </div>
                                    </div>

                                    <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-bold text-white border border-white/10 uppercase tracking-wider">
                                        {anime.episodes.length} EP
                                    </div>
                                    
                                    {/* Repair button - shows on hover */}
                                    <button
                                        onClick={(e) => handleRepairAnime(anime, e)}
                                        className="absolute top-3 left-3 p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20 hover:border-primary/50"
                                        title="Repair - Re-download missing poster & subtitles"
                                    >
                                        <Wrench className="w-3.5 h-3.5 text-white" />
                                    </button>
                                    
                                    {/* Delete button - shows on hover */}
                                    <button
                                        onClick={(e) => handleDeleteAnime(anime, e)}
                                        className="absolute bottom-3 left-3 p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20 hover:border-destructive/50"
                                        title="Delete anime and all episodes"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                    </button>
                                </div>

                                <div className="p-4 space-y-1">
                                    <h3 className="font-bold text-sm line-clamp-1 group-hover:text-primary transition-colors">{anime.name}</h3>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
                                            <FolderOpen className="w-3 h-3" />
                                            Offline Ready
                                        </div>
                                        {/* Warning indicator if missing poster */}
                                        {!anime.poster && (
                                            <span className="text-[10px] text-amber-500 font-medium">Missing poster</span>
                                        )}
                                    </div>
                                </div>
                            </GlassPanel>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-32 text-center space-y-6">
                        <div className="w-24 h-24 rounded-3xl bg-muted flex items-center justify-center text-muted-foreground/30">
                            <Download className="w-12 h-12" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold">Library is empty</h2>
                            <p className="text-muted-foreground max-w-sm">
                                You haven't downloaded any anime yet. Start by downloading your favorite episodes, 
                                or sync your folder if you already have videos.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3 justify-center">
                            <Button onClick={() => navigate('/')} variant="default" className="rounded-full h-12 px-8">
                                Discover Anime
                            </Button>
                            <Button 
                                onClick={handleSyncLibrary} 
                                variant="outline" 
                                className="rounded-full h-12 px-8 gap-2"
                                disabled={syncing}
                            >
                                <FolderSync className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                                Sync Folder
                            </Button>
                            <Button 
                                onClick={handleImportVideos} 
                                variant="outline" 
                                className="rounded-full h-12 px-8 gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Import Videos
                            </Button>
                        </div>
                        
                        {/* Help text */}
                        <div className="mt-8 p-4 rounded-xl bg-white/5 border border-white/10 max-w-lg text-left">
                            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <Info className="w-4 h-4 text-primary" />
                                How to add videos
                            </h3>
                            <ul className="text-xs text-muted-foreground space-y-1.5">
                                <li>• <strong>Download:</strong> Go to any anime and click the download button</li>
                                <li>• <strong>Sync Folder:</strong> Put video files in the Tatakai folder and click Sync</li>
                                <li>• <strong>Import:</strong> Select video files from anywhere on your computer</li>
                            </ul>
                            <Button 
                                variant="link" 
                                size="sm" 
                                onClick={handleOpenFolder}
                                className="mt-2 p-0 h-auto text-xs"
                            >
                                Open Downloads Folder →
                            </Button>
                        </div>
                    </div>
                )}
            </main>

            <MobileNav />
        </div>
    );
}
