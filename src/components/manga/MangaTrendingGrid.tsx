import { Flame } from "lucide-react";
import { UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { useNavigate } from "react-router-dom";
import { getProxiedImageUrl } from "@/lib/api";

interface MangaTrendingGridProps {
  items: UnifiedMediaCardProps["item"][];
}

const SPAN_CLASSES = [
  "col-span-1 md:col-span-2 row-span-2",
  "col-span-1 row-span-1",
  "col-span-1 row-span-2",
  "col-span-1 row-span-1",
];

function MangaTrendingCard({
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
    <div
      onClick={() => navigate(`/manga/${item.id}`)}
      className={`relative group rounded-3xl overflow-hidden cursor-pointer ${spanClass} border border-border/30 min-h-[200px] md:min-h-0`}
    >
      <img
        src={getProxiedImageUrl(item.poster)}
        alt={item.name}
        className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6 group-hover:pb-8 transition-all duration-500">
        <div className="flex items-end justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 opacity-0 group-hover:opacity-100 -translate-y-2 group-hover:translate-y-0 transition-all duration-500 delay-100 font-bold overflow-hidden line-clamp-1">
              {item.chapters ? `${item.chapters} Chapters` : "Ongoing"}
            </div>
            <h3 className="font-display text-xl md:text-3xl font-black text-foreground group-hover:text-primary transition-colors leading-tight line-clamp-2 drop-shadow-xl">
              {item.name}
            </h3>
          </div>
          <div className="text-6xl md:text-8xl font-black text-white/10 group-hover:text-white/20 transition-colors leading-none tracking-tighter drop-shadow-2xl translate-y-4 group-hover:translate-y-2">
            {index + 1}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MangaTrendingGrid({ items }: MangaTrendingGridProps) {
  if (!items || items.length === 0) return null;

  return (
    <section className="mb-16 md:mb-24">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
          <Flame className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-2xl lg:text-3xl font-bold font-display tracking-tight">Hype & Trending</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 auto-rows-[200px] md:auto-rows-[240px]">
        {items.slice(0, 4).map((item, index) => (
          <MangaTrendingCard key={item.id} item={item} spanClass={SPAN_CLASSES[index % 4]} index={index} />
        ))}
      </div>
    </section>
  );
}