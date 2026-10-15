import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  useUiTranslation();
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
      title={uiI18n.t('app.window_display_c9adb975')}
      description={uiI18n.t('app.control_how_the_desktop_window_fills_your_screen_f22ddc61')}
    >
      <div className="space-y-3">
        <SettingRow
          title={uiI18n.t('app.fullscreen_bb08d10b')}
          description={uiI18n.t('app.fill_the_entire_screen_press_f11_to_toggle_fulls_0dc54922')}
          control={
            <Switch
              checked={fullscreen}
              onCheckedChange={toggleFullscreen}
              aria-label={uiI18n.t('app.toggle_fullscreen_751fc48b')}
            />
          }
        />
        <SettingRow
          title={uiI18n.t('app.hide_title_bar_d752f237')}
          description={uiI18n.t('app.reclaim_the_top_strip_by_hiding_the_custom_title_3bcafa9f')}
          control={
            <Switch
              checked={titlebarHidden}
              onCheckedChange={setTitlebarHidden}
              aria-label={uiI18n.t('app.hide_title_bar_d752f237')}
            />
          }
        />
      </div>
    </SettingsSection>
  );
}
