import { Button } from '@/components/ui/button';
import { Check, Zap, Film } from 'lucide-react';
import { useWatchRoomContext } from './WatchRoomContext';
import { IconSwap } from './IconSwap';

/** Slim info strip beneath the stage: poster · title · episode + participant "Mark ready". */
export function WatchRoomInfoBar() {
    const { room, isHost, isParticipantReady, handleToggleReady } = useWatchRoomContext();

    return (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/[0.06] bg-background/60 p-3 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-2 duration-700">
            
            {/* Metadata (Left) */}
            <div className="flex min-w-0 flex-1 items-center gap-4 pl-1">
                {/* Poster */}
                <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-md">
                    {room.anime_poster ? (
                        <img 
                            src={room.anime_poster} 
                            className="h-full w-full object-cover" 
                            alt={room.anime_title || "Poster"} 
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-white/5">
                            <Film className="w-4 h-4 text-white/20" />
                        </div>
                    )}
                </div>

                {/* Text Data */}
                <div className="flex min-w-0 flex-col justify-center">
                    <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--isshoni-accent))] drop-shadow-md">
                        Now watching
                    </p>
                    <h2 className="max-w-[200px] sm:max-w-[350px] md:max-w-[500px] truncate text-sm sm:text-base font-bold text-foreground/95 leading-tight">
                        {room.anime_title || 'Waiting for host to select anime...'}
                    </h2>
                    {(room.episode_number || room.episode_title) && (
                        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground/70 truncate max-w-[200px] sm:max-w-none">
                            {room.episode_number ? `Episode ${room.episode_number}` : ''}
                            {room.episode_number && room.episode_title ? <span className="mx-1.5 text-white/20">•</span> : ''}
                            {room.episode_title && <span className="truncate">{room.episode_title}</span>}
                        </p>
                    )}
                </div>
            </div>

            {/* Ready Status Toggle (Right - Participants Only) */}
            {!isHost && (
                <div className="pr-1 shrink-0">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleToggleReady} 
                        className={`h-10 gap-2 rounded-full px-5 transition-all duration-300 active:scale-95 ${
                            isParticipantReady 
                            ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 shadow-[0_0_20px_rgba(16,185,129,0.15)]' 
                            : 'border border-white/5 bg-white/5 text-foreground/80 hover:bg-white/10 hover:text-foreground'
                        }`}
                    >
                        <IconSwap swapKey={isParticipantReady ? 'ready' : 'not'}>
                            {isParticipantReady ? (
                                <Check className="w-4 h-4 shadow-[0_0_10px_rgba(16,185,129,0.5)] rounded-full" />
                            ) : (
                                <Zap className="w-4 h-4" />
                            )}
                        </IconSwap>
                        <span className="text-[11px] font-bold uppercase tracking-wider">
                            {isParticipantReady ? "Ready" : "Mark ready"}
                        </span>
                    </Button>
                </div>
            )}
        </div>
    );
}