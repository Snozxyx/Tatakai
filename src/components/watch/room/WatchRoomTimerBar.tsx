import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, Play, Clock, X } from 'lucide-react';
import { useWatchRoomContext } from './WatchRoomContext';

/** Host-only thin strip: ready-count + start-timer presets/custom + start-now/cancel. */
export function WatchRoomTimerBar() {
    const {
        participants, isEditingCustomTimer, setIsEditingCustomTimer,
        customTimerMinutes, setCustomTimerMinutes, handleStartTimer,
        room, handleForceStart, updateRoom, roomId,
    } = useWatchRoomContext();

    const readyCount = participants.filter(p => p.is_ready).length;
    const totalCount = participants.length;
    const isAllReady = totalCount > 0 && readyCount === totalCount;

    return (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/[0.06] bg-background/60 p-3 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)] backdrop-blur-2xl transition-all">
            
            {/* Left: Ready Status Badge */}
            <div className="flex shrink-0 items-center gap-3">
                <div className={`flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 transition-all duration-500 ${
                    isAllReady 
                    ? 'border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]' 
                    : 'border-white/[0.08] bg-white/[0.03]'
                }`}>
                    <span className={`grid h-6 w-6 place-items-center rounded-full transition-colors ${
                        isAllReady ? 'bg-emerald-500/20' : 'bg-white/10'
                    }`}>
                        <Users className={`h-3 w-3 ${isAllReady ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                    </span>
                    <span className={`text-[13px] font-bold tracking-wide transition-colors ${
                        isAllReady ? 'text-emerald-400' : 'text-foreground/90'
                    }`}>
                        {readyCount} / {totalCount} Ready
                    </span>
                </div>
            </div>

            {/* Right: Timer Controls */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5 mr-2 text-muted-foreground/50">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Host Controls</span>
                </div>

                {/* Preset Timer Buttons */}
                {[30, 60, 300].map(s => (
                    <Button 
                        key={s} 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 rounded-full border border-white/5 bg-white/5 px-4 text-xs font-medium text-foreground/80 transition-all hover:bg-white/10 hover:text-foreground active:scale-95" 
                        onClick={() => handleStartTimer(s)}
                    >
                        {s >= 60 ? `${s / 60}m` : `${s}s`}
                    </Button>
                ))}

                {/* Custom Timer Mode */}
                {!isEditingCustomTimer ? (
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 rounded-full border border-white/5 bg-white/5 px-4 text-xs font-medium text-foreground/80 transition-all hover:bg-white/10 hover:text-foreground active:scale-95" 
                        onClick={() => setIsEditingCustomTimer(true)}
                    >
                        Custom
                    </Button>
                ) : (
                    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5 pr-1 shadow-inner transition-all animate-in fade-in slide-in-from-right-2">
                        <Input 
                            type="number" 
                            value={customTimerMinutes} 
                            onChange={e => setCustomTimerMinutes(e.target.value)} 
                            placeholder="Min"
                            className="h-7 w-14 border-0 bg-transparent px-2 text-center text-xs focus-visible:ring-0 placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                        />
                        <Button 
                            size="icon" 
                            className="h-6 w-6 shrink-0 rounded-full bg-[hsl(var(--isshoni-accent))] text-black hover:bg-[hsl(var(--isshoni-accent)/0.9)] active:scale-95 transition-all shadow-sm" 
                            onClick={() => { 
                                handleStartTimer(parseInt(customTimerMinutes) * 60); 
                                setIsEditingCustomTimer(false); 
                            }}
                        >
                            <Play className="h-3 w-3 ml-0.5" />
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-6 w-6 shrink-0 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                            onClick={() => setIsEditingCustomTimer(false)}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                )}

                {/* Active Timer Override Actions (Only visible when a timer is running) */}
                {room.scheduled_start_at && (
                    <div className="flex items-center gap-2 pl-2 ml-1 border-l border-white/10 animate-in fade-in slide-in-from-left-2">
                        <Button 
                            className="h-8 gap-1.5 rounded-full bg-emerald-500/10 px-4 text-xs font-bold text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:text-emerald-300 transition-all active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.1)]" 
                            onClick={handleForceStart}
                        >
                            <Play className="h-3 w-3 fill-current" />
                            Start Now
                        </Button>
                        <Button 
                            variant="ghost" 
                            className="h-8 rounded-full border border-red-500/20 bg-red-500/10 px-4 text-xs font-medium text-red-400 transition-all hover:bg-red-500/20 hover:text-red-300 active:scale-95" 
                            onClick={() => updateRoom.mutate({ roomId: roomId!, updates: { scheduled_start_at: null } as any })}
                        >
                            Cancel
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}