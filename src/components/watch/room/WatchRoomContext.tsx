import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { createContext, useContext, type ReactNode } from 'react';
import { useWatchRoomController } from './useWatchRoomController';

/**
 * Shared context for the Watch2Together room. The provider calls
 * `useWatchRoomController` exactly once (preserving hook order) and every UI
 * section reads only the slice it needs via `useWatchRoomContext` — no prop
 * drilling, and re-render cost matches the old monolith (which re-rendered
 * wholesale on any state change).
 */
export type WatchRoomController = ReturnType<typeof useWatchRoomController>;

const WatchRoomContext = createContext<WatchRoomController | null>(null);

export function WatchRoomProvider({ children }: { children: ReactNode }) {
  useUiTranslation();
    const controller = useWatchRoomController();
    return <WatchRoomContext.Provider value={controller}>{children}</WatchRoomContext.Provider>;
}

export function useWatchRoomContext(): WatchRoomController {
  useUiTranslation();
    const ctx = useContext(WatchRoomContext);
    if (!ctx) {
        throw new Error(uiI18n.t('app.usewatchroomcontext_must_be_used_within_a_watchr_aafcd316'));
    }
    return ctx;
}
