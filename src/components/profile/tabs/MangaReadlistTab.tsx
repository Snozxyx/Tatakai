import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, BookMarked, ArrowRight, Layers, Search } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { MANGA_STATUS_LABELS, STATUS_ACCENT, TAB_PANEL_CLASS } from './statusLabels';
import { ProfileShelf } from './shelf/ProfileShelf';
import { useShelfSearch } from './shelf/useShelfSearch';

interface MangaReadlistTabProps {
  mangaReadlist: any[];
  loading?: boolean;
  isViewingOther?: boolean;
  onNavigate: (path: string) => void;
}

const STATUS_ORDER = ['reading', 'completed', 'plan_to_read', 'on_hold', 'dropped'];
const SHELF_GRID = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4';
const DIALOG_GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

export function MangaReadlistTab({ mangaReadlist, loading, isViewingOther, onNavigate }: MangaReadlistTabProps) {
  const items = useMemo(() => mangaReadlist || [], [mangaReadlist]);
  const { search, setSearch, term, groups, matchCount } = useShelfSearch<any>(
    items,
    STATUS_ORDER,
    (i) => i.status,
    (i) => i.manga_title,
    'plan_to_read',
  );

  const renderCard = (item: any, index: number) => {
    const statusKey = item.status || 'plan_to_read';
    const status = MANGA_STATUS_LABELS[statusKey] || MANGA_STATUS_LABELS.plan_to_read;
    const accent = STATUS_ACCENT[statusKey] || STATUS_ACCENT.plan_to_read;
    const hasChapter = item.last_chapter_number != null;
    const chapterLabel = hasChapter
      ? `Chapter ${item.last_chapter_number}`
      : item.last_chapter_title || 'Not started';
    const pageLabel = hasChapter ? `Page ${(Number(item.last_page_index) || 0) + 1}` : null;

    return (
      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.04, 0.4), type: 'spring', stiffness: 260, damping: 24 }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.985 }}
        onClick={() => onNavigate(`/manga/${item.manga_id}`)}
        className="group relative flex gap-4 p-4 w-full text-left rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-white/[0.01] overflow-hidden shadow-lg transition-colors duration-300 hover:border-white/20 hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]"
      >
        {/* status-tinted ambient glow */}
        <div
          className={cn(
            'absolute -left-10 -top-10 w-28 h-28 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500',
            accent.glow,
          )}
        />
        {/* left status accent rail */}
        <div className={cn('absolute left-0 top-0 h-full w-[3px]', accent.dot, 'opacity-60')} />

        {/* poster */}
        <div
          className={cn(
            'relative w-[76px] h-[112px] shrink-0 rounded-xl overflow-hidden bg-white/[0.03] ring-1 ring-white/10 shadow-xl transition-all duration-300',
            accent.ring,
          )}
        >
          <img
            src={getProxiedImageUrl(item.manga_poster || '/placeholder.svg')}
            alt={item.manga_title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-70" />
          <BookMarked className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 text-white/70 drop-shadow" />
        </div>

        {/* info */}
        <div className="relative flex-1 min-w-0 flex flex-col py-0.5">
          {/* status pill */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={cn('relative flex h-2 w-2', statusKey === 'reading' && 'animate-pulse')}>
              <span className={cn('inline-flex h-2 w-2 rounded-full', accent.dot)} />
            </span>
            <span className={cn('text-[10px] font-black uppercase tracking-widest', accent.text)}>
              {status.label}
            </span>
          </div>

          <h3 className="font-bold text-[15px] leading-snug line-clamp-2 text-foreground/95 group-hover:text-primary transition-colors">
            {item.manga_title}
          </h3>

          <div className="mt-auto pt-3 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] border border-white/[0.06] px-2 py-1">
                <Layers className="w-3 h-3 text-muted-foreground/70" />
                <span className="text-[11px] font-semibold text-foreground/80 truncate">{chapterLabel}</span>
              </div>
              {pageLabel && (
                <p className="text-[10px] font-semibold text-muted-foreground/50 mt-1.5 uppercase tracking-widest pl-0.5">
                  {pageLabel}
                </p>
              )}
            </div>

            {/* continue affordance — slides in on hover */}
            <span className="flex items-center gap-1 text-[11px] font-bold text-primary opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 shrink-0">
              {hasChapter ? 'Continue' : 'Read'}
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>

          {/* hover accent underline */}
          <div className="mt-2.5 h-[2px] w-0 group-hover:w-full rounded-full bg-gradient-to-r from-[hsl(var(--profile-accent))] to-transparent transition-all duration-500" />
        </div>
      </motion.button>
    );
  };

  return (
    <GlassPanel className={TAB_PANEL_CLASS}>
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
              {isViewingOther ? 'Manga Readlist' : 'My Manga Readlist'}
            </h3>
            <span className="px-3 py-1 rounded-full bg-white/[0.03] text-xs font-semibold text-muted-foreground border border-white/[0.05]">
              {items.length} items
            </span>
          </div>
          {items.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search readlist…"
                className="pl-9 rounded-full bg-white/[0.03] border-white/[0.08] h-10"
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className={SHELF_GRID}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-36 bg-white/[0.02] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-white/10 bg-white/[0.01] rounded-[2rem]">
            <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/30 mb-6" />
            <h3 className="text-xl font-bold mb-2">{isViewingOther ? 'Readlist is empty' : 'Your manga readlist is empty'}</h3>
            <p className="text-muted-foreground mb-8">
              {isViewingOther ? 'This user has not saved any manga yet.' : 'Save manga to your readlist from any manga details page.'}
            </p>
            {!isViewingOther && (
              <Button onClick={() => onNavigate('/search')} className="rounded-full h-12 px-8 font-bold">
                Browse Manga
              </Button>
            )}
          </div>
        ) : term && matchCount === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">No manga match “{search}”.</div>
        ) : (
          <div className="space-y-10">
            {groups.map((g) => (
              <ProfileShelf
                key={g.status}
                status={g.status}
                label={MANGA_STATUS_LABELS[g.status]?.label || g.status}
                items={g.items}
                getKey={(i) => i.id}
                getTitle={(i) => i.manga_title}
                renderCard={renderCard}
                shelfGridClass={SHELF_GRID}
                dialogGridClass={DIALOG_GRID}
              />
            ))}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
