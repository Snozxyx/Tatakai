import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { History, Play, BookOpen, Clock, Search, LayoutGrid } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { MANGA_STATUS_LABELS, TAB_PANEL_CLASS } from './statusLabels';

interface HistoryTabProps {
  history: any[];
  mangaHistoryEntries: any[];
  loading?: boolean;
  isViewingOther?: boolean;
  onNavigate: (path: string) => void;
  formatDate: (dateString: string) => string;
}

type HistoryFilter = 'all' | 'anime' | 'manga';

const FILTERS: { key: HistoryFilter; label: string; icon: typeof Play }[] = [
  { key: 'all', label: 'All', icon: LayoutGrid },
  { key: 'anime', label: 'Anime', icon: Play },
  { key: 'manga', label: 'Manga', icon: BookOpen },
];

export function HistoryTab({ history, mangaHistoryEntries, loading, isViewingOther, onNavigate, formatDate }: HistoryTabProps) {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();

  const hasAnyAnime = (history?.length || 0) > 0;
  const hasAnyManga = mangaHistoryEntries.length > 0;

  const animeFiltered = useMemo(
    () => (history || []).filter((i: any) => !term || (i.anime_name || '').toLowerCase().includes(term)),
    [history, term],
  );
  const mangaFiltered = useMemo(
    () => mangaHistoryEntries.filter((i: any) => !term || (i.manga_title || '').toLowerCase().includes(term)),
    [mangaHistoryEntries, term],
  );

  const showAnime = filter !== 'manga' && animeFiltered.length > 0;
  const showManga = filter !== 'anime' && mangaFiltered.length > 0;
  const nothingToShow = (hasAnyAnime || hasAnyManga) && !showAnime && !showManga;
  return (
    <GlassPanel className={TAB_PANEL_CLASS}>
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">Activity History</h3>
          </div>

          {(hasAnyAnime || hasAnyManga) && (
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
                  placeholder="Search history…"
                  className="pl-9 rounded-full bg-white/[0.03] border-white/[0.08] h-10"
                />
              </div>
            </div>
          )}
        </div>
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-28 bg-white/[0.02] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : hasAnyAnime || hasAnyManga ? (
          nothingToShow ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {term ? `No history matches “${search}”.` : 'Nothing in this filter.'}
            </div>
          ) : (
          <div className="space-y-10">
            {showAnime && (
              <section>
                <div className="mb-4 flex items-center gap-2 px-2">
                  <Play className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Anime Watching</h3>
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
                                {episodes.length} episodes watched
                              </p>
                            </div>
                          </div>
                          <div className="divide-y divide-white/[0.05]">
                            {episodes
                              .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime())
                              .map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-4 p-4 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                                  onClick={() => onNavigate(`/watch/${encodeURIComponent(item.episode_id)}`)}
                                >
                                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-sm shadow-inner">
                                    {item.episode_number}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm font-bold">Episode {item.episode_number}</span>
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
            {showManga && (
              <section>
                <div className="mb-4 flex items-center gap-2 px-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Manga Reading</h3>
                </div>

                <div className="space-y-3">
                  {mangaFiltered.map((item: any, index: number) => {
                    const status = MANGA_STATUS_LABELS[item.status || 'plan_to_read'] || MANGA_STATUS_LABELS.plan_to_read;
                    const chapterLabel =
                      item.last_chapter_number != null
                        ? `Chapter ${item.last_chapter_number}`
                        : item.last_chapter_title || 'Reading progress updated';
                    const chapterKey = String(item.last_chapter_key || '').trim();
                    const nextPage = Math.max(0, Number(item.last_page_index || 0));

                    return (
                      <motion.button
                        key={`manga-history-${item.id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="w-full text-left rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors shadow-lg group"
                        onClick={() => {
                          if (chapterKey) {
                            onNavigate(`/manga/read/${item.manga_id}?chapterKey=${encodeURIComponent(chapterKey)}&page=${nextPage}`);
                            return;
                          }
                          onNavigate(`/manga/${item.manga_id}`);
                        }}
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
            )}
          </div>
          )
        ) : (
          <div className="text-center py-20 border border-dashed border-white/10 bg-white/[0.01] rounded-[2rem]">
            <History className="w-16 h-16 mx-auto text-muted-foreground/30 mb-6" />
            <h3 className="text-xl font-bold mb-2">No activity history</h3>
            <p className="text-muted-foreground mb-8">{isViewingOther ? 'This user has no watch or manga activity yet.' : 'Your anime and manga activity will appear here.'}</p>
            {!isViewingOther && (
              <Button onClick={() => onNavigate('/')} className="rounded-full h-12 px-8 font-bold">
                Start Watching
              </Button>
            )}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

