import { Newspaper, ExternalLink, Star } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { getProxiedImageUrl } from '@/lib/api';
import { useAnimeNews } from '@/hooks/community/useAnimeNews';

/** "New this season" news cards from Jikan, shown atop the News tab. */
export function AnimeNewsStrip() {
  const { data: news = [], isLoading, isError } = useAnimeNews();
  if (isError) return null;

  return (
    <GlassPanel className="relative overflow-hidden p-4">
      <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-primary/10 blur-[60px]" />
      <div className="relative mb-3 flex items-center gap-2">
        <Newspaper className="h-4 w-4 text-primary/80" />
        <h3 className="font-display text-base font-bold tracking-tight">New this season</h3>
      </div>
      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {[...Array(4)].map((_, i) => <div key={i} className="h-40 w-28 flex-shrink-0 animate-pulse rounded-xl bg-white/[0.03]" />)}
        </div>
      ) : (
        <div className="relative flex gap-3 overflow-x-auto pb-1 no-scrollbar">
          {news.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group w-28 flex-shrink-0"
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-white/[0.05] bg-muted">
                {item.image ? (
                  <img src={getProxiedImageUrl(item.image)} alt={item.title} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20"><Newspaper className="h-6 w-6 text-muted-foreground" /></div>
                )}
                {item.score != null && (
                  <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-amber">
                    <Star className="h-2.5 w-2.5 fill-current" />{item.score}
                  </span>
                )}
                <ExternalLink className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-white/70 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-tight group-hover:text-primary transition-colors">{item.title}</p>
            </a>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
