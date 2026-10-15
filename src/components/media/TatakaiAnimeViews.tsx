import { Eye } from 'lucide-react';
import { useAnimeViewCount, formatViewCount } from '@/hooks/user/useViews';
import { cn } from '@/lib/utils';
import uiI18n from '@/lib/uiI18n';

/** Resolve the identifier used by the existing anime view tracker. */
export function resolveTatakaiAnimeViewId(id?: string | number | null, anilistId?: string | number | null): string | undefined {
  const anilist = String(anilistId ?? '').trim();
  if (/^\d+$/.test(anilist) && Number(anilist) > 0) return String(Number(anilist));

  const raw = String(id ?? '').trim();
  if (!raw || /^mal[:_-]?\d+$/i.test(raw)) return undefined;
  const prefixedAniList = raw.match(/^anilist[:_-]?(\d+)$/i);
  if (prefixedAniList) return String(Number(prefixedAniList[1]));
  return raw;
}

export function TatakaiAnimeViews({
  animeId,
  variant = 'card',
  className,
}: {
  animeId?: string;
  variant?: 'card' | 'detail';
  className?: string;
}) {
  const { data: count, isLoading } = useAnimeViewCount(animeId);
  if (!animeId || isLoading || count == null) return null;

  const formatted = formatViewCount(count);
  const viewsLabel = uiI18n.t('app.views_81f33187');
  const accessibleLabel = `${formatted} Tatakai ${viewsLabel}`;

  if (variant === 'detail') {
    return (
      <div
        className={cn('inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm', className)}
        aria-label={accessibleLabel}
        title={accessibleLabel}
      >
        <Eye aria-hidden className="h-4 w-4" />
        <span className="font-semibold tabular-nums">{formatted}</span>
        <span className="text-muted-foreground">Tatakai {viewsLabel}</span>
      </div>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums', className)} aria-label={accessibleLabel} title={accessibleLabel}>
      <Eye aria-hidden className="h-3 w-3" />
      <span>{formatted}</span>
      <span>{viewsLabel}</span>
      <span className="sr-only">Tatakai</span>
    </span>
  );
}
