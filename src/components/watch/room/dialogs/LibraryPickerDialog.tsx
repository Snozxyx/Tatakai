import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HardDrive, ArrowLeft, Loader2, PlayCircle } from 'lucide-react';
import { useWatchRoomContext } from '../WatchRoomContext';

/** Offline-library picker — host streams a downloaded episode to the party. */
export function LibraryPickerDialog() {
    const {
        showLibraryPicker, setShowLibraryPicker, selectedLibrarySeries, setSelectedLibrarySeries,
        loadingLibrary, library, publishingLocal, publishLocalFile,
    } = useWatchRoomContext();

    return (
        <Dialog open={showLibraryPicker} onOpenChange={(open) => { if (!open) { setShowLibraryPicker(false); setSelectedLibrarySeries(null); } }}>
            <DialogContent className="max-w-lg bg-background/60 backdrop-blur-2xl border-white/10 rounded-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-semibold">
                        <HardDrive className="w-4 h-4 text-[hsl(var(--isshoni-accent))]" />
                        {selectedLibrarySeries ? selectedLibrarySeries.name : 'Stream from your library'}
                    </DialogTitle>
                </DialogHeader>

                {loadingLibrary ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /> Reading your downloads…
                    </div>
                ) : selectedLibrarySeries ? (
                    <div className="space-y-3">
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs rounded-full -ml-1" onClick={() => setSelectedLibrarySeries(null)}>
                            <ArrowLeft className="w-3.5 h-3.5" /> All series
                        </Button>
                        <ScrollArea className="h-[320px] pr-2">
                            <div className="grid grid-cols-3 gap-1.5">
                                {(selectedLibrarySeries.episodes || []).map((ep: any) => (
                                    <Button
                                        key={ep.id || ep.number || ep.file}
                                        size="sm"
                                        variant="outline"
                                        className="h-9 text-xs rounded-xl bg-white/5 border-white/10 hover:bg-white/10"
                                        disabled={publishingLocal}
                                        onClick={() => publishLocalFile(`${selectedLibrarySeries.path}/${ep.file}`, `${selectedLibrarySeries.name} • Ep ${ep.number}`)}
                                    >
                                        {publishingLocal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Ep ${ep.number}`}
                                    </Button>
                                ))}
                                {(selectedLibrarySeries.episodes || []).length === 0 && (
                                    <p className="col-span-3 py-8 text-center text-xs text-muted-foreground">No downloaded episodes in this series.</p>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                ) : library.length === 0 ? (
                    <div className="py-12 text-center space-y-2">
                        <HardDrive className="w-10 h-10 mx-auto text-muted-foreground opacity-40" />
                        <p className="text-sm text-muted-foreground">Your offline library is empty.</p>
                        <p className="text-[11px] text-muted-foreground/70">Download episodes from an anime page, or pick any video file instead.</p>
                    </div>
                ) : (
                    <ScrollArea className="h-[360px] pr-2">
                        <div className="space-y-1.5">
                            {library.map((item, i) => (
                                <button
                                    key={item.path || item.name || i}
                                    type="button"
                                    className="w-full flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2 text-left transition-colors hover:bg-white/10 disabled:opacity-50"
                                    disabled={publishingLocal}
                                    onClick={() => setSelectedLibrarySeries(item)}
                                >
                                    <img
                                        src={item.posterUrl || item.poster || ''}
                                        alt=""
                                        className="w-10 h-14 rounded-lg object-cover bg-white/5 shrink-0 [outline:1px_solid_oklch(1_0_0/0.1)]"
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate text-foreground/90">{item.name}</p>
                                        <p className="text-[11px] text-muted-foreground tabular-nums">
                                            {item.downloadedEpisodes ?? item.episodes?.length ?? 0} downloaded
                                        </p>
                                    </div>
                                    <PlayCircle className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                                </button>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
    );
}
