import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_KEYBINDS,
  KEYBINDS_UPDATED_EVENT,
  KeybindAction,
  KeybindMap,
  assignKeybind,
  loadKeybinds,
  resetKeybinds,
  saveKeybinds,
} from '@/lib/video/keybindings';

/**
 * React state layer over the keybind store. Keeps every mounted consumer
 * (the player, the settings editor) in sync via the `KEYBINDS_UPDATED_EVENT`
 * and the cross-tab `storage` event.
 */
export function useKeybinds() {
  const [keybinds, setKeybinds] = useState<KeybindMap>(() => loadKeybinds());

  useEffect(() => {
    const sync = () => setKeybinds(loadKeybinds());
    window.addEventListener(KEYBINDS_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(KEYBINDS_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setBinding = useCallback((action: KeybindAction, key: string) => {
    setKeybinds((prev) => {
      const next = assignKeybind(prev, action, key);
      saveKeybinds(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setKeybinds(resetKeybinds());
  }, []);

  return { keybinds, setBinding, reset, defaults: DEFAULT_KEYBINDS };
}
