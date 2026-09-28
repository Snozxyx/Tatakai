import { useEffect } from 'react';
import {
  normalizeKeyToken,
  resolveReaderAction,
  type ReaderKeybindAction,
  type ReaderKeybindMap,
} from '@/lib/reader/keybindings';

export interface ReaderKeyboardHandlers {
  nextPage?: () => void;
  prevPage?: () => void;
  nextChapter?: () => void;
  prevChapter?: () => void;
  toggleFullscreen?: () => void;
  toggleDirection?: () => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
  toggleComments?: () => void;
  reload?: () => void;
}

/**
 * Window keydown handler for the manga reader. Mirrors `useVideoKeyboard`:
 * ignores keystrokes while typing in an input/textarea or with a modifier held,
 * normalizes to a token, resolves it against the user's reader keybinds, and
 * dispatches. `enabled` lets the reader suspend it (e.g. while a drawer is open).
 */
export function useReaderKeyboard(
  keybinds: ReaderKeybindMap,
  handlers: ReaderKeyboardHandlers,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const activeTag = (target?.tagName || document.activeElement?.tagName || '').toUpperCase();
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const token = normalizeKeyToken(e);
      // Space and arrows fall back to native scroll in vertical mode when unbound.
      const action = resolveReaderAction(keybinds, token);
      if (!action) return;

      const run: Record<ReaderKeybindAction, (() => void) | undefined> = {
        nextPage: handlers.nextPage,
        prevPage: handlers.prevPage,
        nextChapter: handlers.nextChapter,
        prevChapter: handlers.prevChapter,
        toggleFullscreen: handlers.toggleFullscreen,
        toggleDirection: handlers.toggleDirection,
        zoomIn: handlers.zoomIn,
        zoomOut: handlers.zoomOut,
        toggleComments: handlers.toggleComments,
        reload: handlers.reload,
      };

      const fn = run[action];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, keybinds, handlers]);
}
