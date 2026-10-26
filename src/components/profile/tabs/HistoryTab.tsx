import { isTV } from "@/core/tv/device";
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { compareWatchHistory } from '@/lib/watchHistoryQuery';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { History, Play, BookOpen, Clock, Search, LayoutGrid } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/localeFormat';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { MANGA_STATUS_LABELS, TAB_PANEL_CLASS } from './statusLabels';
import { useResolvedMangaReadlist } from '@/hooks/api/useResolvedMangaReadlist';
import { readingHistoryHref } from '@/lib/readingHistory';

interface HistoryTabProps {
  history: any[];
  mangaHistoryEntries: any[];
  novelHistoryEntries?: any[];
  loading?: boolean;
  isViewingOther?: boolean;
  onNavigate: (path: string) => void;
  formatDate: (dateString: string) => string;
}

type HistoryFilter = 'all' | 'anime' | 'manga' | 'novel';

const FILTERS: { key: HistoryFilter; label: string; icon: typeof Play }[] = [
  { key: 'all', get label() { return uiI18n.t('app.all_6a720856'); }, icon: LayoutGrid },
  { key: 'anime', get label() { return uiI18n.t('app.anime_f1b32a19'); }, icon: Play },
  { key: 'manga', get label() { return uiI18n.t('app.manga_87db0f99'); }, icon: BookOpen },
  { key: 'novel', get label() { return uiI18n.t('app.novels_4ae488fd'); }, icon: BookOpen },
];

export function HistoryTab({ history, mangaHistoryEntries, novelHistoryEntries = [], loading, isViewingOther, onNavigate, formatDate }: HistoryTabProps) {
  useUiTranslation();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const { data: resolvedMangaHistory, isLoading: metadataLoading } = useResolvedMangaReadlist(mangaHistoryEntries);

  const hasAnyAnime = (history?.length || 0) > 0;
  const hasAnyManga = resolvedMangaHistory.length > 0;
  const hasAnyNovel = novelHistoryEntries.length > 0;
  const hasAnyHistory = hasAnyAnime || hasAnyManga || hasAnyNovel;

  const animeFiltered = useMemo(
    () => (history || []).filter((i: any) => !term || (i.anime_name || '').toLowerCase().includes(term)),
    [history, term],
  );
  const mangaFiltered = useMemo(
    () => resolvedMangaHistory.filter((i: any) => !term || (i.manga_title || '').toLowerCase().includes(term)),
    [resolvedMangaHistory, term],
  );

  const novelFiltered = novelHistoryEntries.filter(i => !term || (i.manga_title || '').toLowerCase().includes(term));
  const showAnime = (filter === 'all' || filter === 'anime') && animeFiltered.length > 0;
  const readingSections = [
    { key: 'manga', label: uiI18n.t('app.manga_reading_054694f6'), rows: mangaFiltered },
    { key: 'novel', label: uiI18n.t('app.novels_4ae488fd'), rows: novelFiltered },
  ].filter(section => (filter === 'all' || filter === section.key) && section.rows.length > 0);
  const nothingToShow = hasAnyHistory && !showAnime && readingSections.length === 0;
  return (
    <GlassPanel className={TAB_PANEL_CLASS}>
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">{uiI18n.t('app.activity_history_ca84f7d0')}</h3>
          </div>

          {hasAnyHistory && (
            <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
              <div className="flex items-center gap-1 rounded-full bg-white/[0.03] border border-white/[0.08] p-1">
                {FILTERS.map((f) => {
                  const Icon = f.icon;
                  const active = filter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all',
                        active
                          ? 'bg-primary text-primary-foreground shadow-[0_0_20px_rgba(var(--primary),0.4)]'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <div className="relative flex-1 min-w-[8rem] sm:w-56 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={uiI18n.t('app.search_history_bebd2c90')}
                  className="pl-9 rounded-full bg-white/[0.03] border-white/[0.08] h-10"
                />
              </div>
            </div>
          )}
        </div>
        {loading || ((filter === 'all' || filter === 'manga') && metadataLoading) ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-28 bg-white/[0.02] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : hasAnyHistory ? (
          nothingToShow ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {term ? uiI18n.t('app.no_history_matches_i18n_value_0_526a8e4d', { value0: search }) : uiI18n.t('app.nothing_in_this_filter_592d07b9')}
            </div>
          ) : (
          <div className="space-y-10">
            {showAnime && (
              <section>
                <div className="mb-4 flex items-center gap-2 px-2">
                  <Play className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">{uiI18n.t('app.anime_watching_e412abdf')}</h3>
                </div>

                <div className="space-y-4">
                  {(() => {
                    const groupedHistory: Record<string, any[]> = {};
                    animeFiltered.forEach((item: any) => {
                      if (!groupedHistory[item.anime_id]) groupedHistory[item.anime_id] = [];
                      groupedHistory[item.anime_id].push(item);
                    });

                    return Object.entries(groupedHistory)
                      .sort(([, a], [, b]) => new Date(b[0].watched_at).getTime() - new Date(a[0].watched_at).getTime())
                      .map(([animeId, episodes], index) => (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          key={animeId}
                          className="bg-white/[0.02] rounded-2xl border border-white/[0.05] overflow-hidden shadow-lg"
                        >
                          <div className="flex gap-5 p-5 items-center border-b border-white/[0.05] bg-white/[0.01]">
                            <div className="w-14 h-20 rounded-xl overflow-hidden flex-shrink-0 shadow-inner">
                              <img
                                src={getProxiedImageUrl(episodes[0].anime_poster || '/placeholder.svg')}
                                alt={episodes[0].anime_name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-lg line-clamp-1 mb-1">{episodes[0].anime_name}</h3>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {episodes.length} {uiI18n.t('app.episodes_watched_7ff033df')}
                              </p>
                            </div>
                          </div>
                          <div className="divide-y divide-white/[0.05]">
                            {episodes
                              .sort(compareWatchHistory)
                              .map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-4 p-4 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                                  role={isTV() ? "button" : undefined}
                                  tabIndex={isTV() ? -1 : undefined}
                                  data-tv-focus={isTV() || undefined}
                                  data-tv-key={isTV() ? `profile-history-${item.id}` : undefined}
                                  onClick={() => onNavigate(`/watch/${encodeURIComponent(item.episode_id)}`)}
                                >
                                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-sm shadow-inner">
                                    {item.episode_number}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm font-bold">{uiI18n.t('app.episode_8669aa56')} {item.episode_number}</span>
                                      <span className="text-xs text-muted-foreground/50">•</span>
                                      <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {formatDate(item.watched_at)}
                                      </span>
                                    </div>
                                    {item.duration_seconds && (
                                      <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-primary"
                                          style={{ width: `${Math.min(100, ((item.progress_seconds || 0) / item.duration_seconds) * 100)}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                  <Play className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                              ))}
                          </div>
                        </motion.div>
                      ));
                  })()}
                </div>
              </section>
            )}
            {readingSections.map(section => (
              <section key={section.key}>
                <div className="mb-4 flex items-center gap-2 px-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">{section.label}</h3>
                </div>

                <div className="space-y-3">
                  {section.rows.map((item: any, index: number) => {
                    const status = MANGA_STATUS_LABELS[item.status || 'plan_to_read'] || MANGA_STATUS_LABELS.plan_to_read;
                    const chapterLabel =
                      item.last_chapter_number != null
                        ? uiI18n.t('app.chapter_i18n_value_0_e0f6e591', { value0: item.last_chapter_number })
                        : item.last_chapter_title || uiI18n.t('app.reading_progress_updated_a6460dcf');

                    return (
                      <motion.button
                        key={`${section.key}-history-${item.id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="w-full text-left rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors shadow-lg group"
                        onClick={() => onNavigate(readingHistoryHref(item))}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-16 rounded-xl overflow-hidden bg-white/[0.02] flex-shrink-0 shadow-inner">
                            <img
                              src={getProxiedImageUrl(item.manga_poster || '/placeholder.svg')}
                              alt={item.manga_title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              loading="lazy"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-bold line-clamp-1 group-hover:text-primary transition-colors">{item.manga_title}</p>
                              <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${status.bg} ${status.color}`}>
                                {status.label}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-muted-foreground mt-0.5 line-clamp-1">{chapterLabel}</p>
                            <p className="text-[10px] font-semibold text-muted-foreground/50 mt-1.5 uppercase tracking-widest">
                              {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                            </p>
                          </div>
                          <BookOpen className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          )
        ) : (
          <div className="text-center py-20 border border-dashed border-white/10 bg-white/[0.01] rounded-[2rem]">
            <History className="w-16 h-16 mx-auto text-muted-foreground/30 mb-6" />
            <h3 className="text-xl font-bold mb-2">{uiI18n.t('app.no_activity_history_4458aa8c')}</h3>
            <p className="text-muted-foreground mb-8">{isViewingOther ? uiI18n.t('app.this_user_has_no_watch_or_manga_activity_yet_2260bce7') : uiI18n.t('app.your_anime_and_manga_activity_will_appear_here_cbd9c0d4')}</p>
            {!isViewingOther && (
              <Button onClick={() => onNavigate('/')} className="rounded-full h-12 px-8 font-bold">
                {uiI18n.t('app.start_watching_e408bda7')}
              </Button>
            )}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

