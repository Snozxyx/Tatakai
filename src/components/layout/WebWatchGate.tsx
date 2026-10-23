import type { ReactNode } from 'react';

/** Browsers can play and read using a connected extension server. */
export function WebWatchGate({ children }: { children: ReactNode; mode?: 'watch' | 'read' }) {
  return <>{children}</>;
}
