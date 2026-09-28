import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MessageSquare, ListOrdered, BarChart3, Users, X } from 'lucide-react';
import { useWatchRoomContext } from './WatchRoomContext';
import { ChatPanel } from './panels/ChatPanel';
import { QueuePanel } from './panels/QueuePanel';
import { PollsPanel } from './panels/PollsPanel';
import { ViewersPanel } from './panels/ViewersPanel';

/** iOS segmented tab shell + the four panels. Shared by the desktop and mobile drawer shells. */
function DrawerBody() {
    const { sideTab, setSideTab, queueItems, activePoll, participants } = useWatchRoomContext();
    
    return (
        <Tabs value={sideTab} onValueChange={(v) => setSideTab(v as any)} className="flex h-full min-h-0 flex-col">
            {/* Premium Segmented Controls */}
            <TabsList className="m-4 mb-2 grid h-auto shrink-0 grid-cols-4 rounded-[1.25rem] border border-white/[0.05] bg-black/40 p-1.5 shadow-inner backdrop-blur-xl">
                <TabsTrigger 
                    value="chat" 
                    className="relative flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-all duration-300 data-[state=active]:bg-[hsl(var(--isshoni-accent)/0.15)] data-[state=active]:text-[hsl(var(--isshoni-accent))] data-[state=active]:shadow-[0_0_10px_hsl(var(--isshoni-accent)/0.1)]"
                >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Chat</span>
                </TabsTrigger>
                
                <TabsTrigger 
                    value="queue" 
                    className="relative flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-all duration-300 data-[state=active]:bg-[hsl(var(--isshoni-accent)/0.15)] data-[state=active]:text-[hsl(var(--isshoni-accent))] data-[state=active]:shadow-[0_0_10px_hsl(var(--isshoni-accent)/0.1)]"
                >
                    <ListOrdered className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Queue</span>
                    {queueItems.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--isshoni-accent))] text-[9px] font-bold text-black shadow-md">
                            {queueItems.length}
                        </span>
                    )}
                </TabsTrigger>
                
                <TabsTrigger 
                    value="polls" 
                    className="relative flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-all duration-300 data-[state=active]:bg-[hsl(var(--isshoni-accent)/0.15)] data-[state=active]:text-[hsl(var(--isshoni-accent))] data-[state=active]:shadow-[0_0_10px_hsl(var(--isshoni-accent)/0.1)]"
                >
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Polls</span>
                    {activePoll && (
                        <span className="absolute top-1 right-2 lg:right-3 h-2 w-2 rounded-full bg-[hsl(var(--isshoni-accent))] animate-pulse shadow-[0_0_8px_hsl(var(--isshoni-accent))]" />
                    )}
                </TabsTrigger>
                
                <TabsTrigger 
                    value="viewers" 
                    className="relative flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-all duration-300 data-[state=active]:bg-[hsl(var(--isshoni-accent)/0.15)] data-[state=active]:text-[hsl(var(--isshoni-accent))] data-[state=active]:shadow-[0_0_10px_hsl(var(--isshoni-accent)/0.1)]"
                >
                    <Users className="h-3.5 w-3.5" />
                    <span className="flex items-center justify-center rounded-md bg-white/10 px-1.5 py-0.5 text-[10px]">
                        {participants.length}
                    </span>
                </TabsTrigger>
            </TabsList>

            {/* Bulletproof Flex Container (Fixes the Chat Input collapsing bug) */}
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <TabsContent value="chat" className="mt-0 flex flex-1 min-h-0 flex-col outline-none data-[state=inactive]:hidden"><ChatPanel /></TabsContent>
                <TabsContent value="queue" className="mt-0 flex flex-1 min-h-0 flex-col outline-none data-[state=inactive]:hidden"><QueuePanel /></TabsContent>
                <TabsContent value="polls" className="mt-0 flex flex-1 min-h-0 flex-col outline-none data-[state=inactive]:hidden"><PollsPanel /></TabsContent>
                <TabsContent value="viewers" className="mt-0 flex flex-1 min-h-0 flex-col outline-none data-[state=inactive]:hidden"><ViewersPanel /></TabsContent>
            </div>
        </Tabs>
    );
}

/** Slide-over drawer: an in-flow width-animated column on lg+, a full-width overlay on mobile. */
export function WatchRoomDrawer() {
    const { showDrawer, setShowDrawer } = useWatchRoomContext();

    return (
        <>
            {/* Desktop (lg+): In-flow width-animated column. 
                Animating width pushes the main Stage smoothly instead of snapping. */}
            <AnimatePresence initial={false}>
                {showDrawer && (
                    <motion.aside
                        key="drawer-desktop"
                        initial={{ width: 0, opacity: 0, x: 20 }}
                        animate={{ width: 376, opacity: 1, x: 0 }}
                        exit={{ width: 0, opacity: 0, x: 20 }}
                        transition={{ type: 'spring', duration: 0.5, bounce: 0 }}
                        className="sticky top-24 hidden h-[calc(100vh_-_8.5rem)] min-h-0 shrink-0 lg:block overflow-visible"
                    >
                        <div className="ml-6 flex h-full w-[352px] flex-col overflow-hidden rounded-[2rem] border border-white/[0.08] bg-background/60 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)] backdrop-blur-3xl">
                            <DrawerBody />
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Mobile: Full-width overlay with scrim */}
            <AnimatePresence>
                {showDrawer && (
                    <motion.div
                        key="drawer-mobile"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="lg:hidden fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowDrawer(false)}
                    >
                        <motion.aside
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
                            className="relative flex h-full w-full max-w-[320px] sm:max-w-sm flex-col overflow-hidden border-l border-white/[0.08] bg-background/80 shadow-2xl backdrop-blur-3xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Mobile Header (Prevents X button from covering tabs) */}
                            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.05] bg-black/20 px-4 py-3">
                                <span className="text-xs font-bold uppercase tracking-widest text-foreground/80">Room Panel</span>
                                <button 
                                    type="button" 
                                    onClick={() => setShowDrawer(false)} 
                                    className="rounded-full bg-white/5 p-2 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--isshoni-accent))] active:scale-95" 
                                    aria-label="Close panel"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            
                            <DrawerBody />
                        </motion.aside>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}