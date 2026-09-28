import { CalendarPlus, CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTrackedShows, useToggleTrackedShow } from '@/hooks/user/useTrackedShows';

interface TrackShowButtonProps {
  animeId: string;
  animeName: string;
  animePoster?: string;
  anilistId?: number | null;
}

/**
 * Pins/unpins a show to the Tatakai Calendar (docs/Plans.md §6). Icon variant to
 * sit in the anime page's action-button row alongside Watchlist / Playlist /
 * Share. Filled when the show is already tracked.
 */
export function TrackShowButton({ animeId, animeName, animePoster, anilistId }: TrackShowButtonProps) {
  const { user } = useAuth();
  const { data: tracked = [] } = useTrackedShows();
  const toggle = useToggleTrackedShow();

  if (!user) return null;

  const isTracked = tracked.some((t) => t.anime_id === animeId);

  return (
    <button
      onClick={() =>
        toggle.mutate({
          animeId,
          anilistId: anilistId ?? null,
          title: animeName,
          imageUrl: animePoster,
          tracked: isTracked,
        })
      }
      disabled={toggle.isPending}
      title={isTracked ? 'Tracking on your calendar' : 'Track on your calendar'}
      className={cn(
        'h-14 w-14 rounded-full flex items-center justify-center transition-all hover:scale-105',
        isTracked
          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
          : 'bg-primary/20 hover:bg-primary/30 text-primary',
      )}
    >
      {isTracked ? <CalendarCheck className="w-6 h-6" /> : <CalendarPlus className="w-6 h-6" />}
    </button>
  );
}
