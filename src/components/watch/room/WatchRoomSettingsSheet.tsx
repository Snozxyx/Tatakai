import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
    Search, PlayCircle, Settings, Loader2, Magnet, ArrowUpCircle,
    ArrowDownCircle, Film, Subtitles, HardDrive, Radio, FolderOpen,
} from 'lucide-react';
import { getFriendlyServerName } from '@/lib/serverNames';
import { useWatchRoomContext } from './WatchRoomContext';

/** Host controls as a left slide-in Sheet: anime · episodes · providers · manual · local files. */
export function WatchRoomSettingsSheet() {
    const {
        isHost, showSettings, setShowSettings, setAnimeSearchMode, setShowAnimeSearch,
        episodesData, room, updateRoom, roomId, loadingSources, serversData, isDesktopApp,
        sourceDiagnostics, refetchSources, selectedServer, setSelectedServer,
        setSelectedCategory, setTriedServers, localShare, clearLocalShare,
        handlePickLocalFile, publishingLocal, openLibraryPicker,
    } = useWatchRoomContext();

    if (!isHost) return null;

    return (
        <Sheet open={showSettings} onOpenChange={setShowSettings}>
            <SheetContent side="right" className="w-full sm:max-w-2xl bg-background/80 backdrop-blur-2xl border-white/10 p-0">
                <SheetHeader className="px-6 pt-6 pb-2">
                    <SheetTitle className="flex items-center gap-2 font-semibold"><Settings className="w-4 h-4 text-[hsl(var(--isshoni-accent))]" /> Room settings</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh_-_5rem)] px-6 pb-6">
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Search className="w-4 h-4 text-muted-foreground" /> Anime</h3>
                            <Button
                                variant="outline"
                                className="w-full justify-start text-sm bg-white/5 border-white/10 hover:bg-white/10 rounded-xl h-11"
                                onClick={() => {
                                    setAnimeSearchMode('change-room');
                                    setShowAnimeSearch(true);
                                }}
                            >
                                <Search className="w-4 h-4 mr-2 text-muted-foreground" />
                                Search & Select…
                            </Button>
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><PlayCircle className="w-4 h-4 text-muted-foreground" /> Episodes</h3>
                            <ScrollArea className="h-[200px] bg-white/5 border border-white/5 rounded-2xl p-2"><div className="grid grid-cols-4 gap-1.5">{episodesData?.episodes.map(e => <Button key={e.episodeId} size="sm" variant={room.episode_id === e.episodeId ? "secondary" : "ghost"} className={`h-9 text-xs rounded-lg ${room.episode_id === e.episodeId ? 'bg-white/15' : 'hover:bg-white/10'}`} onClick={() => updateRoom.mutate({ roomId: roomId!, updates: { episode_id: e.episodeId, episode_number: e.number, episode_title: e.title } as any })}>{e.number}</Button>)}</div></ScrollArea>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Settings className="w-4 h-4 text-muted-foreground" /> Provider Selection</h3>

                            {loadingSources && (
                                <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/5 px-3 py-4 text-xs text-muted-foreground">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Resolving servers…
                                </div>
                            )}

                            {!loadingSources && serversData.all.length === 0 && serversData.torrents.length === 0 && (
                                <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-4 text-xs text-muted-foreground space-y-2">
                                    <p className="font-semibold text-foreground/80">No servers found</p>
                                    <p className="opacity-70 leading-relaxed">
                                        {!isDesktopApp
                                            ? 'Automatic resolution needs the desktop app. Paste a custom stream URL below to host from here.'
                                            : !sourceDiagnostics?.streamEnabled
                                                ? "Couldn't read this title's AniList id or episode number yet. Re-open the room, or change the anime again."
                                                : sourceDiagnostics?.streamUnavailable
                                                    ? 'The toko streaming extension isn’t running or is out of date. Restart the app (and rebuild/reinstall the toko extension), then Retry.'
                                                    : 'No provider had this episode. Try another episode or server, or paste a custom stream URL below.'}
                                    </p>
                                    <Button size="sm" variant="outline" className="h-8 rounded-full text-xs bg-white/5 border-white/10 hover:bg-white/10" onClick={() => refetchSources()}>
                                        Retry
                                    </Button>
                                </div>
                            )}

                            {serversData.languages.map((group) => (
                                <div key={group.label} className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground px-1 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--isshoni-accent))]" />
                                        {group.label}
                                        <span className="opacity-50">({group.servers.length})</span>
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {group.servers.map((s, i) => {
                                            const active = selectedServer === s.serverName;
                                            return (
                                                <Button
                                                    key={`${group.label}-${s.serverName}-${i}`}
                                                    variant={active ? 'secondary' : 'outline'}
                                                    className={`h-9 rounded-xl px-4 text-xs ${active ? 'bg-white/15 border-transparent' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                                    onClick={() => {
                                                        setSelectedServer(s.serverName);
                                                        setSelectedCategory(s.isDub ? 'dub' : 'sub');
                                                        setTriedServers(new Set([s.serverName]));
                                                    }}
                                                >
                                                    {s.displayName || getFriendlyServerName(s.serverName) || s.serverName}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {serversData.torrents.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-amber-400/80 px-1 flex items-center gap-1.5">
                                        <Magnet className="w-3.5 h-3.5" /> Torrent Releases
                                        <span className="opacity-50">({serversData.torrents.length})</span>
                                    </p>
                                    <div className="space-y-1.5">
                                        {serversData.torrents.map((t, i) => (
                                            <div
                                                key={`torrent-${i}`}
                                                className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-xs font-medium truncate text-foreground/90">
                                                        {t.torrentTitle || t.displayName || t.serverName}
                                                    </p>
                                                    {(t.fileSize || t.fileFormat) && (
                                                        <p className="text-[11px] text-muted-foreground truncate">
                                                            {[t.fileFormat, t.fileSize].filter(Boolean).join(' · ')}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] shrink-0 tabular-nums">
                                                    {typeof t.seeders === 'number' && (
                                                        <span className="flex items-center gap-0.5 text-emerald-400">
                                                            <ArrowUpCircle className="w-3 h-3" />{t.seeders}
                                                        </span>
                                                    )}
                                                    {typeof t.leechers === 'number' && (
                                                        <span className="flex items-center gap-0.5 text-rose-400">
                                                            <ArrowDownCircle className="w-3 h-3" />{t.leechers}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[11px] italic text-muted-foreground/60 px-1">
                                        Torrent releases can't be broadcast to a watch party yet — pick a server above to host.
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Film className="w-4 h-4 text-muted-foreground" /> Custom Stream URL</h3>
                                <Input
                                    placeholder="Paste M3U8 or MP4 URL…"
                                    value={room.manual_stream_url || ''}
                                    onChange={(e) => updateRoom.mutate({ roomId: roomId!, updates: { manual_stream_url: e.target.value } as any })}
                                    className="bg-white/5 border-white/10 rounded-xl text-sm h-11"
                                />
                                <p className="text-[11px] text-muted-foreground">Overrides server selection. Supports direct links.</p>
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Subtitles className="w-4 h-4 text-muted-foreground" /> Manual Subtitle</h3>
                                <Input
                                    placeholder="Paste VTT or SRT URL…"
                                    value={room.manual_subtitle_url || ''}
                                    onChange={(e) => updateRoom.mutate({ roomId: roomId!, updates: { manual_subtitle_url: e.target.value } as any })}
                                    className="bg-white/5 border-white/10 rounded-xl text-sm h-11"
                                />
                                <p className="text-[11px] text-muted-foreground">Useful for custom servers without built-in subs.</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><HardDrive className="w-4 h-4 text-muted-foreground" /> Your Files</h3>
                            {!isDesktopApp ? (
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Streaming a file from your device or offline library needs the desktop app — it serves the file over your host tunnel.
                                </p>
                            ) : localShare ? (
                                <div className="space-y-2 rounded-2xl border border-[hsl(var(--isshoni-accent))]/30 bg-[hsl(var(--isshoni-accent))]/[0.08] px-3 py-3">
                                    <p className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5 min-w-0">
                                        <Radio className="w-3.5 h-3.5 text-[hsl(var(--isshoni-accent))] shrink-0" />
                                        <span className="truncate">{localShare.fileName || 'Local file'}</span>
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">Broadcasting from your device to the party.</p>
                                    <Button size="sm" variant="outline" className="h-8 text-xs rounded-full bg-white/5 border-white/10 hover:bg-white/10" onClick={clearLocalShare}>
                                        Stop & back to anime
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Button
                                        variant="outline"
                                        className="w-full justify-start text-sm bg-white/5 border-white/10 hover:bg-white/10 rounded-xl h-11"
                                        onClick={handlePickLocalFile}
                                        disabled={publishingLocal}
                                    >
                                        {publishingLocal ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FolderOpen className="w-4 h-4 mr-2 text-muted-foreground" />}
                                        Play a video file…
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="w-full justify-start text-sm bg-white/5 border-white/10 hover:bg-white/10 rounded-xl h-11"
                                        onClick={openLibraryPicker}
                                        disabled={publishingLocal}
                                    >
                                        <HardDrive className="w-4 h-4 mr-2 text-muted-foreground" />
                                        From your library…
                                    </Button>
                                    <p className="text-[11px] text-muted-foreground">Streams a downloaded episode or any local video to everyone in the room.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
