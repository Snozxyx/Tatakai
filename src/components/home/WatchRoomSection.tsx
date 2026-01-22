import { Link } from 'react-router-dom';
import { usePublicWatchRooms } from '@/hooks/useWatchRoom';
import { WatchRoomCard } from '@/pages/IsshoNiPage';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Sparkles, ChevronRight, Radio, Users, Tv } from 'lucide-react';
import { motion } from 'framer-motion';

export function WatchRoomSection() {
    const { data: rooms = [], isLoading } = usePublicWatchRooms();

    // Only show if there are active rooms
    if (!isLoading && rooms.length === 0) {
        return null;
    }

    const liveRooms = rooms.filter(r => r.is_playing).slice(0, 3);
    const displayRooms = liveRooms.length > 0 ? liveRooms : rooms.slice(0, 3);

    return (
        <section className="mb-16">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 shadow-lg shadow-purple-500/25">
                        <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold tracking-tight">一緒に</h2>
                            <span className="text-lg text-muted-foreground font-medium">Watch Together</span>
                            {liveRooms.length > 0 && (
                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20">
                                    <Radio className="w-3 h-3 text-red-500 animate-pulse" />
                                    <span className="text-xs font-bold text-red-400">{liveRooms.length} LIVE</span>
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">Join a room and watch anime with others</p>
                    </div>
                </div>
                <Link to="/isshoni">
                    <Button variant="ghost" className="gap-1.5 group">
                        View All
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </Button>
                </Link>
            </div>

            {/* Rooms Grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-36 bg-card/30 rounded-2xl animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayRooms.map((room, i) => (
                        <motion.div
                            key={room.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                        >
                            <WatchRoomCard room={room} />
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Quick Create CTA */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-6"
            >
                <Link to="/isshoni">
                    <GlassPanel className="p-5 bg-gradient-to-r from-pink-500/5 via-purple-500/5 to-indigo-500/5 border-primary/10 hover:border-primary/30 transition-all group cursor-pointer">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 group-hover:from-pink-500/30 group-hover:to-purple-500/30 transition-colors">
                                    <Users className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="font-bold group-hover:text-primary transition-colors">Start a Watch Party</p>
                                    <p className="text-sm text-muted-foreground">Create a room and invite friends to watch together</p>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </div>
                    </GlassPanel>
                </Link>
            </motion.div>
        </section>
    );
}
