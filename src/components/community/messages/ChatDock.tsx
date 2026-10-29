import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { isTV } from '@/core/tv/device';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, MessageCircle, Minimize2, Minus, X } from 'lucide-react';
import { useChatDock } from '@/contexts/ChatDockContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDirectUnread } from '@/hooks/community/useDirectMessages';
import { Button } from '@/components/ui/button';
import './chat-dock.css';

const MessagesPanel = lazy(() => import('./MessagesPanel').then(module => ({ default: module.MessagesPanel })));

/** Non-modal on desktop: people can browse the app while chatting. */
export function ChatDock() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement || document.documentElement.classList.contains('app-fullscreen') || document.querySelector('.is-player-fullscreen')));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
    return () => { observer.disconnect(); document.removeEventListener('fullscreenchange', sync); document.removeEventListener('webkitfullscreenchange', sync); };
  }, []);
  const hiddenForContent = fullscreen || /^\/(?:manga|novel)\/read(?:\/|$)/.test(pathname) || /^\/x\/[^/]+\/[^/]+\/read\//.test(pathname);

  const narrow = useIsMobile(); const mobile = narrow || (Capacitor.isNativePlatform() && !isTV());
  const { mode, mounted, conversationId, openChat, selectConversation, minimizeChat, closeChat } = useChatDock();
  const { data: unread = 0 } = useDirectUnread();
  const [expanded, setExpanded] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (hiddenForContent) return;
    if (mode === 'open') {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      panel.current?.focus({ preventScroll: true });
    } else if (mode === 'minimized') launcher.current?.focus({ preventScroll: true });
    else if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
  }, [mode, hiddenForContent]);
  if (hiddenForContent || mobile || !user || !mounted || typeof document === 'undefined') return null;
  return createPortal(<div className="chat-dock" data-expanded={expanded} data-mode={mode}>
    <section ref={panel} className="chat-dock-window" hidden={mode !== 'open'} role="dialog" aria-modal={false} aria-label="Messages" tabIndex={-1} onKeyDown={event => {
      if (event.key === 'Escape' && event.target instanceof Element && !event.target.closest('[data-state="open"][role="dialog"], [role="menu"], [role="listbox"]')) {
        event.stopPropagation(); minimizeChat();
      }
    }}>
      <header className="chat-dock-toolbar">
        <div className="chat-dock-title"><MessageCircle size={17} /><h2>Chat</h2>{unread > 0 && <span className="chat-dock-count">{unread > 99 ? '99+' : unread}</span>}</div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="chat-dock-expand" aria-label={expanded ? 'Compact chat' : 'Expand chat'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</Button>
          <Button variant="ghost" size="icon" aria-label="Minimize chat" onClick={minimizeChat}><Minus size={18} /></Button>
          <Button variant="ghost" size="icon" aria-label="Close chat" onClick={closeChat}><X size={18} /></Button>
        </div>
      </header>
      <Suspense fallback={<p className="p-6 text-sm text-muted-foreground" role="status">Opening messages…</p>}>
        <MessagesPanel conversationId={conversationId} onSelect={selectConversation} compact={!expanded} active={mode === 'open'} />
      </Suspense>
    </section>
    {mode === 'minimized' && <button ref={launcher} type="button" className="chat-dock-launcher" onClick={() => openChat()} aria-label={`Restore chat${unread ? `, ${unread} unread` : ''}`}><MessageCircle size={18} /><span>Chat</span>{unread > 0 && <span className="chat-dock-count">{unread > 99 ? '99+' : unread}</span>}<span className="chat-dock-restore">Open</span></button>}
  </div>, document.body);
}
