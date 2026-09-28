import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Users, Radio, ArrowRight } from 'lucide-react';
import { usePublicWatchRooms } from '@/hooks/media/useWatchRoom';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PosterSlot {
  id: string;
  title: string;
  /** Proxied poster URL, or null → render a neutral gradient (no hardcoded art). */
  image: string | null;
}

export interface WatchTogetherWidgetProps {
  className?: string;
}

export function WatchTogetherWidget({ className }: WatchTogetherWidgetProps) {
  const navigate = useNavigate();
  const { data: publicRooms = [] } = usePublicWatchRooms();

  const activeRooms = publicRooms.filter((r) => r.is_active);
  const activeRoomsCount = activeRooms.length;
  const mainRoom = activeRooms.find((r) => r.is_playing) || activeRooms[0] || null;
  const watching = mainRoom?.participant_count ?? 0;

  // The fan is a 3-poster composition — cap at 3 so a 4th+ active room can't
  // render an unstyled (position-less) slot. Slots come straight from live
  // rooms; a room without a poster gets a gradient, never placeholder anime art.
  const displayPosters = useMemo<PosterSlot[]>(
    () =>
      activeRooms.slice(0, 3).map((r) => ({
        id: r.id,
        title: r.anime_title || r.name || 'Watch Together',
        image: r.anime_poster ? getProxiedImageUrl(r.anime_poster) : null,
      })),
    [activeRooms],
  );

  // With no live rooms, keep one neutral card so the composition holds.
  const slots: PosterSlot[] = displayPosters.length
    ? displayPosters
    : [{ id: 'empty', title: 'No live rooms', image: null }];

  const handleNavigate = () => {
    navigate(mainRoom ? `/isshoni/room/${mainRoom.id}` : '/isshoni');
  };

  return (
    <div
      onClick={handleNavigate}
      className={cn(
        'group relative flex min-h-[380px] w-full cursor-pointer flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#08090b] shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all hover:border-white/[0.12]',
        className,
      )}
    >
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -left-20 -top-10 h-64 w-64 rounded-full bg-primary/10 blur-[100px] transition-all group-hover:bg-primary/20" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-violet-500/10 blur-[100px] transition-all group-hover:bg-violet-500/20" />

      {/* Header Info */}
      <div className="relative z-20 flex items-start justify-between p-5 pb-0">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <Radio className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-primary">Isshoni</span>
        </div>

        {activeRoomsCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 backdrop-blur-md">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
            </span>
            <span className="text-[10px] font-semibold text-white/80">{activeRoomsCount} Live</span>
          </div>
        )}
      </div>

      {/* 3D Poster Stack Animation */}
      <div className="relative z-10 mt-6 flex flex-1 items-center justify-center px-4">
        <div className="relative flex h-[190px] w-full items-center justify-center">
          {slots.map((poster, index) => (
            <div
              key={poster.id}
              className={cn(
                'absolute overflow-hidden rounded-[16px] border border-white/10 bg-white/5 shadow-2xl transition-all duration-500 ease-out',
                // Center / Front Poster
                index === 0 && 'z-30 h-[190px] w-[130px] scale-100 group-hover:-translate-y-2 group-hover:scale-105',
                // Left / Back Poster
                index === 1 &&
                  'z-20 h-[160px] w-[110px] -translate-x-14 scale-95 opacity-50 group-hover:-translate-x-20 group-hover:-translate-y-1 group-hover:-rotate-3',
                // Right / Back Poster
                index === 2 &&
                  'z-10 h-[160px] w-[110px] translate-x-14 scale-95 opacity-50 group-hover:translate-x-20 group-hover:-translate-y-1 group-hover:rotate-3',
              )}
            >
              {poster.image ? (
                <img
                  src={poster.image}
                  alt={poster.title}
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-white/[0.03] to-violet-500/20">
                  <Radio className="h-7 w-7 text-white/30" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Floating Glass Player Card */}
      <div className="relative z-30 mt-auto p-4">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40 p-4 shadow-xl backdrop-blur-xl transition-all duration-300 group-hover:border-white/[0.15] group-hover:bg-black/50">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-white transition-colors group-hover:text-primary">
                {mainRoom?.anime_title || mainRoom?.name || 'Start a Room'}
              </h3>
              <p className="mt-1 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                {mainRoom ? (
                  <>
                    <Users className="h-3 w-3" />
                    <span>{watching} watching</span>
                  </>
                ) : (
                  'Watch anime with friends'
                )}
              </p>
            </div>

            <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-transform duration-300 group-hover:scale-110 group-active:scale-95">
              {mainRoom ? <Play className="ml-0.5 h-4 w-4 fill-current" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
