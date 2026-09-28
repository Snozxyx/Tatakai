import { useMemo, useState } from 'react';
import { Download, MonitorPlay, BookOpen } from 'lucide-react';
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

type GateMode = 'watch' | 'read';

const RELEASES_URL = 'https://github.com/snozxyx/Tatakai/releases/latest';

/**
 * Gate for web-only viewers.
 *   mode="watch" (anime): HARD block — playback is only available in the desktop/mobile
 *     app on web. No browser bypass; the user must get the app to continue.
 *   mode="read" (manga): soft gate with a timed "continue in browser" bypass.
 */
export function WebWatchGate({
  children,
  mode = 'watch',
}: {
  children: React.ReactNode;
  mode?: GateMode;
}) {
  const isNative = useIsNativeApp();
  const gated = isEnabled(FeatureFlag.WEB_WATCH_GATED);
  // The 48h bypass only exists for manga reading; anime playback is never unlocked on web.
  const [allowed, setAllowed] = useState(() => (mode === 'read' ? readSessionBypass() : false));

  const showGate = useMemo(
    () => !isNative && gated && !(mode === 'read' && allowed),
    [isNative, gated, allowed, mode],
  );

  if (!showGate) return <>{children}</>;

  const isWatch = mode === 'watch';

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none opacity-[0.08]">{children}</div>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-md p-4">
        <GlassPanel className="max-w-md w-full p-6 space-y-4 text-center border border-border/60">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            {isWatch ? <MonitorPlay className="h-7 w-7" /> : <BookOpen className="h-7 w-7" />}
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight">
              {isWatch ? 'Anime playback lives in the app' : 'Read in the Tatakai app'}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isWatch
                ? 'Anime playback isn’t available in the browser. Install the Tatakai desktop app for the full player, offline downloads, and extension sources.'
                : 'For the best reader, offline downloads, and fewer limits, open this chapter in the desktop or mobile app.'}
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button className="w-full gap-2" onClick={() => window.open(RELEASES_URL, '_blank')}>
              <Download className="h-4 w-4" />
              Get the app
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                window.location.href = '/download';
              }}
            >
              {isWatch ? 'See all platforms' : 'Why the desktop app?'}
            </Button>
            {!isWatch && (
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
            )}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
