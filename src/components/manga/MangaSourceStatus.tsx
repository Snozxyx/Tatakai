import { Loader2 } from 'lucide-react';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';

export function MangaSourceStatus({ count, fetching }: { count: number; fetching: boolean }) {
  useUiTranslation();
  return <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{count} {uiI18n.t('app.sources_bce16dd0')}</span>
    {fetching && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-foreground">
      <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" />
      {count > 0 ? uiI18n.t('app.fetching_more_manga_sources') : uiI18n.t('app.finding_servers_6f871241')}
    </span>}
  </div>;
}
