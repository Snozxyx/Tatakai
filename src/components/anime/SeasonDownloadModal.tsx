import { useState, useEffect } from 'react';
import { Download, X, CheckCircle2, Circle, FolderOpen, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDownload } from '@/hooks/useDownload';
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from '@/hooks/useIsNativeApp';
import { toast } from 'sonner';

interface Episode {
    episodeId: string;
    number: number;
    title?: string;
}

interface SeasonDownloadModalProps {
    isOpen: boolean;
    onClose: () => void;
    episodes: Episode[];
    animeName: string;
    posterUrl: string;
}

export const SeasonDownloadModal = ({ isOpen, onClose, episodes, animeName, posterUrl }: SeasonDownloadModalProps) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isStarting, setIsStarting] = useState(false);
    const [downloadPath, setDownloadPath] = useState<string>('');
    const { startDownload, downloadStates = {} } = useDownload();
    const isNative = useIsNativeApp();
    const isDesktop = useIsDesktopApp();
    const isMobile = useIsMobileApp();

    // Show error if not in native app
    useEffect(() => {
        if (isOpen && !isNative) {
            toast.error('Downloads are only available in the native mobile or desktop app', {
                description: 'Please download our app to use offline download features'
            });
            onClose();
        }
    }, [isOpen, isNative, onClose]);

    useEffect(() => {
        if (isOpen && isDesktop && (window as any).electron) {
            const savedPath = localStorage.getItem('tatakai_download_path');
            if (savedPath) {
                setDownloadPath(savedPath);
            } else {
                (window as any).electron.getDownloadsDir().then((dir: string) => {
                    setDownloadPath(dir);
                });
            }
        } else if (isOpen && isMobile) {
            setDownloadPath('App Storage');
        }
    }, [isOpen, isDesktop, isMobile]);

    const toggleEpisode = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const selectAll = () => {
        if (selectedIds.size === episodes.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(episodes.map(e => e.episodeId)));
    };

    const handleDownload = async () => {
        setIsStarting(true);
        const episodesToDownload = episodes.filter(e => selectedIds.has(e.episodeId));
        for (const ep of episodesToDownload) {
            // Start downloads sequentially or in parallel? Parallel might overwhelm.
            // Sequential is safer for bandwidth.
            await startDownload({
                episodeId: ep.episodeId,
                animeName,
                episodeNumber: ep.number,
                posterUrl
            });
        }
        setIsStarting(false);
        // Don't close immediately so user can see progress
    };

    if (!isOpen) return null;

    return (
        <div className={`fixed z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in ${isDesktop ? 'inset-x-0 top-[32px] bottom-0' : 'inset-0'}`}>
            <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden">
                <GlassPanel className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                            <Download className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                            <span className="hidden sm:inline">Download Episodes</span>
                            <span className="sm:hidden">Downloads</span>
                        </h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex items-center justify-between py-2 border-y border-white/10 text-sm">
                        <span className="text-muted-foreground">{selectedIds.size} selected</span>
                        <Button variant="ghost" size="sm" onClick={selectAll} className="text-primary hover:text-primary/80 text-xs sm:text-sm">
                            {selectedIds.size === episodes.length ? 'Deselect All' : 'Select All'}
                        </Button>
                    </div>

                    <ScrollArea className="h-[300px] sm:h-[400px] pr-2 sm:pr-4">
                        <div className="grid grid-cols-1 gap-2">
                            {episodes.map((ep) => {
                                const state = downloadStates[ep.episodeId];
                                const isSelected = selectedIds.has(ep.episodeId);

                                return (
                                    <div
                                        key={ep.episodeId}
                                        onClick={() => state?.status !== 'downloading' && toggleEpisode(ep.episodeId)}
                                        className={`flex items-center justify-between p-2 sm:p-3 rounded-lg sm:rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-primary/10 border-primary/30' : 'bg-white/5 border-transparent hover:border-white/10'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                            {isSelected ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" /> : <Circle className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />}
                                            <div className="min-w-0">
                                                <span className="font-bold text-sm sm:text-base">Ep {ep.number}</span>
                                                {ep.title && <span className="text-xs text-muted-foreground block truncate max-w-[150px] sm:max-w-[300px]">{ep.title}</span>}
                                            </div>
                                        </div>

                                        {state && (
                                            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                                                {state.status === 'downloading' && (
                                                    <div className="text-right">
                                                        <span className="text-[10px] sm:text-xs font-mono text-primary">{state.progress > 0 ? `${(state.progress).toFixed(0)}%` : '...'}</span>
                                                        <div className="w-12 sm:w-20 h-1 bg-muted rounded-full overflow-hidden mt-1">
                                                            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${state.progress}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                                {state.status === 'completed' && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />}
                                                {state.status === 'error' && <X className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>

                    <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground px-1">
                         <div className="flex items-center gap-1 sm:gap-2 truncate max-w-[80%]">
                             <FolderOpen className="w-3 h-3 flex-shrink-0" />
                             <span className="truncate">{downloadPath || 'App Storage'}</span>
                         </div>
                    </div>

                    <Button
                        onClick={handleDownload}
                        disabled={selectedIds.size === 0 || isStarting}
                        className="w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl text-base sm:text-lg font-bold glow-primary"
                    >
                        {isStarting ? (
                            <>
                                <Circle className="w-5 h-5 mr-2 animate-spin border-t-transparent border-2 border-white rounded-full" />
                                Starting Downloads...
                            </>
                        ) : (
                            `Start Downloading ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`
                        )}
                    </Button>
                </GlassPanel>
            </div>
        </div>
    );
};
