import { motion } from "framer-motion";
import { Clock, Play } from "lucide-react";
import { getProxiedImageUrl } from "@/lib/api";

interface ScheduleAnime {
    id: string;
    title: string;
    poster?: string;
    time?: string;
    episode?: string | number;
}

interface TimelineScheduleProps {
    schedule: {
        day: string;
        anime: ScheduleAnime[];
    }[];
    accentColor?: string;
}

export function TimelineSchedule({ schedule, accentColor = "var(--primary)" }: TimelineScheduleProps) {
    if (!schedule || schedule.length === 0) return null;

    return (
        <div className="space-y-24">
            {schedule.map((dayData, dayIdx) => (
                <div key={dayData.day} className="relative">
                    {/* Day Header */}
                    <div className="flex items-center gap-6 mb-12 sticky top-0 z-20 py-2">
                        <div className="h-14 w-14 rounded-2xl bg-muted/50 backdrop-blur-xl border border-white/5 flex items-center justify-center shadow-2xl">
                            <span className="text-xl font-bold font-display">{dayData.day.substring(0, 3)}</span>
                        </div>
                        <div>
                            <h2 className="text-3xl font-bold font-display tracking-tight">{dayData.day}</h2>
                            <p className="text-muted-foreground text-xs uppercase tracking-[0.2em] font-medium">
                                {dayData.anime.length} Releases Scheduled
                            </p>
                        </div>
                    </div>

                    {/* Timeline Container */}
                    <div className="relative pl-7 md:pl-28">
                        {/* Vertical line */}
                        <div
                            className="absolute left-[34px] md:left-[55px] top-0 bottom-0 w-0.5 opacity-20"
                            style={{ background: `linear-gradient(to bottom, ${accentColor}, transparent)` }}
                        />

                        <div className="space-y-12">
                            {dayData.anime.map((anime, animeIdx) => (
                                <motion.div
                                    key={anime.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: animeIdx * 0.05 }}
                                    className="relative flex items-center gap-8 md:gap-16"
                                >
                                    {/* Time indicator point */}
                                    <div
                                        className="absolute left-[-2.5px] md:left-[18.5px] w-6 h-6 rounded-full border-4 border-background z-10 shadow-xl"
                                        style={{ backgroundColor: accentColor }}
                                    />

                                    {/* Desktop Time Display (Left of timeline) */}
                                    <div className="hidden md:block w-20 text-right">
                                        <span className="text-lg font-bold font-mono opacity-80">{anime.time || '--:--'}</span>
                                    </div>

                                    {/* Anime Card Content */}
                                    <div className="flex-1 max-w-4xl">
                                        <div className="group relative bg-muted/20 hover:bg-muted/40 backdrop-blur-sm border border-white/5 rounded-3xl p-4 md:p-6 transition-all duration-500 hover:border-white/10 hover:shadow-2xl hover:-translate-y-1">
                                            <div className="flex gap-6 items-center">
                                                {/* Mini Poster */}
                                                <div className="w-20 md:w-32 aspect-[3/4] rounded-xl overflow-hidden shadow-2xl flex-shrink-0 bg-muted/20 flex items-center justify-center">
                                                    {anime.poster ? (
                                                        <img
                                                            src={getProxiedImageUrl(anime.poster)}
                                                            alt={anime.title}
                                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                        />
                                                    ) : (
                                                        <Clock className="w-8 h-8 text-muted-foreground/30" />
                                                    )}
                                                </div>

                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2 md:hidden">
                                                        <Clock className="w-3 h-3 text-muted-foreground" />
                                                        <span className="text-xs font-bold font-mono opacity-80">{anime.time || '--:--'}</span>
                                                    </div>

                                                    <h3 className="text-lg md:text-2xl font-bold leading-tight line-clamp-1 group-hover:text-primary transition-colors mb-2">
                                                        {anime.title}
                                                    </h3>

                                                    <div className="flex items-center gap-3">
                                                        {anime.episode && (
                                                            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
                                                                Episode {anime.episode}
                                                            </div>
                                                        )}
                                                        <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                                                        <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Global Simulcast</span>
                                                    </div>
                                                </div>

                                                {/* Status Circle / Micro-interaction */}
                                                <div className="hidden md:flex flex-col items-center gap-2">
                                                    <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100">
                                                        <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
