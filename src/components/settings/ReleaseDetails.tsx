import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { normalizeReleaseNotes } from '@/core/update/release-details';

export function ReleaseDetails({ notes, percentage, channel = 'stable', checkedAt }: {
  notes?: unknown; percentage?: number; channel?: string; checkedAt?: number;
}) {
  useUiTranslation();
  const text = normalizeReleaseNotes(notes);
  return <div className="space-y-3 text-sm text-muted-foreground">
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
      <dt>{uiI18n.t('app.channel_879f0b1b')}</dt><dd className="font-medium text-foreground capitalize">{channel}</dd>
      <dt>{uiI18n.t('app.rollout_c0ea021a')}</dt><dd>{percentage == null ? uiI18n.t('app.rollout_information_unavailable_77ab09b4') : uiI18n.t('app.staged_rollout_i18n_value_0_6959854d', { value0: percentage })}</dd>
      {!!checkedAt && <><dt>{uiI18n.t('app.last_checked_ada1b725')}</dt><dd>{new Date(checkedAt).toLocaleString(uiI18n.language)}</dd></>}
    </dl>
    {text && <details className="border-t border-border pt-2"><summary className="cursor-pointer py-2 font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{uiI18n.t('app.release_notes_cd5af734')}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{text}</pre></details>}
  </div>;
}
