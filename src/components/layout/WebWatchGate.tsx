import { useMemo, useState } from 'react';
import { Download, MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { FeatureFlag, isEnabled } from '@/core/feature-flags/feature-flags';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';

const STORAGE_KEY = 'tatakai_web_watch_ok';
const TTL_MS = 48 * 60 * 60 * 1000;

function readSessionBypass(): boolean {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { until?: number };
    return typeof parsed.until === 'number' && parsed.until > Date.now();
  } catch {
    return false;
  }
}

function persistSessionBypass() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ until: Date.now() + TTL_MS }));
  } catch {
    /* ignore */
  }
}

/**
 * Soft gate for web-only viewers: funnels users toward the desktop/mobile app while
 * allowing a timed “continue in browser” bypass (sessionStorage).
 */
export function WebWatchGate({ children }: { children: React.ReactNode }) {
  const isNative = useIsNativeApp();
  const gated = isEnabled(FeatureFlag.WEB_WATCH_GATED);
  const [allowed, setAllowed] = useState(() => readSessionBypass());

  const showGate = useMemo(() => !isNative && gated && !allowed, [isNative, gated, allowed]);

  if (!showGate) return <>{children}</>;

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none opacity-[0.08]">{children}</div>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-md p-4">
        <GlassPanel className="max-w-md w-full p-6 space-y-4 text-center border border-border/60">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <MonitorPlay className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight">Watch in the Tatakai app</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              For the best player, offline downloads, and fewer playback limits, open this episode in the desktop or mobile app.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              className="w-full gap-2"
              onClick={() => window.open('https://github.com/snozxyx/Tatakai/releases/latest', '_blank')}
            >
              <Download className="h-4 w-4" />
              Get the app
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                window.location.href = '/welcome';
              }}
            >
              Why the desktop app?
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => {
                persistSessionBypass();
                setAllowed(true);
              }}
            >
              Continue in browser (48h)
            </Button>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
