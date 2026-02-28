import { useAnimelokRegionalSchedule } from "@/hooks/useAnimelok";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { getProxiedImageUrl, getHighQualityPoster } from "@/lib/api";
import { Globe, Clock, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton-custom";

export function RegionalScheduleSection() {
  const { data, isLoading } = useAnimelokRegionalSchedule();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="mb-16">
        <div className="flex items-center gap-3 mb-8 px-2">
          <Skeleton className="w-8 h-8 rounded-xl" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || !data.schedule || data.schedule.length === 0) {
    return null;
  }

  // Get today and next few days
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const scheduleMap = new Map(data.schedule.map(s => [s.day.toLowerCase(), s]));
  const todaySchedule = scheduleMap.get(today.toLowerCase());
  const upcomingDays = data.schedule
    .filter(s => s.day.toLowerCase() !== today.toLowerCase())
    .slice(0, 2);

  const displaySchedule = todaySchedule ? [todaySchedule, ...upcomingDays] : data.schedule.slice(0, 3);

  return (
    <div className="mb-16">
      <div className="flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-teal-500/20 border border-green-500/30 flex items-center justify-center">
            <Globe className="w-5 h-5 text-green-400" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold">Regional Dubs Schedule</h2>
        </div>
        <button
          onClick={() => navigate("/regional-schedule")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          View All →
        </button>
      </div>

      <div className="space-y-6">
        {displaySchedule.map((daySchedule, idx) => (
          <motion.div
            key={daySchedule.day}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <GlassPanel className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold">{daySchedule.day}</h3>
                <span className="text-sm text-muted-foreground">
                  ({daySchedule.anime.length} {daySchedule.anime.length === 1 ? 'dub' : 'dubs'})
                </span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {daySchedule.anime.slice(0, 6).map((anime) => (
                  <motion.div
                    key={anime.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="cursor-pointer"
                    onClick={() => {
                      const animeId = anime.id.includes('-') ? anime.id : `${anime.id}`;
                      navigate(`/anime/${animeId}`);
                    }}
                  >
                    <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-white/5 border border-white/10 group">
                      {anime.poster && (
                        <img
                          src={getHighQualityPoster(anime.poster, anime.anilistId)}
                          alt={anime.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <h4 className="text-xs font-semibold line-clamp-2 mb-1">{anime.title}</h4>
                          {anime.time && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="w-2.5 h-2.5" />
                              {anime.time}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-6 h-6 rounded-full bg-primary/90 flex items-center justify-center">
                          <Play className="w-3 h-3 text-primary-foreground fill-primary-foreground" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </GlassPanel>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
