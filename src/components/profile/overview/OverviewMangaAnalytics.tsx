import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip } from 'recharts';
import { BookOpen, BookMarked, Layers, Star } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { useMangaMetaByIds, type MangaFormatBucket } from '@/hooks/api/useMangaMetaByIds';

// Same tooltip treatment as the anime Genre Analytics radar.
const GlassTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-background/80 p-3 shadow-2xl backdrop-blur-2xl">
        <p className="text-xs font-semibold text-foreground/90">{payload[0].payload.genre}</p>
        <p className="text-xs text-muted-foreground/70">
          Affinity <span className="font-mono font-semibold text-foreground">{payload[0].value}%</span>
        </p>
      </div>
    );
  }
  return null;
};

/**
 * Manga / manhwa / manhua analytics for the profile Overview. The readlist rows
 * carry no genres or origin, so this enriches them from AniList by `anilist_id`
 * (see `useMangaMetaByIds`) to chart the format split, top genres, and reading
 * totals. Works for own and other profiles (readlist + public metadata).
 */

export interface OverviewMangaAnalyticsProps {
  mangaReadlist?: any[];
}

const FORMAT_META: Record<MangaFormatBucket, { label: string; color: string }> = {
  manga: { label: 'Manga', color: '#8b5cf6' }, // violet
  manhwa: { label: 'Manhwa', color: '#38bdf8' }, // sky
  manhua: { label: 'Manhua', color: '#f59e0b' }, // amber
};

export function OverviewMangaAnalytics({ mangaReadlist = [] }: OverviewMangaAnalyticsProps) {
  const anilistIds = useMemo(
    () =>
      mangaReadlist
        .map((m) => m?.anilist_id)
        .filter((id): id is number => typeof id === 'number' && id > 0),
    [mangaReadlist],
  );

  const { data: metaMap = {}, isLoading } = useMangaMetaByIds(anilistIds);

  const analytics = useMemo(() => {
    const formatCounts: Record<MangaFormatBucket, number> = { manga: 0, manhwa: 0, manhua: 0 };
    const genreCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    let resolved = 0;
    let chaptersFromMeta = 0;
    let scoreSum = 0;
    let scoreCount = 0;

    // Chapters the user has actually read, from readlist progress (independent
    // of AniList enrichment).
    let chaptersRead = 0;
    let completed = 0;

    for (const row of mangaReadlist) {
      const chap = Number(row?.last_chapter_number);
      if (Number.isFinite(chap) && chap > 0) chaptersRead += chap;
      if (String(row?.status || '').toLowerCase() === 'completed') completed += 1;

      const id = typeof row?.anilist_id === 'number' ? row.anilist_id : undefined;
      const meta = id ? metaMap[id] : undefined;
      if (!meta) continue;
      resolved += 1;
      formatCounts[meta.bucket] += 1;
      (meta.genres || []).forEach((g) => genreCounts.set(g, (genreCounts.get(g) || 0) + 1));
      // Only the top few tags per title, so a single heavily-tagged series
      // doesn't dominate the cloud.
      (meta.tags || []).slice(0, 5).forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
      if (typeof meta.chapters === 'number') chaptersFromMeta += meta.chapters;
      if (typeof meta.averageScore === 'number' && meta.averageScore > 0) {
        scoreSum += meta.averageScore;
        scoreCount += 1;
      }
    }

    const formats = (Object.keys(formatCounts) as MangaFormatBucket[])
      .map((bucket) => ({ bucket, count: formatCounts[bucket], ...FORMAT_META[bucket] }))
      .filter((f) => f.count > 0)
      .sort((a, b) => b.count - a.count);

    const topGenres = Array.from(genreCounts.entries())
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Normalize to an affinity % against the most-read genre, matching the
    // anime radar's 0–100 scale.
    const genreMax = topGenres[0]?.count || 1;
    const radarData = topGenres.map((g) => ({
      genre: g.genre,
      weight: Math.round((g.count / genreMax) * 100),
    }));

    const topTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    return {
      formats,
      topGenres,
      radarData,
      topTags,
      resolved,
      total: mangaReadlist.length,
      chaptersRead,
      chaptersFromMeta,
      completed,
      avgScore: scoreCount > 0 ? scoreSum / scoreCount : 0,
      maxGenre: topGenres[0]?.count || 1,
    };
  }, [mangaReadlist, metaMap]);

  const hasData = analytics.total > 0;
  const formatTotal = analytics.formats.reduce((s, f) => s + f.count, 0);

  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-4 h-4 text-primary/80" />
          <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
            Manga & Manhwa
          </h3>
        </div>
        <p className="text-xs text-muted-foreground/70">
          Format split, top genres, and reading totals
        </p>
      </div>

      <div className="relative z-10 flex-1">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-[220px] text-center">
            <BookMarked className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground/60 max-w-[220px]">
              No manga in your readlist yet. Add titles to see your reading breakdown.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-primary mb-1">
                  <BookOpen className="w-3.5 h-3.5" />
                </div>
                <div className="font-display text-lg font-black text-foreground tabular-nums">
                  {analytics.total}
                </div>
                <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Titles</div>
              </div>
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-emerald-400 mb-1">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div className="font-display text-lg font-black text-foreground tabular-nums">
                  {analytics.chaptersRead > 0 ? analytics.chaptersRead : analytics.completed}
                </div>
                <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">
                  {analytics.chaptersRead > 0 ? 'Chapters' : 'Completed'}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-amber-400 mb-1">
                  <Star className="w-3.5 h-3.5" />
                </div>
                <div className="font-display text-lg font-black text-foreground tabular-nums">
                  {analytics.avgScore > 0 ? (analytics.avgScore / 10).toFixed(1) : '—'}
                </div>
                <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Avg Score</div>
              </div>
            </div>

            {/* Format split */}
            {analytics.formats.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Format Split
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">
                    {formatTotal} classified
                  </span>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                  {analytics.formats.map((f) => (
                    <motion.div
                      key={f.bucket}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(f.count / formatTotal) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      style={{ backgroundColor: f.color }}
                      title={`${f.label}: ${f.count}`}
                    />
                  ))}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-3">
                  {analytics.formats.map((f) => (
                    <div key={f.bucket} className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: f.color }}
                      />
                      <span className="text-xs text-foreground/80">{f.label}</span>
                      <span className="text-xs font-semibold text-muted-foreground/60 tabular-nums">
                        {f.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top genres — same radar as the anime Genre Analytics card */}
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Genre Affinity
              </span>
              {isLoading && analytics.topGenres.length === 0 ? (
                <div className="mt-2.5 h-[240px] w-full animate-pulse rounded-xl bg-white/[0.02]" />
              ) : analytics.radarData.length >= 3 ? (
                <div className="mt-1 h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={analytics.radarData} outerRadius="70%">
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis
                        dataKey="genre"
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      />
                      <Tooltip content={<GlassTooltip />} />
                      <Radar
                        dataKey="weight"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.4}
                        animationDuration={800}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              ) : analytics.topGenres.length > 0 ? (
                <div className="mt-2.5 space-y-2">
                  {analytics.topGenres.map((g) => (
                    <div key={g.genre} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground/80 w-24 shrink-0 truncate">
                        {g.genre}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-primary"
                          initial={{ width: 0 }}
                          whileInView={{ width: `${(g.count / analytics.maxGenre) * 100}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                        />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground w-6 text-right tabular-nums">
                        {g.count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground/50">
                  Genre data unavailable for these titles.
                </p>
              )}
            </div>

            {/* Top tags */}
            {analytics.topTags.length > 0 && (
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Top Tags
                </span>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {analytics.topTags.map((t) => (
                    <span
                      key={t.tag}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs font-medium text-foreground/80"
                    >
                      {t.tag}
                      <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">
                        {t.count}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
