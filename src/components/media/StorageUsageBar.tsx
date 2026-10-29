import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useStorageUsage } from '@/hooks/user/useStorageUsage';
import { formatBytes } from '@/components/extensions/store/extensionVisuals';

/** "X of Y used" media-storage meter shown atop Saved Content. */
export function StorageUsageBar() {
  useUiTranslation();
  const { data, isLoading } = useStorageUsage();
  if (isLoading || !data) return null;
  const { usedBytes, quotaBytes } = data;
  const pct = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;
  const near = pct >= 90;
  return (
    <div className="rounded-xl bg-muted/30 border border-white/10 p-3.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{uiI18n.t('app.storage_9e092dda')}</span>
        <span className="text-muted-foreground tabular-nums">
          {formatBytes(usedBytes) ?? '0 B'} {uiI18n.t('app.of_de04fa0e')} {formatBytes(quotaBytes) ?? uiI18n.t('app.25_mb_1e1747c4')} {uiI18n.t('app.used_192a5675')}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={'h-full rounded-full transition-all ' + (near ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
