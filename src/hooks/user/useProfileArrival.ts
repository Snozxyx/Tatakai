import { useEffect, useState } from 'react';

/** A deliberate entry beat once per navigation, rather than a flash of another theme. */
export function useProfileArrival(key: string, enabled: boolean, duration: number) {
  const [finished, setFinished] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || duration <= 0 || finished === key) return;
    const timeout = window.setTimeout(() => setFinished(key), duration);
    return () => window.clearTimeout(timeout);
  }, [key, enabled, duration, finished]);
  return enabled && duration > 0 && finished !== key;
}
