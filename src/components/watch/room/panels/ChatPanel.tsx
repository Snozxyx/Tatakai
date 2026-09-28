import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, DownloadCloud, Smile, Send } from 'lucide-react';
import { useWatchRoomContext } from '../WatchRoomContext';

const REACTIONS = ['🔥', '👏', '😂', '😱', '❤️'];

function timeLabel(iso: string) {
    try {
        return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
        return '';
    }
}

export function ChatPanel() {
    const {
        messages, messagesEndRef, isHost, isParticipant, message, setMessage,
        handleExportChat, handleReaction, handleSendMessage, handleJoin, user,
    } = useWatchRoomContext();

    return (
        // FIX: Replaced 'h-full' with 'flex-1' below so it pushes the input to the bottom
        <div className="flex flex-1 min-h-0 flex-col bg-background/50 relative">
            
            {/* Header */}
            <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-white/[0.04] bg-background/80 px-4 py-3 backdrop-blur-md">
                <h3 className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wider text-foreground/90">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-[hsl(var(--isshoni-accent)/0.15)] ring-1 ring-[hsl(var(--isshoni-accent)/0.3)] shadow-[0_0_10px_hsl(var(--isshoni-accent)/0.2)]">
                        <MessageSquare className="h-3 w-3 text-[hsl(var(--isshoni-accent))]" />
                    </span>
                    Live Chat
                </h3>
                {isHost && messages.length > 0 && (
                    <button 
                        onClick={handleExportChat} 
                        className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-muted-foreground/80 transition-all hover:bg-white/10 hover:text-foreground active:scale-95"
                    >
                        <DownloadCloud className="h-3.5 w-3.5" /> 
                        Export
                    </button>
                )}
            </div>

            {/* Chat Area */}
            {messages.length === 0 ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 text-center animate-in fade-in zoom-in-95 duration-500">
                    <div className="relative grid h-14 w-14 place-items-center rounded-full border border-white/[0.08] bg-white/[0.02] shadow-xl">
                        <div className="absolute inset-0 rounded-full bg-[hsl(var(--isshoni-accent)/0.1)] blur-xl" />
                        <MessageSquare className="relative h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-sm font-medium text-foreground/90">No messages yet</p>
                        <p className="text-xs text-muted-foreground/60 max-w-[200px]">
                            Say hi and get the watch party talking.
                        </p>
                    </div>
                </div>
            ) : (
                <ScrollArea className="min-h-0 flex-1 px-4">
                    <div className="flex flex-col justify-end py-4 space-y-1">
                        {messages.map((m, i) => {
                            const prev = messages[i - 1];
                            const next = messages[i + 1];
                            
                            if (m.message_type === 'system') {
                                return (
                                    <div key={m.id} className="flex justify-center py-2 animate-in fade-in slide-in-from-bottom-1">
                                        <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3.5 py-1 text-[11px] font-medium text-muted-foreground/70 shadow-sm">
                                            {m.message}
                                        </span>
                                    </div>
                                );
                            }

                            if (m.message_type === 'reaction') {
                                return (
                                    <div key={m.id} className="flex items-center justify-center gap-2 py-1 text-xs animate-in zoom-in-95 fade-in">
                                        <span className="font-medium text-foreground/50">{m.display_name}</span>
                                        <span className="text-lg leading-none drop-shadow-md">{m.message}</span>
                                    </div>
                                );
                            }

                            const mine = !!user && m.user_id === user.id;
                            const grouped = !!prev && prev.user_id === m.user_id && prev.message_type === 'chat';
                            const isLast = !next || next.user_id !== m.user_id || next.message_type !== 'chat';

                            return (
                                <div key={m.id} className={`flex gap-2.5 animate-in fade-in slide-in-from-bottom-1 ${mine ? 'flex-row-reverse' : ''} ${grouped ? 'mt-0.5' : 'mt-4'}`}>
                                    <div className="w-7 shrink-0 flex flex-col justify-end">
                                        {!mine && isLast && (
                                            <Avatar className="h-7 w-7 border border-white/10 shadow-sm">
                                                <AvatarImage src={m.avatar_url || ''} />
                                                <AvatarFallback className="bg-white/10 text-[10px] font-medium">{m.display_name[0]}</AvatarFallback>
                                            </Avatar>
                                        )}
                                    </div>
                                    <div className={`flex min-w-0 max-w-[75%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                                        {!grouped && (
                                            <div className={`mb-1 flex items-baseline gap-2 px-1 ${mine ? 'flex-row-reverse' : ''}`}>
                                                <span className={`text-[11px] font-medium ${mine ? 'text-foreground/60' : 'text-[hsl(var(--isshoni-accent))]'}`}>{mine ? 'You' : m.display_name}</span>
                                                <span className="text-[10px] text-muted-foreground/40">{timeLabel(m.created_at)}</span>
                                            </div>
                                        )}
                                        <div className={`break-words px-3.5 py-2 text-[13px] leading-relaxed shadow-sm
                                            ${mine ? 'bg-[hsl(var(--isshoni-accent)/0.25)] text-foreground border border-[hsl(var(--isshoni-accent)/0.2)]' : 'bg-white/[0.06] text-foreground/90 border border-white/[0.04]'}
                                            ${mine ? 'rounded-l-2xl' : 'rounded-r-2xl'}
                                            ${!grouped ? (mine ? 'rounded-tr-2xl' : 'rounded-tl-2xl') : (mine ? 'rounded-tr-md' : 'rounded-tl-md')}
                                            ${isLast ? (mine ? 'rounded-br-sm' : 'rounded-bl-sm') : (mine ? 'rounded-br-md' : 'rounded-bl-md')}
                                        `}>
                                            {m.message}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div ref={messagesEndRef} className="h-2" />
                </ScrollArea>
            )}

            {/* Interaction Area (Input) */}
            {isParticipant ? (
                <div className="shrink-0 space-y-3 border-t border-white/[0.06] bg-background/80 p-4 pt-3 backdrop-blur-xl">
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2 shadow-sm">
                            <Smile className="mr-2 h-4 w-4 text-muted-foreground/50" />
                            <div className="h-4 w-px bg-white/10 mr-1" />
                            {REACTIONS.map((emoji) => (
                                <button key={emoji} type="button" onClick={() => handleReaction(emoji)} className="flex h-7 w-7 items-center justify-center rounded-full text-sm transition-all hover:scale-125 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 active:scale-95">{emoji}</button>
                            ))}
                        </div>
                    </div>
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                        <Input value={message} onChange={e => setMessage(e.target.value)} placeholder="Type a message..." className="h-10 flex-1 rounded-full border-white/[0.1] bg-white/[0.04] px-4 text-[13px] placeholder:text-muted-foreground/50 hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-[hsl(var(--isshoni-accent))] transition-colors shadow-inner" />
                        <Button type="submit" size="icon" className={`h-10 w-10 shrink-0 rounded-full transition-all duration-300 ${message.trim() ? 'bg-[hsl(var(--isshoni-accent))] text-black hover:bg-[hsl(var(--isshoni-accent)/0.9)] hover:scale-105 shadow-[0_0_15px_hsl(var(--isshoni-accent)/0.4)]' : 'bg-white/5 text-muted-foreground cursor-not-allowed'}`} disabled={!message.trim()} aria-label="Send message">
                            <Send className={`h-4 w-4 ${message.trim() ? 'ml-0.5' : ''}`} />
                        </Button>
                    </form>
                </div>
            ) : (
                <div className="shrink-0 border-t border-white/[0.06] bg-background/80 p-4 backdrop-blur-xl">
                    <Button className="h-10 w-full rounded-full bg-[hsl(var(--isshoni-accent))] text-black text-sm font-bold shadow-[0_0_15px_hsl(var(--isshoni-accent)/0.2)] hover:bg-[hsl(var(--isshoni-accent)/0.9)] transition-all" onClick={handleJoin}>Join to chat</Button>
                </div>
            )}
        </div>
    );
}