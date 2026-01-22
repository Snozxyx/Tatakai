import { useNavigate } from 'react-router-dom';
import { useContinueWatching } from '@/hooks/useWatchHistory';
import { useAuth } from '@/contexts/AuthContext';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Play, Clock } from 'lucide-react';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { getProxiedImageUrl } from '@/lib/api';

export function ContinueWatching() {
  const { user } = useAuth();
  const { data: items, isLoading } = useContinueWatching();
  const navigate = useNavigate();

  if (!user || isLoading || !items?.length) return null;

  const formatProgress = (progress: number, duration: number | null) => {
    if (!duration) return '0%';
    return `${Math.round((progress / duration) * 100)}%`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins}m left`;
  };

  return (
    <section className="mb-12">
      <div className="flex items-center gap-2 mb-6">
        <Clock className="w-5 h-5 text-primary" />
        <h2 className="font-display text-xl md:text-2xl font-semibold">Continue Watching</h2>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.slice(0, 4).map((item) => (
          <GlassPanel
            key={item.id}
            className="group cursor-pointer overflow-hidden hover:border-primary/30 transition-all"
            onClick={() => navigate(`/watch/${encodeURIComponent(item.episode_id)}?t=${Math.floor(item.progress_seconds || 0)}`)}
          >
            <div className="relative aspect-video overflow-hidden">
              <img
                src={getProxiedImageUrl(item.anime_poster || '/placeholder.svg')}
                alt={item.anime_name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              
              {/* Play overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center">
                  <Play className="w-5 h-5 text-primary-foreground fill-current ml-0.5" />
                </div>
              </div>
              
              {/* Episode badge */}
              <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/70 text-xs font-medium">
                EP {item.episode_number}
              </div>
              
              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0">
                <ProgressBar
                  progress={item.duration_seconds ? (item.progress_seconds / item.duration_seconds) * 100 : 0}
                  className="h-1 rounded-none"
                />
              </div>
            </div>
            
            <div className="p-3">
              <h3 className="font-medium text-sm truncate mb-1">{item.anime_name}</h3>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Episode {item.episode_number}</span>
                {item.duration_seconds && item.progress_seconds && (
                  <span>{formatTime(item.duration_seconds - item.progress_seconds)}</span>
                )}
              </div>
            </div>
          </GlassPanel>
        ))}
      </div>
    </section>
  );
}
