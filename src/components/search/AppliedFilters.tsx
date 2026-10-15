import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { X } from 'lucide-react';

interface AppliedFilter {
  id: string;
  label: string;
  remove: () => void;
}

/** Applied values only; editing the advanced panel remains a separate draft. */
export function AppliedFilters({ filters, onClear }: { filters: AppliedFilter[]; onClear: () => void }) {
  useUiTranslation();
  if (!filters.length) return null;
  return <section aria-label={uiI18n.t('app.applied_filters_59675df5')} className="applied-filters mt-4 flex flex-wrap items-center gap-2">
    <span className="mr-1 text-xs font-medium text-muted-foreground">{uiI18n.t('app.applied_a3e4a569')}</span>
    {filters.map(filter => <button key={filter.id} type="button" aria-label={uiI18n.t('app.remove_i18n_value_0_89e2cb36', { value0: filter.label })}
      className="ui-button inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 text-xs font-medium text-foreground transition-colors hover:bg-primary/15"
      onClick={event => {
        // Move focus before this chip disappears, including for keyboard users.
        const next = event.currentTarget.nextElementSibling || event.currentTarget.previousElementSibling;
        (next instanceof HTMLButtonElement ? next : document.getElementById('search-filters-toggle'))?.focus();
        filter.remove();
      }}>
      <span className="truncate">{filter.label}</span><X aria-hidden className="h-3.5 w-3.5 shrink-0" />
    </button>)}
    <button type="button" className="min-h-9 rounded-full px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={() => { document.getElementById('search-filters-toggle')?.focus(); onClear(); }}>{uiI18n.t('app.clear_filters_41222671')}</button>
  </section>;
}
