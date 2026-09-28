import React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { RARITY_STYLES, type BadgeDef } from '@/lib/badges';

interface UserBadgesProps {
  badges: BadgeDef[] | undefined;
  /** Icon size in px. Defaults to 18. */
  size?: number;
  /** Cap how many are shown; a "+N" chip covers the rest. Omit to show all. */
  max?: number;
  className?: string;
}

/**
 * Reusable row of user badges with rich, rarity-themed hover tooltips.
 */
export function UserBadges({ badges, size = 18, max, className }: UserBadgesProps) {
  if (!badges || badges.length === 0) return null;

  const shown = typeof max === 'number' ? badges.slice(0, max) : badges;
  const remaining = typeof max === 'number' ? badges.slice(max) : [];
  const overflow = remaining.length;
  const containerSize = size + 6;

  return (
    <TooltipProvider delayDuration={100}>
      <div
        className={cn('inline-flex items-center gap-1.5 align-middle select-none', className)}
        role="group"
        aria-label="User badges"
      >
        {shown.map((badge) => {
          const rarity = RARITY_STYLES[badge.rarity];

          return (
            <Tooltip key={badge.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'group/badge relative inline-flex items-center justify-center rounded-full bg-black/30 ring-1 ring-white/10 shrink-0 outline-none transition-all duration-200 hover:scale-115 hover:z-10 focus-visible:ring-2 focus-visible:ring-ring',
                    rarity.ring,
                    rarity.glow,
                    badge.animated && 'badge-animated'
                  )}
                  style={{ width: containerSize, height: containerSize }}
                  aria-label={`${badge.label} badge (${rarity.label})`}
                >
                  <img
                    src={badge.image}
                    alt=""
                    loading="lazy"
                    style={{ width: size, height: size }}
                    className="object-contain drop-shadow-sm transition-transform duration-200 group-hover/badge:scale-105"
                  />
                </button>
              </TooltipTrigger>

              <TooltipContent
                side="top"
                align="center"
                className={cn(
                  'relative w-64 overflow-hidden rounded-xl border p-0 shadow-2xl backdrop-blur-md transition-all',
                  rarity.tooltip
                )}
              >
                {/* Rarity ambient background glow */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-6 opacity-40 blur-2xl"
                  style={{
                    background: rarity.ambient,
                    animation: rarity.animatedAmbient
                      ? 'badge-ambient-spin 8s linear infinite'
                      : 'badge-ambient-pulse 3s ease-in-out infinite',
                  }}
                />

                {/* Card Content */}
                <div className="relative z-10 p-3.5 space-y-2.5 bg-black/40 backdrop-blur-sm">
                  {/* Header Row */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        'inline-flex items-center justify-center rounded-lg bg-black/40 ring-1 ring-white/15 shrink-0 shadow-inner p-1',
                        rarity.ring
                      )}
                      style={{ width: 32, height: 32 }}
                    >
                      <img src={badge.image} alt="" className="h-5 w-5 object-contain" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold leading-tight truncate tracking-wide text-foreground">
                        {badge.label}
                      </h4>
                      <span
                        className={cn(
                          'mt-0.5 inline-block rounded-full px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-wider',
                          rarity.chip
                        )}
                      >
                        {rarity.label}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  {badge.description && (
                    <p className="text-xs text-muted-foreground/90 leading-relaxed">
                      {badge.description}
                    </p>
                  )}

                  {/* Unlocking / How-to-earn rule */}
                  {badge.rule && (
                    <div className="pt-2 border-t border-white/10 flex items-start gap-1.5 text-[10px] text-muted-foreground/80">
                      <span className="font-semibold text-foreground/70 shrink-0">How to earn:</span>
                      <span className="italic">{badge.rule}</span>
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
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 ring-1 ring-white/15 text-[10px] font-bold text-muted-foreground transition-all duration-150 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ width: containerSize, height: containerSize }}
                aria-label={`${overflow} more badges`}
              >
                +{overflow}
              </button>
            </TooltipTrigger>

            <TooltipContent side="top" className="p-2.5 max-w-[200px] rounded-lg bg-popover/95 border border-border shadow-md">
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
    </TooltipProvider>
  );
} 