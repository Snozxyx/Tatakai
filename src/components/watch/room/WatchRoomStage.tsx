import { getProxiedImageUrl } from '@/lib/api';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { EmbedPlayer } from '@/components/video/EmbedPlayer';
import { Timer, Users, Film, Zap, Loader2, AlertTriangle } from 'lucide-react';
import { useWatchRoomContext } from './WatchRoomContext';

/** Centered 16:9 theater stage: countdown screen, the player (embed/video), and live/sync overlays. */
export function WatchRoomStage() {
    const {
        room, streamingData, currentEpisodeId, selectedServer, playerRef,
        isHost, roomId, lastUpdateRef, updatePlayback, handlePlayerError,
        loadingSources, drift, countdown, participants, handleForceStart,
    } = useWatchRoomContext();

    return (
        <div className="group/video relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[1.5rem] md:rounded-[2rem] border border-white/[0.08] bg-black shadow-[0_28px_80px_-24px_rgba(0,0,0,0.95)] ring-1 ring-white/[0.02] animate-in fade-in zoom-in-[0.98] duration-700">
            {room.scheduled_start_at ? (
                // -----------------------------------------------------
                // COUNTDOWN SCREEN
                // -----------------------------------------------------
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6 sm:p-8 animate-in fade-in duration-500">
                    {/* Cinematic Blurred Background */}
                    {room.anime_poster && (
                        <>
                            <div 
                                className="absolute inset-0 scale-[1.15] opacity-30 blur-[40px] transition-opacity duration-1000" 
                                style={{ backgroundImage: `url(${getProxiedImageUrl(room.anime_poster)})`, backgroundSize: 'cover', backgroundPosition: 'center' }} 
                            />
                            {/* Vignette overlay for text readability */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
                        </>
                    )}
                    
                    <div className="relative z-10 flex flex-col items-center text-center w-full max-w-lg">
                        {/* Glowing Icon */}
                        <div className="mb-6 rounded-3xl border border-[hsl(var(--isshoni-accent)/0.2)] bg-[hsl(var(--isshoni-accent)/0.1)] p-4 shadow-[0_0_40px_hsl(var(--isshoni-accent)/0.15)] backdrop-blur-md">
                            <Timer className="w-8 h-8 sm:w-10 sm:h-10 text-[hsl(var(--isshoni-accent))] animate-pulse" />
                        </div>
                        
                        <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white mb-2 drop-shadow-lg">Starting soon</h2>
                        <p className="text-xs sm:text-sm font-medium text-white/60 mb-8 uppercase tracking-widest">The broadcast begins in</p>
                        
                        {/* Timer Digits */}
                        <div className="flex items-end justify-center gap-3 sm:gap-5 mb-10 text-white drop-shadow-2xl">
                            <div className="flex flex-col items-center">
                                <div className="text-5xl sm:text-7xl font-bold tabular-nums tracking-tighter">
                                    {countdown !== null ? Math.floor(countdown / 60) : '0'}
                                </div>
                                <div className="text-[10px] sm:text-xs font-semibold text-white/50 mt-1 uppercase tracking-widest">Minutes</div>
                            </div>
                            <div className="text-4xl sm:text-6xl font-light text-white/20 pb-4 sm:pb-6 animate-pulse">:</div>
                            <div className="flex flex-col items-center">
                                <div className="text-5xl sm:text-7xl font-bold tabular-nums tracking-tighter">
                                    {(countdown !== null ? countdown % 60 : 0).toString().padStart(2, '0')}
                                </div>
                                <div className="text-[10px] sm:text-xs font-semibold text-white/50 mt-1 uppercase tracking-widest">Seconds</div>
                            </div>
                        </div>

                        {/* Interactive Pill */}
                        <div className="flex items-center gap-3 sm:gap-4 rounded-full border border-white/10 bg-white/5 px-2 py-1.5 backdrop-blur-xl shadow-2xl">
                            <div className="flex items-center gap-2 pl-3">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                </span>
                                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-white/90">
                                    {participants.length} Ready
                                </span>
                            </div>
                            {isHost && (
                                <>
                                    <div className="w-px h-5 bg-white/10" />
                                    <button 
                                        onClick={handleForceStart} 
                                        className="rounded-full bg-[hsl(var(--isshoni-accent))] px-4 py-1.5 text-[11px] sm:text-xs font-bold text-black transition-all hover:bg-[hsl(var(--isshoni-accent)/0.9)] hover:scale-105 active:scale-95 shadow-[0_0_15px_hsl(var(--isshoni-accent)/0.3)]"
                                    >
                                        Start Now
                                    </button>
                                </>
                            )}
                            {!isHost && <div className="pr-3" />}
                        </div>
                    </div>
                </div>
            ) : (
                // -----------------------------------------------------
                // VIDEO / EMBED SCREEN
                // -----------------------------------------------------
                <div className="w-full h-full relative animate-in fade-in duration-700">
                    {(room.manual_stream_url || (streamingData?.sources && room.anime_id && currentEpisodeId)) ? (
                        
                        // Check if Embed vs Video Player
                        ((room.manual_stream_url ? ((room as any).manual_stream_type === 'embed' || (!room.manual_stream_url.includes('.m3u8') && !room.manual_stream_url.includes('.mp4') && !room.manual_stream_url.includes('.webm'))) : streamingData?.sources?.[0]?.isEmbed)) ? (
                            <div className="w-full h-full relative bg-black">
                                <EmbedPlayer
                                    url={room.manual_stream_url || streamingData?.sources?.[0]?.url || ''}
                                    poster={room.anime_poster || undefined}
                                    language="Embed"
                                />
                                {/* Sleek Embed Warning Badge */}
                                <div className="absolute top-4 inset-x-0 z-50 flex justify-center pointer-events-none animate-in slide-in-from-top-4 fade-in">
                                    <div className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-1.5 shadow-[0_0_20px_rgba(245,158,11,0.15)] backdrop-blur-md">
                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                            Sync disabled for embedded sources
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <VideoPlayer
                                key={`${currentEpisodeId}-${selectedServer}-${room.manual_stream_url}`}
                                externalRef={playerRef}
                                sources={room.manual_stream_url ? [{
                                    url: room.manual_stream_url,
                                    isM3U8: room.manual_stream_url.includes('.m3u8'),
                                    quality: 'Custom',
                                    isEmbed: false
                                }] : streamingData?.sources!}
                                headers={room.manual_stream_url ? {} : streamingData?.headers}
                                subtitles={[
                                    ...((sData) => {
                                        const all = [...(sData?.subtitles || []), ...(sData?.tracks || [])];
                                        const seen = new Set();
                                        return all.filter(s => {
                                            if (seen.has(s.url)) return false;
                                            seen.add(s.url);
                                            return true;
                                        });
                                    })(streamingData || { subtitles: [], tracks: [] }),
                                    ...(room.manual_subtitle_url ? [{ lang: 'Manual', url: room.manual_subtitle_url, label: 'Manual' }] : [])
                                ]}
                                isLive={!isHost}
                                initialSeekSeconds={room.current_time_seconds}
                                onPlay={isHost ? () => updatePlayback.mutate({ roomId: roomId!, isPlaying: true }) : undefined}
                                onPause={isHost ? () => updatePlayback.mutate({ roomId: roomId!, isPlaying: false }) : undefined}
                                onProgressUpdate={isHost ? (t) => {
                                    if (Math.abs(t - lastUpdateRef.current) > 5) {
                                        lastUpdateRef.current = t;
                                        updatePlayback.mutate({ roomId: roomId!, currentTime: t });
                                    }
                                } : undefined}
                                onError={handlePlayerError}
                                animeId={room.anime_id}
                                animeName={room.anime_title}
                                animePoster={room.anime_poster}
                                episodeNumber={room.episode_number}
                                episodeTitle={room.episode_title}
                            />
                        )
                    ) : (
                        // -----------------------------------------------------
                        // LOADING / WAITING FOR HOST SCREEN
                        // -----------------------------------------------------
                        <div className="flex flex-col items-center justify-center h-full w-full bg-black">
                            <div className="relative grid h-16 w-16 place-items-center rounded-full border border-white/5 bg-white/[0.02] mb-4">
                                <div className="absolute inset-0 rounded-full bg-[hsl(var(--isshoni-accent)/0.05)] blur-xl animate-pulse" />
                                {loadingSources ? (
                                    <Loader2 className="relative h-6 w-6 text-[hsl(var(--isshoni-accent))] animate-spin" />
                                ) : (
                                    <Film className="relative h-6 w-6 text-white/20" />
                                )}
                            </div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                                {loadingSources ? 'Loading stream...' : (room.anime_title ? 'Preparing...' : 'Waiting for host')}
                            </p>
                        </div>
                    )}

                    {/* Live Indicator Overlay (Participant Only) */}
                    {!isHost && room.is_playing && (
                        <div className="absolute top-4 left-1/2 z-50 -translate-x-1/2 pointer-events-none animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-black/60 px-3.5 py-1.5 shadow-[0_10px_20px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                                <div className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white">Live</span>
                                </div>
                                <div className="w-px h-3 bg-white/15" />
                                <span className="text-[11px] font-semibold text-[hsl(var(--isshoni-accent))] tabular-nums">
                                    {Math.floor((playerRef.current?.currentTime || 0) / 60)}:
                                    {Math.floor((playerRef.current?.currentTime || 0) % 60).toString().padStart(2, '0')}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Sync Pulse (Low Drift Indicator) */}
                    {!isHost && room.is_playing && drift < 1.0 && (
                        <div className="absolute top-4 right-4 z-50 pointer-events-none animate-in zoom-in-95 fade-in">
                            <div className="grid h-7 w-7 place-items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 backdrop-blur-md shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                                <Zap className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}