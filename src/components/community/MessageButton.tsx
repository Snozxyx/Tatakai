import { useState } from 'react';
import { useChatDock } from '@/contexts/ChatDockContext';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
export function MessageButton({ userId, onOpened }: { userId?: string | null; onOpened?: () => void }) {
  const { user } = useAuth();
  const { available, openChat } = useChatDock();
  const [pending, setPending] = useState(false);
  if (!available || !user || !userId || user.id === userId) return null;
  return <Button variant="outline" size="sm" disabled={pending} onClick={async () => {
    setPending(true);
    try {
      const { data, error } = await (supabase as any).rpc('start_direct_conversation', { p_recipient: userId });
      if (error) throw error;
      openChat(data);
      onOpened?.();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Messaging is unavailable.'); }
    finally { setPending(false); }
  }}><MessageCircle className="mr-1.5 h-4 w-4" />{pending ? 'Opening…' : 'Message'}</Button>;
}
