import { useState, useEffect } from "react";
import { Keyboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { KeyboardShortcut } from "../VideoPlayer.types";

const SHORTCUT_DEFS: Array<{ key: string; labelKey: string; category: KeyboardShortcut["category"] }> = [
  { key: "Space / K", labelKey: "player.shortcutPlayPause", category: "playback" },
  { key: "F", labelKey: "player.shortcutFullscreen", category: "playback" },
  { key: "M", labelKey: "player.shortcutMute", category: "volume" },
  { key: "←", labelKey: "player.shortcutSeekBack", category: "navigation" },
  { key: "→", labelKey: "player.shortcutSeekForward", category: "navigation" },
  { key: "↑", labelKey: "player.shortcutVolumeUp", category: "volume" },
  { key: "↓", labelKey: "player.shortcutVolumeDown", category: "volume" },
  { key: "I", labelKey: "player.shortcutPip", category: "other" },
];

const CATEGORY_LABEL_KEYS: Record<KeyboardShortcut["category"], string> = {
  playback: "player.shortcutCategoryPlayback",
  navigation: "player.shortcutCategoryNavigation",
  volume: "player.shortcutCategoryVolume",
  subtitles: "player.subtitles",
  other: "player.shortcutCategoryOther",
};

interface KeyboardShortcutOverlayProps {
  isVisible: boolean;
  onClose: () => void;
}

export function KeyboardShortcutOverlay({ isVisible, onClose }: KeyboardShortcutOverlayProps) {
  const { t } = useTranslation();
  if (!isVisible) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background/95 border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <Keyboard className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">{t('player.keyboardShortcuts')}</h3>
        </div>

        <div className="space-y-4">
          {(["playback", "navigation", "volume", "other"] as const).map((category) => (
            <div key={category}>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {t(CATEGORY_LABEL_KEYS[category])}
              </div>
              <div className="space-y-1.5">
                {SHORTCUT_DEFS.filter((s) => s.category === category).map((shortcut) => (
                  <div key={shortcut.key} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{t(shortcut.labelKey)}</span>
                    <kbd className="px-2 py-0.5 rounded bg-muted text-xs font-mono text-muted-foreground">
                      {shortcut.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full py-2 rounded-xl bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
        >
          {t('player.closeShortcutsHint')}
        </button>
      </div>
    </div>
  );
}
