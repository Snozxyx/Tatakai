import { useState, useMemo } from "react";
import { Sparkles, Shuffle, BookOpen, Star, Flame, ShieldAlert } from "lucide-react";
import { UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { useNavigate } from "react-router-dom";
import { getProxiedImageUrl } from "@/lib/api";

interface MangaDiscoveryLaneProps {
  items: UnifiedMediaCardProps["item"][];
}

export function MangaDiscoveryLane({ items }: MangaDiscoveryLaneProps) {
  const navigate = useNavigate();
  const validItems = useMemo(() => items.filter((item) => Boolean(item && item.poster && item.name)), [items]);
  
  const [selectedIndex, setSelectedIndex] = useState(0);

  const activeItem = validItems[selectedIndex] || validItems[0];

  const handleShuffle = () => {
    if (validItems.length <= 1) return;
    let nextIdx = Math.floor(Math.random() * validItems.length);
    if (nextIdx === selectedIndex) {
      nextIdx = (selectedIndex + 1) % validItems.length;
    }
    setSelectedIndex(nextIdx);
  };

  if (!activeItem) return null;

  const title = activeItem.name;
  const poster = getProxiedImageUrl(activeItem.poster || "");

  return (
    <section className="mb-14">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400 fill-amber-400/20 animate-pulse" />
            Discovery Lane
          </h2>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            Handpicked random discovery with rich translucent backdrop visuals
          </p>
        </div>

        <button
          onClick={handleShuffle}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-foreground transition-all hover:scale-105 active:scale-95 shadow-sm"
        >
          <Shuffle className="w-3.5 h-3.5 text-primary" />
          <span>Pick Random</span>
        </button>
      </div>

      <div className="relative rounded-3xl overflow-hidden border border-white/15 shadow-2xl group">
        {/* Background Artwork Blur */}
        <div className="absolute inset-0 z-0">
          <img
            src={poster}
            alt=""
            className="w-full h-full object-cover scale-110 filter blur-xl brightness-[0.4] contrast-125 transition-all duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-90" />
        </div>

        {/* Translucent Content Glass Panel */}
        <div className="relative z-10 p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-8 backdrop-blur-md bg-black/30">
          {/* Card Poster with hover glow */}
          <div className="w-36 sm:w-44 md:w-48 flex-shrink-0 aspect-[3/4] rounded-2xl overflow-hidden border border-white/20 shadow-2xl relative group/card">
            <img
              src={poster}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
            />
            {activeItem.isAdult && (
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600/90 border border-rose-400/40 text-[10px] font-black uppercase text-white shadow-lg">
                <ShieldAlert className="w-3 h-3 text-rose-100" />
                18+
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
          </div>

          {/* Details */}
          <div className="flex-1 text-center md:text-left space-y-3">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              <span className="px-3 py-1 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300 text-[11px] font-black uppercase tracking-wider flex items-center gap-1">
                <Flame className="w-3 h-3 fill-amber-400" />
                Random Spotlight
              </span>

              {activeItem.rating && (
                <span className="px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] font-bold text-white flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  {activeItem.rating}
                </span>
              )}

              {activeItem.type && (
                <span className="px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] font-bold text-white/80 uppercase">
                  {activeItem.type}
                </span>
              )}
            </div>

            <h3 className="text-2xl md:text-4xl font-black tracking-tight text-white line-clamp-2 leading-tight">
              {title}
            </h3>

            <p className="text-xs md:text-sm text-gray-300 line-clamp-2 max-w-2xl leading-relaxed">
              Discover thrilling stories, rich character arcs, and high quality artwork in this selected title.
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-3">
              <button
                onClick={() => navigate(`/manga/${activeItem.id}`)}
                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-bold text-sm hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-primary/25"
              >
                <BookOpen className="w-4 h-4" />
                Start Reading
              </button>

              <button
                onClick={handleShuffle}
                className="px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-md text-white font-bold text-sm hover:bg-white/20 transition-all border border-white/15 flex items-center gap-2"
              >
                <Shuffle className="w-4 h-4 text-white/80" />
                Try Another
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
