import { useMemo, useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EngineRecommendation } from '@/hooks/api/useRecommendationEngine';
import { computeAtlasLayout, type AtlasInput } from '@/core/recommendations/atlasEmbedding';
import { AnimeAtlas, type ColorBy } from './AnimeAtlas';

type MediaFilter = 'all' | 'anime' | 'manga';

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-white/10 text-[11px]">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'px-2.5 py-1 font-semibold transition-colors',
            value === o.id ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-white/65 hover:bg-white/10',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Anime Atlas: an interactive galaxy of the current recommendation candidates
 * (anime and/or manga), positioned by content similarity and colored by release
 * year or average rating.
 */
export function AnimeAtlasPanel({
  animeRecs,
  mangaRecs,
}: {
  animeRecs: EngineRecommendation[];
  mangaRecs: EngineRecommendation[];
}) {
  const [colorBy, setColorBy] = useState<ColorBy>('year');
  const [media, setMedia] = useState<MediaFilter>('all');

  const hasManga = mangaRecs.length > 0;
  const effectiveMedia: MediaFilter = !hasManga && media === 'manga' ? 'all' : media;

  const metas = useMemo<AtlasInput[]>(() => {
    const out: AtlasInput[] = [];
    // Namespace ids so anime/manga ids can't collide inside a combined layout.
    if (effectiveMedia !== 'manga') {
      for (const r of animeRecs) out.push({ ...r.anime, id: `anime:${r.anime.id}`, mediaType: 'anime', href: `/anime/${r.anime.id}` });
    }
    if (effectiveMedia !== 'anime') {
      for (const r of mangaRecs) out.push({ ...r.anime, id: `manga:${r.anime.id}`, mediaType: 'manga', href: `/manga/${r.anime.id}` });
    }
    return out;
  }, [animeRecs, mangaRecs, effectiveMedia]);

  const layout = useMemo(() => computeAtlasLayout(metas, { maxNodes: 500, neighbors: 6 }), [metas]);

  const controls = (
    <>
      <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">Color</span>
      <Segmented
        value={colorBy}
        onChange={(id) => setColorBy(id)}
        options={[{ id: 'year', label: 'Year' }, { id: 'rating', label: 'Rating' }]}
      />
      {hasManga && (
        <>
          <span className="mx-0.5 h-4 w-px bg-white/15" />
          <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">Type</span>
          <Segmented
            value={effectiveMedia}
            onChange={(id) => setMedia(id)}
            options={[{ id: 'all', label: 'All' }, { id: 'anime', label: 'Anime' }, { id: 'manga', label: 'Manga' }]}
          />
        </>
      )}
    </>
  );

  return (
    <GlassPanel className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/20 p-2">
            <Compass className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold">Anime &amp; Manga Atlas</h3>
            <p className="text-xs text-muted-foreground">Your recommendation space, mapped by similarity — closer titles are more alike.</p>
          </div>
        </div>
      </div>

      {layout.nodes.length < 3 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Not enough recommendations to map yet. Watch, rate or read more to populate the atlas.
        </p>
      ) : (
        <>
          <AnimeAtlas layout={layout} colorBy={colorBy} controls={controls} />
          <div className="mt-3 flex items-center gap-3 text-[10px] text-white/50">
            <span>{colorBy === 'year' ? 'Older' : 'Lower rated'}</span>
            <div
              className="h-2 flex-1 rounded-full"
              style={{
                background:
                  colorBy === 'year'
                    ? 'linear-gradient(90deg, rgb(13,8,135), rgb(126,3,168), rgb(204,71,120), rgb(248,149,64), rgb(240,249,33))'
                    : 'linear-gradient(90deg, rgb(215,48,39), rgb(254,224,139), rgb(26,152,80))',
              }}
            />
            <span>{colorBy === 'year' ? 'Newer' : 'Higher rated'}</span>
          </div>
        </>
      )}
    </GlassPanel>
  );
}
