import { useChatDock } from '@/contexts/ChatDockContext';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDirectUnread } from '@/hooks/community/useDirectMessages';
import { Button } from '@/components/ui/button';
export function InboxButton() {
  const { user } = useAuth();
  const { mode, openChat, minimizeChat } = useChatDock();
  const { data = 0 } = useDirectUnread();
  if (!user) return null;
  return <Button variant="ghost" size="icon" className="relative shrink-0" onClick={() => mode === 'open' ? minimizeChat() : openChat()} aria-expanded={mode === 'open'} aria-label={`Messages${data ? `, ${data} unread` : ''}`}><MessageCircle className="h-5 w-5" />{data > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{data > 99 ? '99+' : data}</span>}</Button>;
}
