import React, { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { RARITY_STYLES, type BadgeDef, type BadgeMetricKey, currentTier, pickFeaturedBadge } from '@/lib/badges';

interface UserBadgesProps {
  badges: BadgeDef[] | undefined;
  /** Icon size in px. Defaults to 18. */
  size?: number;
  /** Cap how many are shown; a "+N" chip covers the rest. Omit to show all. */
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
function BadgeShell({
  interactive,
  onOpen,
  className,
  style,
  label,
  children,
}: {
  interactive: boolean;
  onOpen: () => void;
  className?: string;
  style?: React.CSSProperties;
  label: string;
  children: React.ReactNode;
}) {
  if (interactive) {
    return (
      <button type="button" onClick={onOpen} className={className} style={style} aria-label={label}>
        {children}
      </button>
    );
  }
  return (
    <span role="img" aria-label={label} className={className} style={style}>
      {children}
    </span>
  );
}

/**
 * Premium static badge row — no pulsing / spinning / shimmer.
 * Luxury coin look: deep matte base, fine 1px rarity ring, top gloss,
 * soft static shadow. Featured badge gets a slightly larger coin +
 * refined double ring, no animation.
 */
export function UserBadges({
  badges,
  size = 18,
  max,
  className,
  featuredKey,
  userStats,
  interactive = true,
}: UserBadgesProps) {
  const [selectedBadge, setSelectedBadge] = useState<BadgeDef | null>(null);
  if (!badges || badges.length === 0) return null;

  // A showcase badge is always present, even before the optional profile field
  // has been backfilled. The profile value wins once the migration is applied.
  const effectiveFeaturedKey = featuredKey ?? pickFeaturedBadge(badges);
  const shown = typeof max === 'number' ? badges.slice(0, max) : badges;
  const remaining = typeof max === 'number' ? badges.slice(max) : [];
  const overflow = remaining.length;

  return (
    <TooltipProvider delayDuration={100}>
      <div
        className={cn('inline-flex items-center gap-1.5 align-middle select-none', className)}
        role="group"
        aria-label="User badges"
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
                  label={`${badge.label} badge (${rarity.label})${tierData ? ` - ${tierData.name}` : ''}`}
                >
                  {/* Top gloss — static premium highlight */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_46%)]"
                  />
                  {/* Fine inner hairline */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-[3px] rounded-full border border-white/[0.06]"
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

              <TooltipContent
                side="top"
                align="center"
                className={cn(
                  'relative w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0d]/95 p-0 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)] backdrop-blur-md',
                  rarity.tooltip
                )}
              >
                {/* Static rarity wash — no spin / pulse */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-6 opacity-30 blur-2xl"
                  style={{ background: rarity.ambient }}
                />

                {/* Card Content */}
                <div className="relative z-10 space-y-2.5 bg-white/[0.02] p-3.5">
                  {/* Header Row */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(0,0,0,0.45))] ring-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
                        rarity.ring
                      )}
                      style={{ width: 36, height: 36 }}
                    >
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),transparent_50%)]"
                      />
                      <img src={badge.image} alt="" className="relative z-[1] h-6 w-6 object-contain" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold leading-tight truncate tracking-wide text-foreground">
                        {badge.label}
                      </h4>
                      <span
                        className={cn(
                          'mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]',
                          rarity.chip
                        )}
                      >
                        {rarity.label}
                      </span>
                    </div>
                  </div>

                  {/* Current Tier Display */}
                  {tierData && (
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-2.5 py-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-foreground/90">{tierData.name}</span>
                        <span className="text-muted-foreground/60 tabular-nums">Tier {tier + 1}/{badge.tiers!.length}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/75 mt-0.5 leading-snug">
                        {tierData.description}
                      </p>
                      {nextTier && badge.metricKey && userStats && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-[9px] text-muted-foreground/60">
                            <span>Next: {nextTier.name}</span>
                            <span className="tabular-nums">{userStats[badge.metricKey]}/{nextTier.threshold}</span>
                          </div>
                          <div className="h-1 bg-black/50 rounded-full overflow-hidden border border-white/[0.04]">
                            <div
                              className="h-full bg-white/70"
                              style={{
                                width: `${Math.min(
                                  100,
                                  ((userStats[badge.metricKey]! - tierData.threshold) / (nextTier.threshold - tierData.threshold)) * 100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Description */}
                  {badge.description && (
                    <p className="text-xs text-muted-foreground/90 leading-relaxed">
                      {badge.description}
                    </p>
                  )}

                  {/* Unlocking / How-to-earn rule */}
                  {badge.rule && (
                    <div className="pt-2 border-t border-white/[0.06] flex items-start gap-1.5 text-[10px] text-muted-foreground/70">
                      <span className="font-semibold text-foreground/60 shrink-0">How to earn:</span>
                      <span>{badge.rule}</span>
                    </div>
                  )}

                  {isFeatured && (
                    <div className="pt-2 border-t border-white/[0.06] flex items-center gap-1.5 text-[10px] font-semibold text-foreground/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
                      Featured Badge
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Overflow Indicator with Tooltip */}
        {overflow > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeShell
                interactive={interactive}
                onOpen={() => {}}
                className="inline-flex items-center justify-center rounded-full bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/10 text-[10px] font-bold text-muted-foreground transition-colors duration-150 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                style={{ width: size + 10, height: size + 10 }}
                label={`${overflow} more badges`}
              >
                +{overflow}
              </BadgeShell>
            </TooltipTrigger>

            <TooltipContent side="top" className="p-2.5 max-w-[200px] rounded-xl bg-[#0b0b0d]/95 border border-white/10 shadow-xl">
              <p className="text-[11px] font-semibold text-foreground mb-1">Additional Badges:</p>
              <ul className="text-[10px] text-muted-foreground space-y-0.5">
                {remaining.map((b) => (
                  <li key={b.key} className="truncate">• {b.label}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        )}
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
            <DialogContent className={cn('max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto rounded-3xl border-white/10 bg-[#0b0b0d]/95 p-0 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl custom-scrollbar', '[&>button.absolute.right-4]:hidden')}>
              <div className="relative overflow-hidden rounded-3xl bg-[#0b0b0d]">
                <span aria-hidden className="pointer-events-none absolute -inset-12 opacity-30 blur-3xl" style={{ background: rarity.ambient }} />
                <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 z-20 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                {/* Single refined close — default Radix close is hidden via the selector above */}
                <button
                  type="button"
                  aria-label="Close badge details"
                  onClick={() => { void triggerHaptic('tap'); setSelectedBadge(null); }}
                  className="absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/80 shadow-lg backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
                <DialogHeader className="relative z-10 items-center border-b border-white/[0.06] px-6 pb-5 pt-8 text-center">
                  <div className={cn('relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(0,0,0,0.55))] ring-1 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.10)]', rarity.ring)}>
                    <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_50%)]" />
                    <img src={selectedBadge.image} alt="" className="relative z-[1] h-16 w-16 object-contain" />
                  </div>
                  <DialogTitle className="pt-2 text-sm font-semibold text-muted-foreground">{selectedBadge.label}</DialogTitle>
                  <div className={cn('text-2xl font-bold tracking-tight', rarity.text, tierData?.effectClass)}>{tierData?.name || rarity.label}</div>
                  <DialogDescription className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">{rarity.label} rarity</DialogDescription>
                </DialogHeader>
                <div className="relative z-10 space-y-4 p-5">
                  <p className="text-sm leading-relaxed text-foreground/85">{selectedBadge.description}</p>
                  {tierData && nextTier && (
                    <section className="space-y-2 border-t border-white/[0.06] pt-4">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold">Next level: {nextTier.name}</span>
                        <span className="text-muted-foreground tabular-nums">{metricValue ?? tierData.threshold}/{nextTier.threshold}</span>
                      </div>
                      <Progress value={metricValue == null ? 0 : progress} className="h-1.5" />
                    </section>
                  )}
                  {selectedBadge.tiers && (
                    <section className="border-t border-white/[0.06] pt-4">
                      <div className="grid grid-cols-4 gap-2">
                        {selectedBadge.tiers.map((badgeTier, index) => (
                          <div key={badgeTier.name} className={cn('min-w-0 rounded-xl border px-1 py-2 text-center', index <= tier ? 'border-white/10 bg-white/[0.04] text-foreground' : 'border-white/[0.04] text-muted-foreground/50')}>
                            <img src={selectedBadge.image} alt="" className={cn('mx-auto h-7 w-7 object-contain', index > tier && 'grayscale opacity-40')} />
                            <div className={cn('mt-1 truncate text-[10px] font-bold', badgeTier.effectClass)}>{badgeTier.name}</div>
                            <div className="mt-0.5 text-[9px] tabular-nums">{badgeTier.threshold} required</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {selectedBadge.rule && <p className="border-t border-white/[0.06] pt-3 text-xs text-muted-foreground"><span className="font-semibold text-foreground/70">How to earn:</span> {selectedBadge.rule}</p>}
                </div>
              </div>
            </DialogContent>
          );
        })()}
      </Dialog>
    </TooltipProvider>
  );
}
