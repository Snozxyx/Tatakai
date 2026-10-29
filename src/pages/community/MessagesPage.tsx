import { Capacitor } from '@capacitor/core';
import { isTV } from '@/core/tv/device';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useChatDock } from '@/contexts/ChatDockContext';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { MessagesPanel } from '@/components/community/messages/MessagesPanel';
import { Button } from '@/components/ui/button';
import '@/components/community/messages/chat-dock.css';

export default function MessagesPage() {
  const { conversationId } = useParams(); const { openChat } = useChatDock();
  const navigate = useNavigate(); const narrow = useIsMobile(); const mobile = narrow || (Capacitor.isNativePlatform() && !isTV()); const page = useRef<HTMLElement>(null);
  useEffect(() => { if (!mobile) { openChat(conversationId); navigate('/', { replace: true }); } }, [conversationId, mobile, openChat, navigate]);
  useEffect(() => {
    if (!mobile) return;
    const root = document.getElementById('root'); const previousInert = root?.inert; const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; if (root) root.inert = true; page.current?.focus();
    return () => { document.body.style.overflow = overflow; if (root) root.inert = previousInert ?? false; };
  }, [mobile]);
  if (!mobile) return null;
  return createPortal(<main ref={page} tabIndex={-1} className="mobile-messages-page" aria-label="Messages">
    <header><Button type="button" size="icon" variant="ghost" aria-label="Back" onClick={() => { if (window.history.state?.idx > 0) navigate(-1); else navigate('/', { replace:true }); }}><ArrowLeft /></Button><h1>{conversationId ? 'Conversation' : 'Messages'}</h1></header>
    <MessagesPanel conversationId={conversationId} onSelect={id => navigate(id ? `/messages/${encodeURIComponent(id)}` : '/messages')} compact active />
  </main>, document.body);
}
