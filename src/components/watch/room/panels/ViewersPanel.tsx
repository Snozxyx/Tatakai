import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Users, Zap, Crown } from 'lucide-react';
import { useWatchRoomContext } from '../WatchRoomContext';

/** Viewers: participant list + host-transfer button (host-only, per participant). */
export function ViewersPanel() {
    const { participants, isHost, user, hostTransferTarget, handleTransferHost } = useWatchRoomContext();

    return (
        <div className="mt-0 flex h-full min-h-0 flex-1 flex-col relative bg-background/50">
            
            {/* Sticky Header */}
            <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-white/[0.04] bg-background/80 px-4 py-3 backdrop-blur-md">
                <h3 className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wider text-foreground/90">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-[hsl(var(--isshoni-accent)/0.15)] ring-1 ring-[hsl(var(--isshoni-accent)/0.3)] shadow-[0_0_10px_hsl(var(--isshoni-accent)/0.2)]">
                        <Users className="h-3 w-3 text-[hsl(var(--isshoni-accent))]" />
                    </span>
                    Viewers
                    <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-muted-foreground shadow-inner">
                        {participants.length}
                    </span>
                </h3>
            </div>

            {/* Viewers List */}
            <ScrollArea className="min-h-0 flex-1 px-3">
                <div className="py-4 space-y-2.5">
                    {participants.map((p, i) => {
                        const isMe = !!user && p.user_id === user.id;

                        return (
                            <div 
                                key={p.id} 
                                className={`flex items-center gap-3 rounded-2xl border p-2.5 transition-all animate-in fade-in slide-in-from-bottom-2 fill-mode-both ${
                                    isMe 
                                    ? 'border-[hsl(var(--isshoni-accent)/0.25)] bg-[hsl(var(--isshoni-accent)/0.08)] shadow-[0_0_15px_hsl(var(--isshoni-accent)/0.05)]' 
                                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06]'
                                }`}
                                style={{ animationDelay: `${i * 50}ms` }}
                            >
                                {/* Avatar */}
                                <Avatar className="h-10 w-10 shrink-0 border border-white/10 shadow-sm">
                                    <AvatarImage src={p.avatar_url || ''} />
                                    <AvatarFallback className="bg-black/40 text-xs font-medium text-white/70">
                                        {p.display_name[0]?.toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>

                                {/* User Info & Status Badges */}
                                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`truncate text-[13px] font-bold ${isMe ? 'text-foreground' : 'text-foreground/90'}`}>
                                            {p.display_name}
                                        </span>
                                        {isMe && (
                                            <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-widest text-[hsl(var(--isshoni-accent))] drop-shadow-sm">
                                                (You)
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className="flex items-center gap-1.5">
                                        {p.is_host && (
                                            <span className="flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
                                                <Crown className="h-2.5 w-2.5" /> Host
                                            </span>
                                        )}
                                        {!p.is_host && p.is_ready && (
                                            <span className="flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                                                <Zap className="h-2.5 w-2.5 fill-emerald-400" /> Ready
                                            </span>
                                        )}
                                        {!p.is_host && !p.is_ready && (
                                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                                                Watching
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Host Actions */}
                                {isHost && !p.is_host && !isMe && (
                                    <div className="pr-1 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={hostTransferTarget === p.user_id}
                                            onClick={() => handleTransferHost(p.user_id, p.display_name)}
                                            className="h-8 rounded-full border border-white/10 bg-white/5 px-3 text-[10px] font-bold uppercase tracking-wider text-foreground/80 transition-all hover:border-[hsl(var(--isshoni-accent)/0.4)] hover:bg-[hsl(var(--isshoni-accent)/0.15)] hover:text-[hsl(var(--isshoni-accent))] hover:shadow-[0_0_15px_hsl(var(--isshoni-accent)/0.2)] active:scale-95 disabled:opacity-40"
                                            title="Transfer host privileges to this user"
                                        >
                                            {hostTransferTarget === p.user_id ? 'Transferring' : 'Make Host'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
}