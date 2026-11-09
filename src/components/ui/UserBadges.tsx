import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { forwardRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Input } from './input';
import { BadgeInfoCard, BadgeInfoDialog } from './BadgeInfo';
import { RARITY_STYLES, pickFeaturedBadge, type BadgeDef, type BadgeMetricKey } from '@/lib/badges';
import { widgetThemeFromElement } from '@/lib/widgetTheme';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

export interface UserBadgesProps {
  badges: BadgeDef[] | undefined;
  size?: number;
  max?: number;
  className?: string;
  featuredKey?: string | null;
  userStats?: Partial<Record<BadgeMetricKey, number>>;
  interactive?: boolean;
  layout?: 'row' | 'grid';
  appearance?: 'coin' | 'plain';
  showLabels?: boolean;
}
interface BadgeShellProps extends HTMLAttributes<HTMLElement> {
  interactive: boolean;
  label: string;
  children: ReactNode;
}
const BadgeShell = forwardRef<HTMLElement, BadgeShellProps>(function BadgeShell({ interactive, label, children, ...props }, ref) {
  return interactive
    ? <button {...props} ref={ref as Ref<HTMLButtonElement>} type="button" aria-label={label}>{children}</button>
    : <span {...props} ref={ref as Ref<HTMLSpanElement>} role="img" aria-label={label}>{children}</span>;
});

/** Shared interaction and information for every badge presentation. */
export function UserBadges({ badges, size = 18, max = 4, className, featuredKey, userStats, interactive = true, layout = 'row', appearance = 'coin', showLabels = false }: UserBadgesProps) {
  useUiTranslation();
  const [selectedBadge, setSelectedBadge] = useState<BadgeDef | null>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [surface, setSurface] = useState<CSSProperties>();
  if (!badges?.length) return null;
  const featured = featuredKey ?? pickFeaturedBadge(badges);
  const ordered = [...badges].sort((a, b) => Number(b.key === featured) - Number(a.key === featured));
  const limit = Math.max(0, Math.floor(max));
  const shown = ordered.slice(0, limit);
  const remaining = ordered.slice(limit);
  const capture = (element: Element) => setSurface(widgetThemeFromElement(element));
  const openBadge = (badge: BadgeDef) => { void triggerHaptic('tap'); setSelectedBadge(badge); };

  return <TooltipProvider delayDuration={80}>
    <div role="group" aria-label={uiI18n.t('app.user_badges_79033086')} className={cn(layout === 'grid' ? 'grid max-w-full grid-cols-3 gap-3' : 'inline-flex max-w-full flex-wrap items-center gap-1.5 align-middle', className)}>
      {shown.map(badge => {
        const isFeatured = badge.key === featured;
        const iconSize = isFeatured && layout === 'row' ? size * 1.25 : size;
        const diameter = iconSize + (appearance === 'coin' ? 10 : 4);
        return <Tooltip key={badge.key}>
          <TooltipTrigger asChild>
            <BadgeShell interactive={interactive} label={badge.label}
              onPointerEnter={event => capture(event.currentTarget)} onFocus={event => capture(event.currentTarget)}
              onClick={interactive ? event => { event.preventDefault(); event.stopPropagation(); capture(event.currentTarget); openBadge(badge); } : undefined}
              className={cn('relative inline-flex shrink-0 items-center justify-center text-inherit outline-none focus-visible:ring-2 focus-visible:ring-ring',
                layout === 'grid' ? 'min-w-0 flex-col gap-2 rounded-xl border border-border/40 px-2 py-3 text-center transition-colors hover:bg-muted/25' : 'rounded-full',
                appearance === 'coin' && layout === 'row' && 'border border-border bg-background/55',
                isFeatured && appearance === 'coin' && 'ring-1 ring-ring/50')}
              style={layout === 'grid' ? undefined : { width: diameter, height: diameter }}>
              <img src={badge.image} alt="" loading="lazy" className="shrink-0 object-contain" style={{ width: iconSize, height: iconSize }} />
              {(showLabels || layout === 'grid') && <span className="line-clamp-2 text-xs font-medium leading-tight">{badge.label}</span>}
            </BadgeShell>
          </TooltipTrigger>
          <TooltipContent style={surface} side="top" align="center" sideOffset={10} className="badge-widget-tooltip w-72 max-w-[calc(100vw-2rem)] rounded-xl border-border bg-popover p-0 text-popover-foreground shadow-lg">
            <BadgeInfoCard badge={badge} userStats={userStats} featured={isFeatured} />
            {interactive && <p className="px-4 pb-3 text-xs text-muted-foreground">{uiI18n.t('badgeUi.openDetails')}</p>}
          </TooltipContent>
        </Tooltip>;
      })}
      {remaining.length > 0 && (interactive ? <Popover open={collectionOpen} onOpenChange={open => { setCollectionOpen(open); if (!open) setSearch(''); }}>
        <PopoverTrigger asChild><button type="button" onPointerEnter={event => capture(event.currentTarget)} onFocus={event => capture(event.currentTarget)} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-border bg-background/70 px-2 text-xs font-medium" aria-label={uiI18n.t('badgeUi.viewCollection', { count: badges.length })}>+{remaining.length}</button></PopoverTrigger>
        <PopoverContent data-badge-collection style={surface} align="start" sideOffset={12} className="z-[150] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border-border bg-popover p-0 text-popover-foreground">
          <div className="flex items-center gap-3 border-b border-border p-4"><div className="flex-1"><h3 className="text-sm font-medium">{uiI18n.t('badgeUi.collection')}</h3><p className="mt-1 text-xs text-muted-foreground">{uiI18n.t('badgeUi.collectionCount', { count: badges.length })}</p></div><button type="button" className="flex size-8 items-center justify-center rounded-lg hover:bg-muted" aria-label={uiI18n.t('app.close_badge_details_d410b5b2')} onClick={() => setCollectionOpen(false)}><X className="size-4" /></button></div>
          <div className="p-3"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder={uiI18n.t('badgeUi.search')} aria-label={uiI18n.t('badgeUi.search')} /></div>
          <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto px-3 pb-3">{ordered.filter(badge => `${badge.label} ${badge.rarity}`.toLowerCase().includes(search.toLowerCase())).map(badge => <button key={badge.key} type="button" className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-border bg-background/40 p-3 text-center hover:bg-muted" onClick={() => { setCollectionOpen(false); openBadge(badge); }}><img src={badge.image} alt="" className="size-10 object-contain" /><span className="line-clamp-2 text-xs font-medium">{badge.label}</span><span className="text-xs text-muted-foreground">{RARITY_STYLES[badge.rarity].label}</span></button>)}
            {!ordered.some(badge => `${badge.label} ${badge.rarity}`.toLowerCase().includes(search.toLowerCase())) && <p className="col-span-3 py-5 text-center text-sm text-muted-foreground">{uiI18n.t('badgeUi.noMatches')}</p>}
          </div>
        </PopoverContent>
      </Popover> : <Tooltip><TooltipTrigger asChild><span role="img" aria-label={uiI18n.t('badgeUi.viewCollection', { count: badges.length })} className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-full border border-border px-1.5 text-xs">+{remaining.length}</span></TooltipTrigger><TooltipContent style={surface} className="max-w-64 bg-popover text-popover-foreground"><p className="text-xs">{remaining.map(badge => badge.label).join(' · ')}</p></TooltipContent></Tooltip>)}
    </div>
    <BadgeInfoDialog badge={selectedBadge} style={surface} userStats={userStats} featured={selectedBadge?.key === featured} onClose={() => setSelectedBadge(null)} />
  </TooltipProvider>;
}
