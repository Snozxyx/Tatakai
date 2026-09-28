import { Button } from '@/components/ui/button';
import {
    ArrowLeft, Radio, Copy, Check, BarChart3, DownloadCloud,
    Settings, X, LogOut, Trash2, Loader2, MessageSquare,
} from 'lucide-react';
import { useWatchRoomContext } from './WatchRoomContext';
import { IconSwap } from './IconSwap';

/** Slim frosted floating top bar: back · room name/status · actions + drawer toggle. */
export function WatchRoomTopBar() {
    const {
        navigate, room, selectedCategory, broadcastChip, isReconnecting,
        copied, handleCopyLink, isHost, setShowPollDialog, handleExportChat,
        showSettings, setShowSettings, handleClose, isParticipant, handleLeave,
        isAdmin, handleAdminDelete, adminDeleteRoom, showDrawer, setShowDrawer,
    } = useWatchRoomContext();

    return (
        <header className="sticky top-4 z-30 mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/[0.06] bg-background/60 px-3 py-3 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)] backdrop-blur-2xl transition-all">
            
            {/* Left Section: Back Button & Titles */}
            <div className="flex min-w-0 flex-1 items-center gap-3.5 pl-1">
                <button 
                    type="button" 
                    onClick={() => navigate('/isshoni')} 
                    aria-label="Back to watch rooms" 
                    className="group shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] p-2.5 text-muted-foreground transition-all duration-300 hover:bg-white/[0.1] hover:text-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 active:scale-95"
                >
                    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                </button>
                
                <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex items-center gap-2.5">
                        <h1 className="truncate text-base md:text-lg font-bold tracking-tight text-foreground/95 drop-shadow-sm">
                            {room.name}
                        </h1>
                        {room.is_playing && (
                            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]" />
                                Live
                            </span>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-2 text-[11px] md:text-xs font-medium text-muted-foreground/70">
                        <p className="truncate">
                            {room.anime_title} 
                            {room.episode_number && <span className="text-white/30 mx-1.5">•</span>}
                            {room.episode_number && `Ep ${room.episode_number}`}
                            {room.episode_title && <span className="text-white/30 mx-1.5">•</span>}
                            {room.episode_title && <span className="truncate">{room.episode_title}</span>}
                        </p>
                        <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            selectedCategory === 'sub' 
                            ? 'border-primary/20 bg-primary/10 text-primary' 
                            : 'border-orange-500/20 bg-orange-500/10 text-orange-400'
                        }`}>
                            {selectedCategory}
                        </span>
                    </div>
                </div>
            </div>

            {/* Right Section: Actions & Controls */}
            <div className="flex flex-wrap items-center justify-end gap-2">
                
                {/* Status Indicators */}
                <div className="hidden md:flex items-center gap-2 mr-1">
                    <div className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--isshoni-accent)/0.2)] bg-[hsl(var(--isshoni-accent)/0.05)] px-3 py-1.5 shadow-[0_0_15px_hsl(var(--isshoni-accent)/0.05)]" title="Watch party broadcast status">
                        <Radio className={`w-3.5 h-3.5 text-[hsl(var(--isshoni-accent))] ${broadcastChip.live ? 'animate-pulse' : ''}`} />
                        <span className="text-[11px] font-semibold tracking-wide text-[hsl(var(--isshoni-accent))]">{broadcastChip.label}</span>
                    </div>
                    {isReconnecting && (
                        <div className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5">
                            <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                            <span className="text-[11px] font-semibold tracking-wide text-amber-400">Reconnecting…</span>
                        </div>
                    )}
                </div>

                {/* Core Buttons */}
                <Button variant="ghost" size="sm" onClick={handleCopyLink} aria-label="Copy room link" className="h-8 gap-1.5 rounded-full border border-white/5 bg-white/5 px-3 text-xs font-medium text-foreground/80 transition-all hover:bg-white/10 hover:text-foreground active:scale-95">
                    <IconSwap swapKey={copied ? 'check' : 'copy'}>
                        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </IconSwap>
                    <span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
                </Button>

                {isHost && (
                    <>
                        <Button variant="ghost" size="sm" onClick={() => setShowPollDialog(true)} aria-label="Create a poll" className="h-8 gap-1.5 rounded-full border border-white/5 bg-white/5 px-3 text-xs font-medium text-foreground/80 transition-all hover:bg-white/10 hover:text-foreground active:scale-95">
                            <BarChart3 className="w-3.5 h-3.5" />
                            <span className="hidden lg:inline">Poll</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleExportChat} aria-label="Export chat" className="h-8 gap-1.5 rounded-full border border-white/5 bg-white/5 px-3 text-xs font-medium text-foreground/80 transition-all hover:bg-white/10 hover:text-foreground active:scale-95">
                            <DownloadCloud className="w-3.5 h-3.5" />
                            <span className="hidden lg:inline">Export</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)} aria-label="Toggle room settings" className={`h-8 gap-1.5 rounded-full border px-3 text-xs font-medium transition-all active:scale-95 ${showSettings ? 'border-white/10 bg-white/15 text-foreground shadow-inner' : 'border-white/5 bg-white/5 text-foreground/80 hover:bg-white/10 hover:text-foreground'}`}>
                            <Settings className={`w-3.5 h-3.5 transition-transform duration-500 ${showSettings ? 'rotate-90' : ''}`} />
                            <span className="hidden sm:inline">Settings</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleClose} className="h-8 gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 text-xs font-medium text-red-400 transition-all hover:bg-red-500/20 hover:text-red-300 active:scale-95">
                            <X className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Close</span>
                        </Button>
                    </>
                )}

                {isParticipant && !isHost && (
                    <Button variant="ghost" size="sm" onClick={handleLeave} className="h-8 gap-1.5 rounded-full border border-red-500/20 bg-red-500/5 px-3 text-xs font-medium text-red-400 transition-all hover:bg-red-500/15 hover:text-red-300 active:scale-95">
                        <LogOut className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Leave</span>
                    </Button>
                )}

                {isAdmin && !isHost && (
                    <Button variant="ghost" size="sm" onClick={handleAdminDelete} disabled={adminDeleteRoom.isPending} className="h-8 gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 text-xs font-medium text-red-400 transition-all hover:bg-red-500/20 hover:text-red-300 active:scale-95" title="Admin: force-delete room">
                        {adminDeleteRoom.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">Delete</span>
                    </Button>
                )}

                {/* Primary Chat Toggle */}
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowDrawer(!showDrawer)} 
                    aria-label="Toggle chat and room panels" 
                    className={`h-8 gap-1.5 rounded-full border px-4 text-xs font-bold transition-all duration-300 active:scale-95 ${
                        showDrawer 
                        ? 'border-[hsl(var(--isshoni-accent)/0.3)] bg-[hsl(var(--isshoni-accent)/0.15)] text-[hsl(var(--isshoni-accent))] shadow-[0_0_15px_hsl(var(--isshoni-accent)/0.15)]' 
                        : 'border-white/5 bg-white/5 text-foreground/80 hover:bg-white/10 hover:text-foreground'
                    }`}
                >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Chat</span>
                </Button>
            </div>
        </header>
    );
}