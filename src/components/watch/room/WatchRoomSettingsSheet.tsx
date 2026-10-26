import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
import { P2PRoomControls } from './P2PRoomControls';

/** Host controls as a left slide-in Sheet: anime · episodes · providers · manual · local files. */
export function WatchRoomSettingsSheet() {
  useUiTranslation();
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
                    <SheetTitle className="flex items-center gap-2 font-semibold"><Settings className="w-4 h-4 text-[hsl(var(--isshoni-accent))]" /> {uiI18n.t('app.room_settings_2e77763e')}</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh_-_5rem)] px-6 pb-6">
                    <div className="space-y-6">
                        <P2PRoomControls settings />
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Search className="w-4 h-4 text-muted-foreground" /> {uiI18n.t('app.anime_f1b32a19')}</h3>
                            <Button
                                variant="outline"
                                className="w-full justify-start text-sm bg-white/5 border-white/10 hover:bg-white/10 rounded-xl h-11"
                                onClick={() => {
                                    setAnimeSearchMode('change-room');
                                    setShowAnimeSearch(true);
                                }}
                            >
                                <Search className="w-4 h-4 mr-2 text-muted-foreground" />
                                {uiI18n.t('app.search_select_639bf70a')}
                            </Button>
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><PlayCircle className="w-4 h-4 text-muted-foreground" /> {uiI18n.t('app.episodes_49d641ba')}</h3>
                            <ScrollArea className="h-[200px] bg-white/5 border border-white/5 rounded-2xl p-2"><div className="grid grid-cols-4 gap-1.5">{episodesData?.episodes.map(e => <Button key={e.episodeId} size="sm" variant={room.episode_id === e.episodeId ? "secondary" : "ghost"} className={`h-9 text-xs rounded-lg ${room.episode_id === e.episodeId ? 'bg-white/15' : 'hover:bg-white/10'}`} onClick={() => updateRoom.mutate({ roomId: roomId!, updates: { episode_id: e.episodeId, episode_number: e.number, episode_title: e.title } as any })}>{e.number}</Button>)}</div></ScrollArea>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Settings className="w-4 h-4 text-muted-foreground" /> {uiI18n.t('app.provider_selection_a5bca288')}</h3>

                            {loadingSources && (
                                <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/5 px-3 py-4 text-xs text-muted-foreground">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    {uiI18n.t('app.resolving_servers_a7ede214')}
                                </div>
                            )}

                            {!loadingSources && serversData.all.length === 0 && serversData.torrents.length === 0 && (
                                <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-4 text-xs text-muted-foreground space-y-2">
                                    <p className="font-semibold text-foreground/80">{uiI18n.t('app.no_servers_found_94e48102')}</p>
                                    <p className="opacity-70 leading-relaxed">
                                        {!isDesktopApp
                                            ? uiI18n.t('app.automatic_resolution_needs_the_desktop_app_paste_83a4602c')
                                            : !sourceDiagnostics?.streamEnabled
                                                ? uiI18n.t('app.couldn_t_read_this_title_s_anilist_id_or_episode_289e7850')
                                                : sourceDiagnostics?.streamUnavailable
                                                    ? uiI18n.t('app.the_toko_streaming_extension_isn_t_running_or_is_ec74603b')
                                                    : uiI18n.t('app.no_provider_had_this_episode_try_another_episode_1cf2a202')}
                                    </p>
                                    <Button size="sm" variant="outline" className="h-8 rounded-full text-xs bg-white/5 border-white/10 hover:bg-white/10" onClick={() => refetchSources()}>
                                        {uiI18n.t('app.retry_9f5cd8a2')}
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
                                        <Magnet className="w-3.5 h-3.5" /> {uiI18n.t('app.torrent_releases_99fecbfb')}
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
                                        {uiI18n.t('app.torrent_releases_can_t_be_broadcast_to_a_watch_p_2623a053')}
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Film className="w-4 h-4 text-muted-foreground" /> {uiI18n.t('app.custom_stream_url_68d0d46c')}</h3>
                                <Input
                                    placeholder={uiI18n.t('app.paste_m3u8_or_mp4_url_7d8acc7d')}
                                    value={room.manual_stream_url || ''}
                                    onChange={(e) => updateRoom.mutate({ roomId: roomId!, updates: { manual_stream_url: e.target.value } as any })}
                                    className="bg-white/5 border-white/10 rounded-xl text-sm h-11"
                                />
                                <p className="text-[11px] text-muted-foreground">{uiI18n.t('app.overrides_server_selection_supports_direct_links_68ec480f')}</p>
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Subtitles className="w-4 h-4 text-muted-foreground" /> {uiI18n.t('app.manual_subtitle_6a23cd52')}</h3>
                                <Input
                                    placeholder={uiI18n.t('app.paste_vtt_or_srt_url_1900df4b')}
                                    value={room.manual_subtitle_url || ''}
                                    onChange={(e) => updateRoom.mutate({ roomId: roomId!, updates: { manual_subtitle_url: e.target.value } as any })}
                                    className="bg-white/5 border-white/10 rounded-xl text-sm h-11"
                                />
                                <p className="text-[11px] text-muted-foreground">{uiI18n.t('app.useful_for_custom_servers_without_built_in_subs_4b9ef4c6')}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><HardDrive className="w-4 h-4 text-muted-foreground" /> {uiI18n.t('app.your_files_1f5832f2')}</h3>
                            {!isDesktopApp ? (
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    {uiI18n.t('app.streaming_a_file_from_your_device_or_offline_lib_24bee16e')}
                                </p>
                            ) : localShare ? (
                                <div className="space-y-2 rounded-2xl border border-[hsl(var(--isshoni-accent))]/30 bg-[hsl(var(--isshoni-accent))]/[0.08] px-3 py-3">
                                    <p className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5 min-w-0">
                                        <Radio className="w-3.5 h-3.5 text-[hsl(var(--isshoni-accent))] shrink-0" />
                                        <span className="truncate">{localShare.fileName || uiI18n.t('app.local_file_576d5ace')}</span>
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">{uiI18n.t('app.broadcasting_from_your_device_to_the_party_1a731dc7')}</p>
                                    <Button size="sm" variant="outline" className="h-8 text-xs rounded-full bg-white/5 border-white/10 hover:bg-white/10" onClick={clearLocalShare}>
                                        {uiI18n.t('app.stop_back_to_anime_15cd87e3')}
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
                                        {uiI18n.t('app.play_a_video_file_0d301e58')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="w-full justify-start text-sm bg-white/5 border-white/10 hover:bg-white/10 rounded-xl h-11"
                                        onClick={openLibraryPicker}
                                        disabled={publishingLocal}
                                    >
                                        <HardDrive className="w-4 h-4 mr-2 text-muted-foreground" />
                                        {uiI18n.t('app.from_your_library_29037b9a')}
                                    </Button>
                                    <p className="text-[11px] text-muted-foreground">{uiI18n.t('app.streams_a_downloaded_episode_or_any_local_video__8482c31a')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
