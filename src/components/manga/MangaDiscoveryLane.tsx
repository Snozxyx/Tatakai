import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useMemo } from "react";
import { Sparkles, Shuffle, BookOpen, Star, Flame } from "lucide-react";
import { AdultBadge } from "@/components/MediaCardBadges";
import { UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { useNavigate } from "react-router-dom";
import { getProxiedImageUrl } from "@/lib/api";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";

interface MangaDiscoveryLaneProps {
  items: UnifiedMediaCardProps["item"][];
}

export function MangaDiscoveryLane({ items }: MangaDiscoveryLaneProps) {
  useUiTranslation();
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
      <HomeSectionHeading
        icon={<Sparkles className="w-5 h-5 text-amber-400 fill-amber-400/20 animate-pulse" />}
        title={uiI18n.t('app.discovery_lane_8dbe51da')}
        subtitle={uiI18n.t('app.handpicked_random_discovery_734736c9')}
        action={
          <button
            onClick={handleShuffle}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-foreground transition-all hover:scale-105 active:scale-95 shadow-sm shrink-0"
          >
            <Shuffle className="w-3.5 h-3.5 text-primary" />
            <span>{uiI18n.t('app.pick_random_31c60df1')}</span>
          </button>
        }
      />

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
          <div className="w-36 sm:w-44 md:w-48 flex-shrink-0 aspect-[2/3] rounded-2xl overflow-hidden border border-white/20 shadow-2xl relative group/card">
            <img
              src={poster}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
            />
            {activeItem.isAdult && <AdultBadge className="absolute top-2 right-2" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
          </div>

          {/* Details */}
          <div className="flex-1 text-center md:text-left space-y-3">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              <span className="px-3 py-1 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300 text-[11px] font-black uppercase tracking-wider flex items-center gap-1">
                <Flame className="w-3 h-3 fill-amber-400" />
                {uiI18n.t('app.random_spotlight_37d3120f')}
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
              {uiI18n.t('app.discover_thrilling_stories_rich_character_arcs_a_71c5ab30')}
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-3">
              <button
                onClick={() => navigate(`/manga/${activeItem.id}`)}
                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-bold text-sm hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-primary/25"
              >
                <BookOpen className="w-4 h-4" />
                {uiI18n.t('app.start_reading_ec8c2d85')}
              </button>

              <button
                onClick={handleShuffle}
                className="px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-md text-white font-bold text-sm hover:bg-white/20 transition-all border border-white/15 flex items-center gap-2"
              >
                <Shuffle className="w-4 h-4 text-white/80" />
                {uiI18n.t('app.try_another_edddec5c')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
