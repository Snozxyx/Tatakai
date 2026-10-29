import { Capacitor } from '@capacitor/core';
import { isTV } from '@/core/tv/device';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type ChatMode = 'closed' | 'open' | 'minimized';
interface ChatDockState {
  available: boolean;
  mode: ChatMode;
  conversationId?: string;
  mounted: boolean;
  openChat: (conversationId?: string) => void;
  selectConversation: (conversationId?: string) => void;
  minimizeChat: () => void;
  closeChat: () => void;
}
const ChatDockContext = createContext<ChatDockState>({ available: false, mode: 'closed', mounted: false, openChat: () => {}, selectConversation: () => {}, minimizeChat: () => {}, closeChat: () => {} });

/** App-level state survives navigation. Drafts stay in memory while the dock is hidden. */
export function ChatDockProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const narrow = useIsMobile(); const mobile = narrow || (Capacitor.isNativePlatform() && !isTV());
  const [owner, setOwner] = useState(user?.id);
  const [mode, setMode] = useState<ChatMode>('closed');
  const [conversationId, setConversationId] = useState<string>();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (owner === user?.id) return;
    setOwner(user?.id); setMode('closed'); setConversationId(undefined); setMounted(false);
  }, [owner, user?.id]);
  const openChat = useCallback((id?: string) => {
    if (!user) return;
    if (mobile) { setMode('closed'); navigate(id ? `/messages/${encodeURIComponent(id)}` : '/messages'); return; }
    if (id !== undefined) setConversationId(id);
    setMounted(true); setMode('open');
  }, [user, mobile, navigate]);
  const selectConversation = useCallback((id?: string) => setConversationId(id), []);
  const minimizeChat = useCallback(() => setMode('minimized'), []);
  const closeChat = useCallback(() => setMode('closed'), []);
  const currentUser = owner === user?.id;
  const value = useMemo(() => ({ available: !!user, mode: currentUser ? mode : 'closed' as const, mounted: currentUser && mounted,
    conversationId: currentUser ? conversationId : undefined, openChat, selectConversation, minimizeChat, closeChat }),
  [user, currentUser, mode, mounted, conversationId, openChat, selectConversation, minimizeChat, closeChat]);
  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}
export function useChatDock() { return useContext(ChatDockContext); }
