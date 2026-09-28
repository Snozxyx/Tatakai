import { useNavigate } from 'react-router-dom';
import { Music2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PlaylistWidgetProps {
  className?: string;
  coverImages?: string[];
  title?: string;
  itemCount?: number;
}

export function PlaylistWidget({
  className,
  coverImages = [
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx166617-34fpC9y47tTx.png',
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx182255-butzrqd4I0aC.jpg',
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-buvcRTBx4NSm.jpg',
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg',
  ],
  title = 'Anime OSTs & Mixes',
  itemCount = 24,
}: PlaylistWidgetProps) {
  const navigate = useNavigate();
  const displayImages = coverImages.slice(0, 4);

  return (
    <div
      onClick={() => navigate('/playlists')}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#08090b] shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all hover:border-white/[0.12]',
        className
      )}
    >
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -left-16 -top-10 h-56 w-56 rounded-full bg-emerald-500/10 blur-[90px] transition-all group-hover:bg-emerald-500/20" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-primary/10 blur-[90px] transition-all group-hover:bg-primary/20" />

      {/* Header Info */}
      <div className="relative z-20 flex items-start justify-between p-5 pb-0">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10">
            <Music2 className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
            Playlists
          </span>
        </div>
      </div>

      {/* Multi-Image Grid Preview */}
      <div className="relative z-10 mt-5 flex flex-1 items-center justify-center px-4">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
          {displayImages.length > 0 ? (
            <div className={cn(
              'grid h-full w-full gap-0.5 bg-zinc-900 transition-transform duration-700 ease-out group-hover:scale-105',
              displayImages.length === 1 && 'grid-cols-1',
              displayImages.length === 2 && 'grid-cols-2',
              displayImages.length >= 3 && 'grid-cols-2 grid-rows-2'
            )}>
              {displayImages.map((img, idx) => (
                <div key={idx} className="relative h-full w-full overflow-hidden bg-zinc-800">
                  <img src={img} alt={`Playlist cover ${idx + 1}`} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-900">
              <Music2 className="h-8 w-8 text-zinc-700" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        </div>
      </div>

      {/* Bottom Floating Glass Card */}
      <div className="relative z-30 mt-5 p-4 pt-0">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40 p-4 shadow-xl backdrop-blur-xl transition-all duration-300 group-hover:border-emerald-500/30 group-hover:bg-black/50">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-white transition-colors group-hover:text-emerald-400">
                {title}
              </h3>
              <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                {itemCount} {itemCount === 1 ? 'track' : 'tracks'}
              </p>
            </div>

            <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-transform duration-300 group-hover:scale-110 group-hover:bg-emerald-400 group-active:scale-95">
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
