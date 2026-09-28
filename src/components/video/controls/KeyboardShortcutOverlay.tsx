import { useState, useEffect } from "react";
import { Keyboard } from "lucide-react";
import type { KeyboardShortcut } from "../VideoPlayer.types";

const SHORTCUTS: KeyboardShortcut[] = [
  { key: "Space / K", label: "Play / Pause", category: "playback" },
  { key: "F", label: "Fullscreen", category: "playback" },
  { key: "M", label: "Mute", category: "volume" },
  { key: "←", label: "Seek -10s", category: "navigation" },
  { key: "→", label: "Seek +10s", category: "navigation" },
  { key: "↑", label: "Volume Up", category: "volume" },
  { key: "↓", label: "Volume Down", category: "volume" },
  { key: "I", label: "Picture-in-Picture", category: "other" },
];

interface KeyboardShortcutOverlayProps {
  isVisible: boolean;
  onClose: () => void;
}

export function KeyboardShortcutOverlay({ isVisible, onClose }: KeyboardShortcutOverlayProps) {
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
          <h3 className="text-lg font-semibold">Keyboard Shortcuts</h3>
        </div>

        <div className="space-y-4">
          {(["playback", "navigation", "volume", "other"] as const).map((category) => (
            <div key={category}>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {category}
              </div>
              <div className="space-y-1.5">
                {SHORTCUTS.filter((s) => s.category === category).map((shortcut) => (
                  <div key={shortcut.key} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{shortcut.label}</span>
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
          Close (Press ? again)
        </button>
      </div>
    </div>
  );
}
