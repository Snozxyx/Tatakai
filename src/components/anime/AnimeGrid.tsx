import { Play, Star } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AnimeCard, getProxiedImageUrl } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { AnimeCardWithPreview } from "./AnimeCardWithPreview";

interface AnimeGridProps {
  animes: AnimeCard[];
  title?: string;
  icon?: React.ReactNode;
  enablePreview?: boolean;
}

export function AnimeGrid({ animes, title, icon, enablePreview = false }: AnimeGridProps) {
  const navigate = useNavigate();

  return (
    <section className="mb-24">
      {title && (
        <div className="flex items-center justify-between mb-8 px-2">
          <h3 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
            {icon}
            {title}
          </h3>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {animes.map((anime) => (
          enablePreview ? (
            <AnimeCardWithPreview key={anime.id} anime={anime} showPreview={true} />
          ) : (
            <GlassPanel
              key={anime.id}
              hoverEffect
              className="group cursor-pointer overflow-hidden"
              onClick={() => navigate(`/anime/${anime.id}`)}
            >
              <div className="relative aspect-[3/4]">
                <img
                  src={getProxiedImageUrl(anime.poster)}
                  alt={anime.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
                
                {/* Type Badge */}
                {anime.type && (
                  <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-primary/80 text-primary-foreground text-xs font-bold">
                    {anime.type}
                  </div>
                )}

                {/* Rating */}
                {anime.rating && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-md bg-background/80 backdrop-blur text-xs font-bold">
                    <Star className="w-3 h-3 fill-amber text-amber" />
                    {anime.rating}
                  </div>
                )}

                {/* Play button on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 rounded-full bg-foreground/90 flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform">
                    <Play className="w-5 h-5 fill-background text-background ml-0.5" />
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <h4 className="font-bold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                    {anime.name}
                  </h4>
                  <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                    {anime.episodes?.sub && <span>SUB {anime.episodes.sub}</span>}
                    {anime.episodes?.dub > 0 && <span>• DUB {anime.episodes.dub}</span>}
                  </div>
                </div>
              </div>
            </GlassPanel>
          )
        ))}
      </div>
    </section>
  );
}