/**
 * The chips every media card overlays on its poster (docs/Plans.md §2 — "Cards
 * (improve polish and consistency)").
 *
 * `UnifiedMediaCard` and `AnimeCardWithPreview` each hand-rolled these, so the
 * 18+ badge existed in three shapes — two inline copies plus an unused
 * `.badge-18plus` utility in index.css — and drifted in colour, radius and
 * placement. They live here so a card composes them rather than restyling them.
 */
import { ShieldAlert, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The adult marker. The look lives in `.badge-18plus` (index.css) rather than
 * here, because the theme layer already overrides that selector — the brutalism
 * theme squares its corners — so inlining the styles would break those themes.
 */
export function AdultBadge({ className }: { className?: string }) {
  return (
    <span className={cn('badge-18plus', className)} aria-label="Adult content">
      <ShieldAlert className="h-3 w-3" aria-hidden />
      18+
    </span>
  );
}

/**
 * The score chip. Only ever fed the numeric half of `splitRating`, and the star
 * carries the theme's own `amber` token — the same one the rest of the app uses
 * for ratings — rather than a raw Tailwind yellow.
 */
export function ScoreBadge({ score, className }: { score: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-amber/10 px-1.5 py-0.5 text-xs font-semibold text-amber',
        className,
      )}
    >
      <Star className="h-3 w-3 fill-amber text-amber" aria-hidden />
      {score}
    </span>
  );
}

/** The neutral chip for counts and formats, so they match across card types. */
export function MetaBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-xs text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
