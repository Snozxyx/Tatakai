import { Flame } from "lucide-react";
import { memo } from "react";
import { UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { useNavigate } from "react-router-dom";
import { getHighQualityImage } from "@/lib/api";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { Peekable } from "@/components/media/MediaQuickPeek";
import { peekFromManga } from "@/components/media/quickPeekStore";

interface MangaTrendingGridProps {
  items: UnifiedMediaCardProps["item"][];
}

const SPAN_CLASSES = [
  "col-span-1 md:col-span-2 row-span-2",
  "col-span-1 row-span-1",
  "col-span-1 row-span-2",
  "col-span-1 row-span-1",
];

const MangaTrendingCard = memo(function MangaTrendingCard({
  item,
  spanClass,
  index,
}: {
  item: UnifiedMediaCardProps["item"];
  spanClass: string;
  index: number;
}) {
  const navigate = useNavigate();

  return (
    <Peekable media={peekFromManga(item, `/manga/${item.id}`)}>
    <div
      onClick={() => navigate(`/manga/${item.id}`)}
      className={`relative group rounded-3xl overflow-hidden cursor-pointer ${spanClass} border border-border/30 min-h-[200px] md:min-h-0 active:scale-[0.99]`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 240px' }}
    >
      <img
        src={getHighQualityImage(item.poster)}
        alt={item.name}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        className="w-full h-full object-cover md:transition-all md:duration-700 md:group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent opacity-80 md:group-hover:opacity-100 md:transition-opacity md:duration-500" />

      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
        <div className="flex items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="hidden md:block items-center gap-2 mb-2 opacity-0 group-hover:opacity-100 -translate-y-2 group-hover:translate-y-0 transition-all duration-500 delay-100 font-bold overflow-hidden line-clamp-1">
              {item.chapters ? `${item.chapters} Chapters` : "Ongoing"}
            </div>
            <h3 className="font-display text-lg md:text-3xl font-black text-foreground leading-tight line-clamp-2 drop-shadow-xl">
              {item.name}
            </h3>
          </div>
          <div className="text-5xl md:text-8xl font-black text-white/10 leading-none tracking-tighter drop-shadow-2xl shrink-0">
            {index + 1}
          </div>
        </div>
      </div>
    </div>
    </Peekable>
  );
})

export const MangaTrendingGrid = memo(function MangaTrendingGrid({ items }: MangaTrendingGridProps) {
  if (!items || items.length === 0) return null;

  return (
    <section className="mb-12 md:mb-24" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 480px' }}>
      <HomeSectionHeading
        icon={<Flame className="w-5 h-5 text-primary" />}
        title="Hype & Trending"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 auto-rows-[200px] md:auto-rows-[240px]">
        {items.slice(0, 4).map((item, index) => (
          <MangaTrendingCard key={item.id} item={item} spanClass={SPAN_CLASSES[index % 4]} index={index} />
        ))}
      </div>
    </section>
  );
})