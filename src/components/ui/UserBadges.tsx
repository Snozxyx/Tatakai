import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import React, { useState } from 'react';
import { X, Sparkles, ShieldCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { RARITY_STYLES, type BadgeDef, type BadgeMetricKey, currentTier, pickFeaturedBadge } from '@/lib/badges';

interface UserBadgesProps {
  badges: BadgeDef[] | undefined;
  /** Icon size in px. Defaults to 18. */
  size?: number;
  /** Cap how many are shown; a "+N" chip covers the rest. Defaults to four; pass an explicit count for larger showcases. */
  max?: number;
  className?: string;
  /**
   * Optional: the key of the user's featured badge (profiles.featured_badge_key).
   * When provided, that badge is rendered slightly larger with a refined double ring.
   */
  featuredKey?: string | null;
  /**
   * Optional: live user stats for computing badge tiers (episodes, comments, etc.).
   * When provided, the tooltip shows the current tier + progress to next.
   */
  userStats?: Partial<Record<BadgeMetricKey, number>>;
  /**
   * Render badges as buttons (opens the detail dialog) or as static spans.
   * Set to false when nested inside another interactive element (e.g. a
   * profile card button) — nested <button>s are invalid HTML and React warns
   * about them. Tooltips still work on hover.
   */
  interactive?: boolean;
}

/**
 * Badge click target that degrades to a static span when nested inside another
 * interactive element (no nested <button>s).
 */
interface BadgeShellProps extends React.HTMLAttributes<HTMLElement> {
  interactive: boolean; onOpen: () => void; label: string; children: React.ReactNode;
}
const BadgeShell = React.forwardRef<HTMLElement, BadgeShellProps>(function BadgeShell({ interactive, onOpen, className, style, label, children, onClick, ...props }, ref) {
  if (interactive) return <button {...props} ref={ref as React.Ref<HTMLButtonElement>} type="button" className={className} style={style} aria-label={label} onClick={event => { onClick?.(event); if (!event.defaultPrevented) onOpen(); }}>{children}</button>;
  return <span {...props} ref={ref as React.Ref<HTMLSpanElement>} role="img" aria-label={label} className={className} style={style}>{children}</span>;
});

/**
 * Premium static badge row — no pulsing / spinning / shimmer.
 * Luxury coin look: deep matte base, fine 1px rarity ring, top gloss,
 * soft static shadow. Featured badge gets a slightly larger coin +
 * refined double ring, no animation.
 */
export function UserBadges({
  badges,
  size = 18,
  max = 4,
  className,
  featuredKey,
  userStats,
  interactive = true,
}: UserBadgesProps) {
  useUiTranslation();
  const [selectedBadge, setSelectedBadge] = useState<BadgeDef | null>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [badgeSearch, setBadgeSearch] = useState('');
  if (!badges || badges.length === 0) return null;

  // A showcase badge is always present, even before the optional profile field
  // has been backfilled. The profile value wins once the migration is applied.
  const effectiveFeaturedKey = featuredKey ?? pickFeaturedBadge(badges);
  const ordered = [...badges].sort((a,b) => Number(b.key === effectiveFeaturedKey)-Number(a.key === effectiveFeaturedKey));
  const limit = typeof max === 'number' ? Math.max(0,Math.floor(max)) : ordered.length;
  const shown = ordered.slice(0,limit);
  const remaining = ordered.slice(limit);
  const overflow = remaining.length;

  return (
    <TooltipProvider delayDuration={100}>
      <div
        className={cn('inline-flex max-w-full flex-wrap items-center gap-1.5 align-middle select-none', className)}
        role="group"
        aria-label={uiI18n.t('app.user_badges_79033086')}
      >
        {shown.map((badge) => {
          const rarity = RARITY_STYLES[badge.rarity];
          const isFeatured = effectiveFeaturedKey === badge.key;
          const containerSize = isFeatured ? size * 1.25 + 10 : size + 10;
          const imgSize = isFeatured ? size * 1.25 : size;

          // Compute tier if available
          const tier = userStats && badge.tiers ? currentTier(badge, userStats) : -1;
          const tierData = tier >= 0 && badge.tiers ? badge.tiers[tier] : null;
          const nextTier = tier >= 0 && badge.tiers && tier < badge.tiers.length - 1 ? badge.tiers[tier + 1] : null;

          return (
            <Tooltip key={badge.key}>
              <TooltipTrigger asChild>
                <BadgeShell
                  interactive={interactive}
                  onOpen={() => { void triggerHaptic('tap'); setSelectedBadge(badge); }}
                  className={cn(
                    'group/badge relative inline-flex items-center justify-center rounded-full shrink-0 outline-none',
                    'bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.02)_38%,rgba(0,0,0,0.55)_100%)]',
                    'ring-1 shadow-[0_1px_2px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.10)]',
                    'transition-transform duration-150 hover:scale-[1.06] focus-visible:ring-2 focus-visible:ring-white/30',
                    rarity.ring,
                    rarity.glow,
                    isFeatured && 'ring-[1.5px] shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_4px_16px_-4px_rgba(0,0,0,0.7)]'
                  )}
                  style={{ width: containerSize, height: containerSize }}
                  label={uiI18n.t('app.i18n_value_0_badge_i18n_value_1_i18n_value_2_f4c1fb3e', { value0: badge.label, value1: rarity.label, value2: tierData ? ` - ${tierData.name}` : '' })}
                >
                  {/* Top gloss — static premium highlight */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_46%)]"
                  />
                  {/* Fine inner hairline */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-[3px] rounded-full border border-border"
                  />
                  <img
                    src={badge.image}
                    alt=""
                    loading="lazy"
                    style={{ width: imgSize, height: imgSize }}
                    className="relative z-[1] object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] transition-transform duration-150 group-hover/badge:scale-[1.04]"
                  />
                  {isFeatured && (
                    <span
                      className="absolute -top-0.5 -right-0.5 z-[2] h-2 w-2 rounded-full bg-gradient-to-b from-white to-white/60 ring-2 ring-black/80"
                      aria-hidden="true"
                    />
                  )}
                </BadgeShell>
              </TooltipTrigger>

              <TooltipContent side="top" align="center" sideOffset={10} className="w-72 max-w-[calc(100vw-2rem)] rounded-2xl border-border bg-popover p-0 text-popover-foreground shadow-xl">
                <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-20 opacity-40" style={{ background:rarity.ambient }} aria-hidden="true" />
                  <div className="relative flex items-center gap-3"><div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-background/70"><img src={badge.image} alt="" className="size-10 object-contain" /></div><div className="min-w-0"><p className="text-sm font-bold leading-tight">{badge.label}</p><div className="mt-2 flex flex-wrap gap-1"><Badge variant="secondary" className="text-[10px]">{rarity.label}</Badge><Badge variant="outline" className="gap-1 text-[10px]"><ShieldCheck className="size-3" />{uiI18n.t('badgeUi.earned')}</Badge></div></div></div>
                  <p className="relative text-xs leading-relaxed text-muted-foreground">{badge.description}</p>
                  {tierData && badge.tiers && badge.tiers.length > 1 && <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3"><div className="flex justify-between gap-2 text-xs"><strong>{tierData.name}</strong><span className="text-muted-foreground">{tier+1}/{badge.tiers.length}</span></div>{nextTier && badge.metricKey && userStats?.[badge.metricKey] != null && <><div className="flex justify-between gap-2 text-[10px] text-muted-foreground"><span>{nextTier.name}</span><span className="tabular-nums">{userStats[badge.metricKey]}/{nextTier.threshold}</span></div><Progress value={Math.max(0,Math.min(100,((userStats[badge.metricKey]!-tierData.threshold)/(nextTier.threshold-tierData.threshold))*100))} className="h-1.5" /></>}</div>}
                  {badge.rule && <div className="relative border-t border-border pt-3"><p className="mb-1 text-[10px] font-bold uppercase tracking-wider">{uiI18n.t('app.how_to_earn_a737a7d0')}</p><p className="text-xs leading-relaxed text-muted-foreground">{badge.rule}</p></div>}
                  {isFeatured && <p className="flex items-center gap-1.5 text-[10px] font-semibold"><Sparkles className="size-3" />{uiI18n.t('app.featured_badge_5a25680b')}</p>}
                  {interactive && <p className="text-[10px] text-muted-foreground">{uiI18n.t('badgeUi.openDetails')}</p>}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {overflow > 0 && (interactive ? <Popover open={collectionOpen} onOpenChange={open => { setCollectionOpen(open); if (!open) setBadgeSearch(''); }}>
          <PopoverTrigger asChild><button type="button" className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background/70 px-2 text-[11px] font-bold text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-label={uiI18n.t('badgeUi.viewCollection',{count:badges.length})}>+{overflow}</button></PopoverTrigger>
          <PopoverContent side="bottom" align="start" sideOffset={12} className="w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-border bg-popover p-0 text-popover-foreground shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-border p-4"><div><h3 className="text-sm font-bold">{uiI18n.t('badgeUi.collection')}</h3><p className="mt-1 text-xs text-muted-foreground">{uiI18n.t('badgeUi.collectionCount',{count:badges.length})}</p></div><button type="button" aria-label={uiI18n.t('app.close_badge_details_d410b5b2')} onClick={() => setCollectionOpen(false)} className="flex size-8 items-center justify-center rounded-full hover:bg-accent"><X className="size-4" /></button></div>
            <div className="p-3"><Input value={badgeSearch} onChange={event => setBadgeSearch(event.target.value)} placeholder={uiI18n.t('badgeUi.search')} aria-label={uiI18n.t('badgeUi.search')} /></div>
            <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto px-3 pb-3">{ordered.filter(badge => `${badge.label} ${badge.rarity}`.toLowerCase().includes(badgeSearch.toLowerCase())).map(badge => <button key={badge.key} type="button" onClick={() => {setCollectionOpen(false);setSelectedBadge(badge);}} className="relative flex min-w-0 flex-col items-center gap-2 rounded-xl border border-border bg-background/40 px-2 py-3 text-center hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><img src={badge.image} alt="" className="size-10 object-contain" /><span className="line-clamp-2 text-[11px] font-semibold leading-tight">{badge.label}</span><span className="text-[9px] capitalize text-muted-foreground">{badge.rarity}</span>{badge.key === effectiveFeaturedKey && <Sparkles className="absolute right-2 top-2 size-3 text-primary" aria-label={uiI18n.t('app.featured_badge_5a25680b')} />}</button>)}{!ordered.some(badge => `${badge.label} ${badge.rarity}`.toLowerCase().includes(badgeSearch.toLowerCase())) && <p className="col-span-3 p-4 text-center text-xs text-muted-foreground">{uiI18n.t('badgeUi.noMatches')}</p>}</div>
          </PopoverContent>
        </Popover> : <Tooltip><TooltipTrigger asChild><span role="img" aria-label={uiI18n.t('badgeUi.viewCollection',{count:badges.length})} className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-full border border-border bg-background/70 px-1.5 text-[10px] font-bold">+{overflow}</span></TooltipTrigger><TooltipContent className="max-w-64 rounded-xl border-border bg-popover text-popover-foreground"><p className="font-semibold">{uiI18n.t('badgeUi.collection')}</p><p className="mt-1 text-xs">{remaining.map(b => b.label).join(' · ')}</p></TooltipContent></Tooltip>)}
      </div>

      <Dialog open={!!selectedBadge} onOpenChange={(open) => { if (!open) { void triggerHaptic('tap'); setSelectedBadge(null); } }}>
        {selectedBadge && (() => {
          const rarity = RARITY_STYLES[selectedBadge.rarity];
          const computedTier = userStats && selectedBadge.tiers ? currentTier(selectedBadge, userStats) : -1;
          const tier = selectedBadge.tiers ? Math.max(0, computedTier) : -1;
          const tierData = tier >= 0 ? selectedBadge.tiers?.[tier] : null;
          const nextTier = tier >= 0 && selectedBadge.tiers && tier < selectedBadge.tiers.length - 1
            ? selectedBadge.tiers[tier + 1]
            : null;
          const metricValue = selectedBadge.metricKey ? userStats?.[selectedBadge.metricKey] : undefined;
          const progress = tierData && nextTier && metricValue != null
            ? Math.min(100, Math.max(0, ((metricValue - tierData.threshold) / (nextTier.threshold - tierData.threshold)) * 100))
            : 100;

          return (
            <DialogContent className={cn('max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto rounded-3xl border-border bg-popover text-popover-foreground p-0 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl custom-scrollbar', '[&>button]:hidden')}>
              <div className="relative overflow-hidden rounded-3xl bg-popover">
                <span aria-hidden className="pointer-events-none absolute -inset-12 opacity-30 blur-3xl" style={{ background: rarity.ambient }} />
                <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 z-20 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                {/* Single refined close. The selector above hides Radix's default
                    close (the only direct-child button — this one is nested and
                    survives). Wrapped in DialogClose so the tap closes through
                    Radix's own machinery AND the state setter independently. */}
                <DialogClose asChild>
                  <button
                    type="button"
                    aria-label={uiI18n.t('app.close_badge_details_d410b5b2')}
                    onClick={() => { void triggerHaptic('tap'); setSelectedBadge(null); }}
                    className="absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/80 shadow-lg backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </DialogClose>
                <DialogHeader className="relative z-10 items-center border-b border-border px-6 pb-5 pt-8 text-center">
                  <div className={cn('relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(0,0,0,0.55))] ring-1 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.10)]', rarity.ring)}>
                    <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_50%)]" />
                    <img src={selectedBadge.image} alt="" className="relative z-[1] h-16 w-16 object-contain" />
                  </div>
                  <DialogTitle className="pt-2 text-sm font-semibold text-muted-foreground">{selectedBadge.label}</DialogTitle>
                  <div className={cn('text-2xl font-bold tracking-tight text-foreground', tierData?.effectClass)}>{tierData?.name || rarity.label}</div>
                  <DialogDescription className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">{rarity.label} {uiI18n.t('app.rarity_f147fc3f')}</DialogDescription>
                </DialogHeader>
                <div className="relative z-10 space-y-4 p-5">
                  <p className="text-sm leading-relaxed text-foreground/85">{selectedBadge.description}</p>
                  {tierData && nextTier && (
                    <section className="space-y-2 border-t border-border pt-4">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold">{uiI18n.t('app.next_level_3a1cfc72')} {nextTier.name}</span>
                        <span className="text-muted-foreground tabular-nums">{metricValue ?? tierData.threshold}/{nextTier.threshold}</span>
                      </div>
                      <Progress value={metricValue == null ? 0 : progress} className="h-1.5" />
                    </section>
                  )}
                  {selectedBadge.tiers && selectedBadge.tiers.length > 1 && (
                    <section className="border-t border-border pt-4">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {selectedBadge.tiers.map((badgeTier, index) => (
                          <div key={badgeTier.name} className={cn('min-w-0 rounded-xl border px-1 py-2 text-center', index <= tier ? 'border-white/10 bg-white/[0.04] text-foreground' : 'border-white/[0.04] text-muted-foreground/50')}>
                            <img src={selectedBadge.image} alt="" className={cn('mx-auto h-7 w-7 object-contain', index > tier && 'grayscale opacity-40')} />
                            <div className={cn('mt-1 truncate text-[10px] font-bold', badgeTier.effectClass)}>{badgeTier.name}</div>
                            <div className="mt-0.5 text-[9px] tabular-nums">{badgeTier.threshold} {uiI18n.t('app.required_1a77d416')}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {selectedBadge.rule && <p className="border-t border-border pt-3 text-xs text-muted-foreground"><span className="font-semibold text-foreground/70">{uiI18n.t('app.how_to_earn_a737a7d0')}</span> {selectedBadge.rule}</p>}
                </div>
              </div>
            </DialogContent>
          );
        })()}
      </Dialog>
    </TooltipProvider>
  );
}
