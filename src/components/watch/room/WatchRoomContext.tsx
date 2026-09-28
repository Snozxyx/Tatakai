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
    const controller = useWatchRoomController();
    return <WatchRoomContext.Provider value={controller}>{children}</WatchRoomContext.Provider>;
}

export function useWatchRoomContext(): WatchRoomController {
    const ctx = useContext(WatchRoomContext);
    if (!ctx) {
        throw new Error('useWatchRoomContext must be used within a WatchRoomProvider');
    }
    return ctx;
}
