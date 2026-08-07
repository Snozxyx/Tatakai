import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useDownload } from '@/hooks/media/useDownload';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { cn } from '@/lib/utils';

/** Compact desktop-only queue indicator wired to Electron download IPC. */
export function DownloadIndicator({ className }: { className?: string }) {
  const isDesktop = useIsDesktopApp();
  const { isEnabled, downloadStates } = useDownload();

  const active = useMemo(() => {
    return Object.entries(downloadStates).filter(
      ([, s]) => s.status === 'downloading' || s.status === 'queued',
    );
  }, [downloadStates]);

  const topProgress = useMemo(() => {
    let max = 0;
    for (const [, s] of active) {
      if (typeof s.progress === 'number') max = Math.max(max, s.progress);
    }
    return max;
  }, [active]);

  if (!isDesktop || !isEnabled || active.length === 0) return null;

  return (
    <Link
      to="/offline-library"
      title="Downloads"
      className={cn(
        'relative flex items-center gap-2 rounded-full border border-border/40 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors',
        className,
      )}
    >
      <Download className="h-4 w-4 text-primary" />
      <span>
        {active.length} active{topProgress > 0 ? ` · ${Math.round(topProgress)}%` : ''}
      </span>
      <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-muted overflow-hidden">
        <span
          className="block h-full bg-primary transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(8, topProgress))}%` }}
        />
      </span>
    </Link>
  );
}
