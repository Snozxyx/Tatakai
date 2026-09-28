import { useCallback, useEffect, useState } from 'react';

/**
 * "Hide title bar" preference for the desktop custom title bar. Persisted in
 * localStorage and mirrored across every hook instance in the same tab (the
 * settings toggle and MainLayout both read it) via a custom window event —
 * the native `storage` event only fires in *other* tabs.
 *
 * State only: MainLayout owns toggling the `.titlebar-hidden` class on <html>
 * and dropping the titlebar clearance, so the class has a single writer.
 */
const KEY = 'tatakai_hide_titlebar';
const EVENT = 'tatakai:titlebar-hidden-changed';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

export function useTitlebarHidden(): [boolean, (value: boolean) => void] {
  const [hidden, setHiddenState] = useState<boolean>(read);

  useEffect(() => {
    const sync = () => setHiddenState(read());
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);

  const setHidden = useCallback((value: boolean) => {
    try {
      localStorage.setItem(KEY, String(value));
    } catch {
      /* ignore quota / privacy-mode failures */
    }
    setHiddenState(value);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [hidden, setHidden];
}
