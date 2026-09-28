import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { CustomVideoSourceModal } from '@/components/video/CustomVideoSourceModal';
import { getProxiedImageUrl } from '@/lib/api';
import { Film, Lock, ArrowLeft, Loader2, MonitorOff } from 'lucide-react';
import { isshoniAccentStyle } from './watchRoomShared';
import { useWatchRoomContext } from './WatchRoomContext';
import { WatchRoomTopBar } from './WatchRoomTopBar';
import { WatchRoomTimerBar } from './WatchRoomTimerBar';
import { WatchRoomStage } from './WatchRoomStage';
import { WatchRoomInfoBar } from './WatchRoomInfoBar';
import { WatchRoomDrawer } from './WatchRoomDrawer';
import { WatchRoomSettingsSheet } from './WatchRoomSettingsSheet';
import { PasswordDialog } from './dialogs/PasswordDialog';
import { LibraryPickerDialog } from './dialogs/LibraryPickerDialog';
import { PollComposerDialog } from './dialogs/PollComposerDialog';

/** Theater composition: ambient wash + top bar + (stage · info + drawer) + host sheet + dialogs. */
export function WatchRoomLayout() {
    const {
        loadingRoom, room, navigate, isModerator, isHost, isAdmin, isDesktopApp,
        prefersReducedMotion, showAnimeSearch, handleCloseAnimeSearch, handleAnimeSearchSelect,
    } = useWatchRoomContext();

    // -------------------------------------------------------------------------
    // LOADING STATE
    // -------------------------------------------------------------------------
    if (loadingRoom) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-5">
                <div className="relative grid h-20 w-20 place-items-center rounded-full border border-white/5 bg-white/[0.02]">
                    <div className="absolute inset-0 rounded-full bg-[hsl(var(--isshoni-accent)/0.2)] blur-xl animate-pulse" />
                    <Loader2 className="relative h-8 w-8 text-[hsl(var(--isshoni-accent))] animate-spin" />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 animate-pulse">
                    Joining Room...
                </p>
            </div>
        );
    }

    // -------------------------------------------------------------------------
    // ERROR / NOT FOUND STATE
    // -------------------------------------------------------------------------
    if (!room || !room.is_active) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <Background />
                <div className="relative max-w-md w-full p-10 text-center bg-white/[0.03] backdrop-blur-3xl border border-white/[0.08] rounded-[2rem] shadow-2xl animate-in zoom-in-95 fade-in duration-700">
                    <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-white/5 border border-white/10 shadow-inner">
                        <MonitorOff className="w-8 h-8 text-muted-foreground/60" />
                    </div>
                    <h2 className="text-2xl font-bold mb-3 tracking-tight text-foreground/90">Room Not Found</h2>
                    <p className="text-sm font-medium text-muted-foreground/70 mb-8 leading-relaxed">
                        This watch party may have ended, or the link is invalid. Let's find you another room to join.
                    </p>
                    <Button 
                        onClick={() => navigate('/isshoni')} 
                        className="w-full rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all active:scale-95 h-12 font-semibold shadow-lg"
                    >
                        Browse Public Rooms
                    </Button>
                </div>
            </div>
        );
    }

    // -------------------------------------------------------------------------
    // MAIN ROOM LAYOUT
    // -------------------------------------------------------------------------
    return (
        <div className="min-h-screen bg-black text-foreground overflow-y-auto font-sans animate-in fade-in duration-1000" style={isshoniAccentStyle}>
            <Background />
            <Sidebar />

            {/* Poster color-bleed: Ambient wash keyed to the room's anime art */}
            {room.anime_poster && !prefersReducedMotion && (
                <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none transition-opacity duration-1000">
                    <img
                        src={getProxiedImageUrl(room.anime_poster)}
                        alt=""
                        className="h-full w-full scale-[1.15] object-cover opacity-20 blur-[100px] saturate-[1.5]"
                    />
                    {/* Multi-layered gradient to ensure high readability of central UI elements */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black/95" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)]" />
                </div>
            )}

            <main className={`relative z-10 ${isDesktopApp ? 'pl-4' : 'pl-4 md:pl-28'} pr-4 md:pr-6 py-4 pb-24 md:py-6 min-h-screen flex flex-col`}>
                
                <WatchRoomTopBar />
                {isHost && <WatchRoomTimerBar />}

                {isModerator && !isHost && !isAdmin ? (
                    // RESTRICTED MODERATOR VIEW
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 py-16 px-4 animate-in fade-in zoom-in-95 duration-500">
                        <div className="max-w-md p-10 text-center bg-black/40 backdrop-blur-3xl border border-red-500/10 rounded-[2rem] shadow-[0_0_50px_rgba(239,68,68,0.05)]">
                            <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-red-500/10 border border-red-500/20 shadow-inner">
                                <Lock className="w-8 h-8 text-red-400/80" />
                            </div>
                            <h2 className="text-xl font-bold mb-3 tracking-tight text-foreground/90">Restricted Access</h2>
                            <p className="text-sm font-medium text-muted-foreground/70 mb-8 leading-relaxed">
                                Moderators have restricted access to watch rooms. You cannot view the broadcast, participants, or chat.
                            </p>
                            <Button 
                                onClick={() => navigate('/isshoni')} 
                                variant="outline" 
                                className="w-full h-11 gap-2 rounded-full bg-white/5 border-white/10 hover:bg-white/10 text-foreground transition-all active:scale-95"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back to Watch Rooms
                            </Button>
                        </div>
                    </div>
                ) : (
                    // THEATER GRID (Stage + Info / Drawer)
                    <div className="mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col lg:flex-row lg:items-start gap-6 lg:gap-8">
                        <div className="flex min-w-0 flex-1 flex-col gap-6 lg:gap-8 w-full">
                            <div className="w-full">
                                <WatchRoomStage />
                            </div>
                            <div className="w-full">
                                <WatchRoomInfoBar />
                            </div>
                        </div>
                        {/* Side Drawer Component handles its own responsive width/placement */}
                        <WatchRoomDrawer />
                    </div>
                )}
            </main>

            {/* OVERLAYS & DIALOGS */}
            <WatchRoomSettingsSheet />

            <CustomVideoSourceModal
                isOpen={showAnimeSearch}
                onClose={handleCloseAnimeSearch}
                onSelect={handleAnimeSearchSelect}
            />

            <PasswordDialog />
            <LibraryPickerDialog />
            <PollComposerDialog />

            <MobileNav />
        </div>
    );
}