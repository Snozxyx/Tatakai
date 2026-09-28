import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_READER_KEYBINDS,
  READER_KEYBINDS_UPDATED_EVENT,
  ReaderKeybindAction,
  ReaderKeybindMap,
  assignReaderKeybind,
  loadReaderKeybinds,
  resetReaderKeybinds,
  saveReaderKeybinds,
} from '@/lib/reader/keybindings';

/**
 * React state layer over the reader keybind store. Keeps every mounted consumer
 * (the reader, the settings editor) in sync via `READER_KEYBINDS_UPDATED_EVENT`
 * and the cross-tab `storage` event. Clone of `useKeybinds` for the reader.
 */
export function useReaderKeybinds() {
  const [keybinds, setKeybinds] = useState<ReaderKeybindMap>(() => loadReaderKeybinds());

  useEffect(() => {
    const sync = () => setKeybinds(loadReaderKeybinds());
    window.addEventListener(READER_KEYBINDS_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(READER_KEYBINDS_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setBinding = useCallback((action: ReaderKeybindAction, key: string) => {
    setKeybinds((prev) => {
      const next = assignReaderKeybind(prev, action, key);
      saveReaderKeybinds(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setKeybinds(resetReaderKeybinds());
  }, []);

  return { keybinds, setBinding, reset, defaults: DEFAULT_READER_KEYBINDS };
}
