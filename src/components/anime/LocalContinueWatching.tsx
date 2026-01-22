import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Play, Clock, X } from 'lucide-react';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { getLocalContinueWatching, removeFromLocalContinueWatching, LocalContinueWatchingItem } from '@/lib/localStorage';
import { useState, useEffect } from 'react';
import { getProxiedImageUrl } from '@/lib/api';

export function LocalContinueWatching() {
  const { user } = useAuth();
  const [items, setItems] = useState<LocalContinueWatchingItem[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Only show localStorage continue watching for non-logged in users
    if (!user) {
      setItems(getLocalContinueWatching());
    }
  }, [user]);

  // For logged-in users, they use the database-backed ContinueWatching component
  if (user || items.length === 0) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins}m left`;
  };

  const handleRemove = (e: React.MouseEvent, episodeId: string) => {
    e.stopPropagation();
    removeFromLocalContinueWatching(episodeId);
    setItems(getLocalContinueWatching());
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
            key={item.episodeId}
            className="group cursor-pointer overflow-hidden hover:border-primary/30 transition-all relative"
            onClick={() => navigate(`/watch/${encodeURIComponent(item.episodeId)}?t=${Math.floor(item.progressSeconds || 0)}`)}
          >
            {/* Remove button */}
            <button
              onClick={(e) => handleRemove(e, item.episodeId)}
              className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
            >
              <X className="w-3 h-3" />
            </button>

            <div className="relative aspect-video overflow-hidden">
              <img
                src={getProxiedImageUrl(item.animePoster || '/placeholder.svg')}
                alt={item.animeName}
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
                EP {item.episodeNumber}
              </div>
              
              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0">
                <ProgressBar
                  progress={item.durationSeconds ? (item.progressSeconds / item.durationSeconds) * 100 : 0}
                  className="h-1 rounded-none"
                />
              </div>
            </div>
            
            <div className="p-3">
              <h3 className="font-medium text-sm truncate mb-1">{item.animeName}</h3>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Episode {item.episodeNumber}</span>
                {item.durationSeconds && item.progressSeconds && (
                  <span>{formatTime(item.durationSeconds - item.progressSeconds)}</span>
                )}
              </div>
            </div>
          </GlassPanel>
        ))}
      </div>
    </section>
  );
}
