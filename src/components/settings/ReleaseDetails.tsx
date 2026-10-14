import { normalizeReleaseNotes } from '@/core/update/release-details';

export function ReleaseDetails({ notes, percentage, channel = 'stable', checkedAt }: {
  notes?: unknown; percentage?: number; channel?: string; checkedAt?: number;
}) {
  const text = normalizeReleaseNotes(notes);
  return <div className="space-y-3 text-sm text-muted-foreground">
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
      <dt>Channel</dt><dd className="font-medium text-foreground capitalize">{channel}</dd>
      <dt>Rollout</dt><dd>{percentage == null ? 'Rollout information unavailable' : `Staged rollout: ${percentage}%`}</dd>
      {!!checkedAt && <><dt>Last checked</dt><dd>{new Date(checkedAt).toLocaleString()}</dd></>}
    </dl>
    {text && <details className="border-t border-border pt-2"><summary className="cursor-pointer py-2 font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">Release notes</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{text}</pre></details>}
  </div>;
}
