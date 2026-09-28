import { useNavigate } from 'react-router-dom';
import { Layers, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TierListWidgetProps {
  className?: string;
  imageSrc?: string;
}

const PREVIEW_TIERS = [
  {
    label: 'S',
    gradient: 'from-[#ff5236] to-[#e63946]',
    textColor: 'text-white',
    images: [
      'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx202269-7KNj8s2fSsJJ.jpg',
      'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg'
    ],
  },
  {
    label: 'A',
    gradient: 'from-[#ff9d2e] to-[#ff7f3f]',
    textColor: 'text-white',
    images: [
      'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-73IhOXpJZiMF.jpg'
    ],
  },
  {
    label: 'B',
    gradient: 'from-[#ffd700] to-[#ffba08]',
    textColor: 'text-amber-950',
    images: [],
  },
  {
    label: 'C',
    gradient: 'from-[#52d452] to-[#3dcd3d]',
    textColor: 'text-white',
    images: [],
  },
  {
    label: 'D',
    gradient: 'from-[#4f8fdb] to-[#3a6fbb]',
    textColor: 'text-white',
    images: [],
  },
];

export function TierListWidget({
  className,
  imageSrc,
}: TierListWidgetProps) {
  const navigate = useNavigate();

  // If a custom image is provided, inject it into the S-tier preview
  const tiers = [...PREVIEW_TIERS];
  if (imageSrc && tiers[0].images[0] !== imageSrc) {
    tiers[0].images[0] = imageSrc;
  }

  return (
    <div
      onClick={() => navigate('/tierlists')}
      className={cn(
        "group relative flex h-auto w-full cursor-pointer flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#08090b] shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all hover:border-white/[0.12]",
        className
      )}
    >
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-amber-500/10 blur-[80px] transition-all group-hover:bg-amber-500/20" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-56 w-56 rounded-full bg-rose-500/10 blur-[80px] transition-all group-hover:bg-rose-500/20" />

      {/* Header Info */}
      <div className="relative z-20 flex items-start justify-between p-5 pb-0">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10">
            <Layers className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
            Tier Maker
          </span>
        </div>
      </div>

      {/* Tier List Preview Layout */}
      <div className="relative z-10 mt-5 flex flex-1 flex-col gap-1.5 px-4">
        {tiers.map((tier, index) => (
          <div 
            key={tier.label} 
            className="flex h-12 w-full gap-1.5 transition-transform duration-500 ease-out"
            style={{ 
              transform: `translateX(0px)`,
            }}
          >
            {/* Tier Letter Block */}
            <div className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-md transition-all duration-300 group-hover:scale-[1.03]",
              tier.gradient
            )}>
              <span className={cn("text-lg font-black drop-shadow-sm", tier.textColor)}>
                {tier.label}
              </span>
            </div>

            {/* Tier Drop Zone */}
            <div className="relative flex flex-1 items-center gap-1.5 overflow-hidden rounded-lg border border-white/[0.03] bg-black/40 px-2 transition-colors duration-300 group-hover:bg-black/60">
              
              {/* Empty State Dashed Border (visible only if no images) */}
              {tier.images.length === 0 && (
                <div className="absolute inset-2 rounded border border-dashed border-white/10 transition-colors duration-300 group-hover:border-white/20" />
              )}

              {/* Tier Items (Posters) */}
              {tier.images.map((img, imgIndex) => (
                <div 
                  key={imgIndex}
                  className="relative z-10 h-9 w-9 shrink-0 overflow-hidden rounded border border-white/10 shadow-sm transition-all duration-500 group-hover:-translate-y-0.5 group-hover:scale-105 group-hover:shadow-md"
                  style={{ transitionDelay: `${(index * 100) + (imgIndex * 50)}ms` }}
                >
                  <img
                    src={img}
                    alt={`${tier.label} Tier Item`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}

              {/* Placeholder text if empty */}
              {tier.images.length === 0 && tier.label === 'B' && (
                <span className="relative z-10 ml-2 text-[10px] font-medium text-white/30 transition-colors duration-300 group-hover:text-white/50">
                  Drag items here
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Fade Mask & Floating Glass Card */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end bg-gradient-to-t from-[#08090b] via-[#08090b]/90 to-transparent pt-12 pb-4 px-4">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all duration-300 group-hover:border-amber-500/30 group-hover:bg-black/60">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-white transition-colors group-hover:text-amber-400">
                Rank Your Favorites
              </h3>
              <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                Build your ultimate anime list
              </p>
            </div>

            <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-transform duration-300 group-hover:scale-110 group-hover:bg-amber-400 group-active:scale-95">
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}