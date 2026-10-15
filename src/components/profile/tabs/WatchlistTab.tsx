import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { List, Search } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getProxiedImageUrl } from '@/lib/api';
import { STATUS_LABELS, TAB_PANEL_CLASS } from './statusLabels';
import { ProfileShelf } from './shelf/ProfileShelf';
import { useShelfSearch } from './shelf/useShelfSearch';

interface WatchlistTabProps {
  watchlist: any[];
  loading?: boolean;
  isViewingOther?: boolean;
  onNavigate: (path: string) => void;
}

const STATUS_ORDER = ['watching', 'completed', 'plan_to_watch', 'on_hold', 'dropped'];
const SHELF_GRID = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5';
const DIALOG_GRID = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5';

export function WatchlistTab({ watchlist, loading, isViewingOther, onNavigate }: WatchlistTabProps) {
  useUiTranslation();
  const items = useMemo(() => watchlist || [], [watchlist]);
  const { search, setSearch, term, groups, matchCount } = useShelfSearch<any>(
    items,
    STATUS_ORDER,
    (i) => i.status,
    (i) => i.anime_name,
    'plan_to_watch',
  );

  const renderCard = (item: any) => {
    const statusKey = String(item?.status || 'plan_to_watch').trim().toLowerCase();
    const statusInfo = STATUS_LABELS[statusKey] ?? STATUS_LABELS.plan_to_watch;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="group cursor-pointer relative"
        onClick={() => onNavigate(`/anime/${item.anime_id}`)}
      >
        <div className="relative aspect-[3/4] rounded-2xl overflow-hidden mb-3 shadow-xl group-hover:shadow-primary/20 transition-all duration-300 ring-1 ring-white/10 group-hover:ring-primary/50">
          <img
            src={getProxiedImageUrl(item.anime_poster || '/placeholder.svg')}
            alt={item.anime_name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className={`absolute top-2 left-2 px-2 py-1.5 rounded-lg backdrop-blur-xl flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${statusInfo?.bg} ${statusInfo?.color} border border-white/10 shadow-lg`}>
            {statusInfo?.icon}
            {statusInfo?.label}
          </div>
        </div>
        <h3 className="font-bold text-sm line-clamp-1 group-hover:text-primary transition-colors px-1">
          {item.anime_name}
        </h3>
      </motion.div>
    );
  };

  return (
    <GlassPanel className={TAB_PANEL_CLASS}>
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <List className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
              {isViewingOther ? uiI18n.t('app.watchlist_48a616d9') : uiI18n.t('app.my_watchlist_73953be6')}
            </h3>
            <span className="px-3 py-1 rounded-full bg-white/[0.03] text-xs font-semibold text-muted-foreground border border-white/[0.05]">
              {items.length} {uiI18n.t('app.items_7316c8b2')}
            </span>
          </div>
          {items.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={uiI18n.t('app.search_watchlist_d550ae5d')}
                className="pl-9 rounded-full bg-white/[0.03] border-white/[0.08] h-10"
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className={SHELF_GRID}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-white/[0.02] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-white/10 bg-white/[0.01] rounded-[2rem]">
            <List className="w-16 h-16 mx-auto text-muted-foreground/30 mb-6" />
            <h3 className="text-xl font-bold mb-2">{isViewingOther ? uiI18n.t('app.watchlist_is_empty_4fd3c75a') : uiI18n.t('app.your_watchlist_is_empty_97f5dadd')}</h3>
            <p className="text-muted-foreground mb-8">{isViewingOther ? uiI18n.t('app.this_user_hasn_t_added_any_anime_yet_17c1ce14') : uiI18n.t('app.start_adding_anime_to_track_your_progress_10d3ef55')}</p>
            {!isViewingOther && (
              <Button onClick={() => onNavigate('/')} className="rounded-full h-12 px-8 font-bold">
                {uiI18n.t('app.browse_anime_c2cad772')}
              </Button>
            )}
          </div>
        ) : term && matchCount === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">{uiI18n.t('app.no_anime_match_19b2b03a')}{search}”.</div>
        ) : (
          <div className="space-y-10">
            {groups.map((g) => (
              <ProfileShelf
                key={g.status}
                status={g.status}
                label={STATUS_LABELS[g.status]?.label || g.status}
                items={g.items}
                getKey={(i) => i.id}
                getTitle={(i) => i.anime_name}
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
