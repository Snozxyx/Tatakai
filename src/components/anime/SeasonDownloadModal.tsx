import { useState, useEffect } from 'react';
import { Download, X, CheckCircle2, Circle, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDownload } from '@/hooks/useDownload';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';

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
    const { startDownload, downloadStates } = useDownload();
    const isNative = useIsNativeApp();

    useEffect(() => {
        if (isOpen && isNative && (window as any).electron) {
            const savedPath = localStorage.getItem('tatakai_download_path');
            if (savedPath) {
                setDownloadPath(savedPath);
            } else {
                (window as any).electron.getDownloadsDir().then((dir: string) => {
                    setDownloadPath(dir);
                });
            }
        }
    }, [isOpen, isNative]);

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-2xl">
                <GlassPanel className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            <Download className="w-6 h-6 text-primary" />
                            Download Episodes
                        </h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex items-center justify-between py-2 border-y border-white/10">
                        <span className="text-sm text-muted-foreground">{selectedIds.size} episodes selected</span>
                        <Button variant="ghost" size="sm" onClick={selectAll} className="text-primary hover:text-primary/80">
                            {selectedIds.size === episodes.length ? 'Deselect All' : 'Select All'}
                        </Button>
                    </div>

                    <ScrollArea className="h-[400px] pr-4">
                        <div className="grid grid-cols-1 gap-2">
                            {episodes.map((ep) => {
                                const state = downloadStates[ep.episodeId];
                                const isSelected = selectedIds.has(ep.episodeId);

                                return (
                                    <div
                                        key={ep.episodeId}
                                        onClick={() => state?.status !== 'downloading' && toggleEpisode(ep.episodeId)}
                                        className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-primary/10 border-primary/30' : 'bg-white/5 border-transparent hover:border-white/10'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            {isSelected ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                                            <div>
                                                <span className="font-bold">Episode {ep.number}</span>
                                                {ep.title && <span className="text-xs text-muted-foreground block truncate max-w-[300px]">{ep.title}</span>}
                                            </div>
                                        </div>

                                        {state && (
                                            <div className="flex items-center gap-4">
                                                {state.status === 'downloading' && (
                                                    <div className="text-right">
                                                        <span className="text-xs font-mono text-primary">{state.progress > 0 ? `${(state.progress).toFixed(1)}%` : 'Starting...'}</span>
                                                        <div className="w-20 h-1 bg-muted rounded-full overflow-hidden mt-1">
                                                            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${state.progress}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                                {state.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                                                {state.status === 'error' && <X className="w-5 h-5 text-destructive" />}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>

                    <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                         <div className="flex items-center gap-2 truncate max-w-[80%]">
                             <FolderOpen className="w-3 h-3" />
                             <span className="truncate">{downloadPath || 'Default Download Location'}</span>
                         </div>
                    </div>

                    <Button
                        onClick={handleDownload}
                        disabled={selectedIds.size === 0 || isStarting}
                        className="w-full h-14 rounded-2xl text-lg font-bold glow-primary"
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
