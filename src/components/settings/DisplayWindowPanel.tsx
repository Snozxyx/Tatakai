import { useEffect, useState } from 'react';
import { Maximize } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { SettingRow, SettingsSection } from '@/components/settings/SettingsPrimitives';
import { useTitlebarHidden } from '@/hooks/ui/useTitlebarHidden';

/**
 * Display & window controls (desktop only): OS-level fullscreen and a
 * "hide title bar" preference. Fullscreen mirrors the real window state — F11
 * and the OS both broadcast `window:fullscreen-changed`, so the toggle stays
 * accurate no matter how fullscreen was entered. This does NOT touch the
 * `.app-fullscreen` class (that belongs to the video player, which also hides
 * the sidebar) — here the app chrome stays put while the window fills the screen.
 */
export function DisplayWindowPanel() {
  const [fullscreen, setFullscreenState] = useState(false);
  const [titlebarHidden, setTitlebarHidden] = useTitlebarHidden();

  useEffect(() => {
    const el = window.electron;
    if (!el?.isFullscreen) return;
    // `window:is-fullscreen` resolves to `{ success, fullscreen }`; the
    // `window:fullscreen-changed` broadcast delivers a bare boolean. Normalise both.
    const coerce = (v: unknown): boolean =>
      typeof v === 'boolean' ? v : !!(v as { fullscreen?: boolean })?.fullscreen;
    void el
      .isFullscreen()
      .then((v) => setFullscreenState(coerce(v)))
      .catch(() => {});
    const unsub = el.onFullscreenChanged?.((v) => setFullscreenState(coerce(v)));
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const toggleFullscreen = (v: boolean) => {
    setFullscreenState(v);
    void window.electron?.setFullscreen?.(v);
  };

  return (
    <SettingsSection
      icon={Maximize}
      eyebrow="Display"
      title="Window & display"
      description="Control how the desktop window fills your screen and whether the custom title bar is shown."
    >
      <div className="space-y-3">
        <SettingRow
          title="Fullscreen"
          description="Fill the entire screen. Press F11 to toggle fullscreen at any time."
          control={
            <Switch
              checked={fullscreen}
              onCheckedChange={toggleFullscreen}
              aria-label="Toggle fullscreen"
            />
          }
        />
        <SettingRow
          title="Hide title bar"
          description="Reclaim the top strip by hiding the custom title bar. Use your OS shortcuts (e.g. Alt+F4 to close, Win/⌘ snapping to move) while it's hidden — toggle this off to bring it back."
          control={
            <Switch
              checked={titlebarHidden}
              onCheckedChange={setTitlebarHidden}
              aria-label="Hide title bar"
            />
          }
        />
      </div>
    </SettingsSection>
  );
}
