import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Flag, Loader2, ShieldBan } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDirectConversations, useDirectMessageHistory } from '@/hooks/community/useDirectMessages';
import { resolveDirectAttachments, serializeDirectAttachments, uploadDirectMedia, type DirectConversation, type DirectMessage } from '@/lib/directMessages';
import { randomUUID } from '@/lib/uuid';
import { RichCommentComposer, type ComposerPayload } from '@/components/comments/RichCommentComposer';
import { CommentContent } from '@/components/comments/CommentContent';
import { CommentAttachments } from '@/components/comments/CommentAttachments';
import { CommentEmbeds } from '@/components/comments/CommentEmbeds';
import { StorageUsageBar } from '@/components/media/StorageUsageBar';
import { ProfilePresence } from '@/components/profile/ProfilePresence';
import { ProfileConversationTheme } from '@/components/profile/themes/ProfileConversationTheme';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ReportModal } from '@/components/ui/ReportModal';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
const db = supabase as any;

function MessageMedia({ message }: { message: DirectMessage }) {
  const { user } = useAuth();
  const { data, isError } = useQuery({
    queryKey: ['direct-media', user?.id, message.id],
    queryFn: () => resolveDirectAttachments(message.attachments),
    staleTime: 40 * 60_000, refetchInterval: 45 * 60_000,
  });
  if (isError) return <p className="text-xs text-muted-foreground">Attachments couldn’t load.</p>;
  return <><CommentAttachments attachments={data?.filter(a => a.url)} allowBookmark={false} />{data?.some(a => !a.url) && <p className="mt-2 text-xs text-muted-foreground">An attachment is no longer available.</p>}</>;
}

function ConversationView({ conversation, active, onBack }: { conversation: DirectConversation; active: boolean; onBack: () => void }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const confirm = useConfirm();
  const history = useDirectMessageHistory(conversation.id, active);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [now, setNow] = useState(Date.now());
  const sentinel = useRef<HTMLDivElement>(null);
  const sentRead = useRef(0);
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  const lastTyping = useRef(0);
  const uploads = useRef(new Set<string>());
  const mounted = useRef(true);
  const otherId = conversation.user_a === user!.id ? conversation.user_b : conversation.user_a;
  const ownA = conversation.user_a === user!.id;
  const accepted = conversation.status === 'accepted';
  const incoming = conversation.status === 'pending' && conversation.requested_by !== user!.id;
  const messages = useMemo(() => [...new Map((history.data?.pages.flat() ?? []).map(m => [m.id, m])).values()].sort((a, b) => a.seq - b.seq), [history.data]);
  const latest = messages.at(-1)?.seq ?? 0;
  const otherRead = ownA ? conversation.read_b : conversation.read_a;
  const otherTyping = Date.parse((ownA ? conversation.typing_b_until : conversation.typing_a_until) ?? '') > now;
  const blocked = useQuery({ queryKey: ['direct-block', user?.id, otherId], queryFn: async () => {
    const { data, error } = await db.from('user_blocks').select('blocked_id').eq('blocker_id', user!.id).eq('blocked_id', otherId).maybeSingle();
    if (error) throw error;
    return !!data;
  } });
  const peer = useQuery({ queryKey: ['direct-peer', otherId], queryFn: async () => {
    const { data, error } = await supabase.from('profiles').select('username,display_name,avatar_url').eq('user_id', otherId).maybeSingle();
    if (error) throw error;
    return data;
  } });
  const name = peer.data?.display_name || peer.data?.username || 'Member';
  useEffect(() => {
    mounted.current = true;
    const pendingUploads = uploads.current;
    return () => {
      mounted.current = false;
      const paths = [...pendingUploads];
      pendingUploads.clear();
      if (paths.length) void supabase.storage.from('direct-media').remove(paths);
    };
  }, []);
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['direct-conversations', user?.id] });
    void cache.invalidateQueries({ queryKey: ['direct-unread', user?.id] });
  };
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setAtBottom(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (atBottom) sentinel.current?.scrollIntoView({ block: 'nearest' });
  }, [latest, atBottom]);
  useEffect(() => {
    const read = () => {
      if (!active || !accepted || !atBottom || !latest || sentRead.current >= latest || document.visibilityState !== 'visible' || !document.hasFocus()) return;
      sentRead.current = latest;
      void db.rpc('update_direct_presence', { p_conversation: conversation.id, p_read_seq: latest }).then(({ error }: any) => {
        if (error) sentRead.current = 0;
        else void cache.invalidateQueries({ queryKey: ['direct-unread', user?.id] });
      });
    };
    read();
    document.addEventListener('visibilitychange', read); window.addEventListener('focus', read);
    return () => { document.removeEventListener('visibilitychange', read); window.removeEventListener('focus', read); };
  }, [active, accepted, atBottom, latest, conversation.id, cache, user?.id]);
  const typing = useCallback((content: string) => {
    if (!active || !accepted || document.visibilityState !== 'visible') return;
    if (content && Date.now() - lastTyping.current < 2500) return;
    lastTyping.current = Date.now();
    void db.rpc('update_direct_presence', { p_conversation: conversation.id, p_typing: !!content });
  }, [active, accepted, conversation.id]);
  useEffect(() => {
    if (!active && accepted) void db.rpc('update_direct_presence', { p_conversation: conversation.id, p_typing: false });
  }, [active, accepted, conversation.id]);
  const submit = async (payload: ComposerPayload) => {
    setSending(true);
    const fingerprint = JSON.stringify(payload);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, id: randomUUID() };
    try {
      const { error } = await db.rpc('send_direct_message', { p_conversation: conversation.id, p_id: retry.current.id, p_content: payload.content,
        p_attachments: serializeDirectAttachments(payload.attachments), p_embeds: payload.embeds });
      if (error) throw error;
      for (const attachment of payload.attachments) if (attachment.storagePath) uploads.current.delete(attachment.storagePath);
      retry.current = null;
      await cache.invalidateQueries({ queryKey: ['direct-messages', user?.id, conversation.id] });
      refresh();
      requestAnimationFrame(() => sentinel.current?.scrollIntoView({ block: 'nearest' }));
      return true;
    } catch (error: any) { toast.error(error.message || 'Couldn’t send your message. Your draft is still here.'); return false; }
    finally { setSending(false); }
  };
  const respond = async (accept: boolean) => {
    const { error } = await db.rpc('respond_direct_conversation', { p_conversation: conversation.id, p_accept: accept });
    if (error) toast.error(error.message); else refresh();
  };
  return <ProfileConversationTheme userId={otherId}><div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="messages-conversation-header flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
      <div className="flex min-w-0 flex-1 items-center gap-3"><Button variant="ghost" size="icon" className="messages-back shrink-0" aria-label="Back to conversations" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <Avatar><AvatarImage src={peer.data?.avatar_url || undefined} /><AvatarFallback>{name[0]}</AvatarFallback></Avatar>
        <div className="min-w-0"><Link className="block truncate font-semibold hover:underline" to={peer.data?.username ? `/@${peer.data.username}` : '/community'}>{name}</Link><ProfilePresence userId={otherId} enabled={active} /></div>
      </div>
      <Button variant="ghost" size="sm" disabled={blocked.isLoading} onClick={async () => {
        if (!blocked.data && !await confirm({ title: `Block ${name}?`, description: 'Neither of you will be able to send messages to the other.', confirmLabel: 'Block' })) return;
        const { error } = blocked.data ? await db.from('user_blocks').delete().eq('blocker_id', user!.id).eq('blocked_id', otherId) : await db.from('user_blocks').insert({ blocker_id: user!.id, blocked_id: otherId });
        if (error) toast.error(error.message); else { await blocked.refetch(); refresh(); }
      }}><ShieldBan className="mr-1.5 h-4 w-4" />{blocked.data ? 'Unblock' : 'Block'}</Button>
    </div>
    <div className="messages-history min-h-0 flex-1 overflow-y-auto p-4" role="log" aria-label="Private conversation">
      {history.hasNextPage && <Button variant="ghost" className="mb-4" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>Load earlier messages</Button>}
      {history.isLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading messages" /> : history.isError ? <Button variant="outline" onClick={() => void history.refetch()}>Retry loading messages</Button> : !messages.length ? <p className="py-8 text-center text-sm text-muted-foreground">{accepted ? 'Send the first message.' : 'Introduce yourself with a short message request.'}</p> : null}
      <ol className="space-y-4">{messages.map(message => {
        const mine = message.sender_id === user!.id;
        return <li key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}><article className={cn('min-w-0 max-w-[90%] rounded-xl p-3 md:max-w-[80%]', mine ? 'bg-primary/15' : 'bg-muted/50')}>
          <CommentContent content={message.content} />
          {!!message.attachments.length && <MessageMedia message={message} />}
          <CommentEmbeds embeds={message.embeds} />
          <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-muted-foreground"><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
            {mine && accepted && <span>{otherRead >= message.seq ? 'Read' : 'Sent'}</span>}
            {!mine && <button type="button" onClick={() => setReport(message.id)} aria-label="Report message" className="rounded p-1 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><Flag className="h-3 w-3" /></button>}
          </div>
        </article></li>;
      })}</ol><div ref={sentinel} className="h-px" />
    </div>
    <div className="messages-composer border-t border-border p-3">
      {accepted && otherTyping && <p className="mb-2 text-xs text-muted-foreground" role="status">{name} is typing…</p>}
      {blocked.data ? <p className="text-sm text-muted-foreground">You blocked this person. Unblock them to resume messaging.</p>
        : incoming ? <div className="space-y-3"><p className="text-sm text-muted-foreground">Accept this request to reply and share media. Read receipts and typing stay hidden until you accept.</p><div className="flex gap-2"><Button onClick={() => void respond(true)}>Accept</Button><Button variant="outline" onClick={() => void respond(false)}>Decline</Button></div></div>
          : conversation.status === 'declined' ? <p className="text-sm text-muted-foreground">This message request was declined.</p>
            : !accepted && messages.length ? <p className="text-sm text-muted-foreground">Your request has been sent. You can send more after it’s accepted.</p>
              : <><RichCommentComposer key={conversation.id} onSubmit={submit} submitting={sending} compact maxLength={2000} showSpoiler={false} allowMedia={accepted} allowEmbeds={accepted} allowPolls={false} allowMentions={false} onContentChange={typing}
                placeholder={accepted ? 'Write a private message…' : 'Write a message request…'} submitLabel={accepted ? 'Send' : 'Send request'} uploadMedia={async file => {
                  const attachment = await uploadDirectMedia(file, user!.id, conversation.id);
                  if (attachment.storagePath) {
                    if (!mounted.current) { await supabase.storage.from('direct-media').remove([attachment.storagePath]); throw new Error('The conversation was closed.'); }
                    uploads.current.add(attachment.storagePath);
                  }
                  void cache.invalidateQueries({ queryKey: ['storage-usage', user?.id] });
                  return attachment;
                }} />{accepted && <div className="messages-storage"><StorageUsageBar /></div>}</>}
    </div>
    <ReportModal isOpen={!!report} onClose={() => setReport(null)} targetType="direct_message" targetId={report || ''} targetName="private message" />
  </div></ProfileConversationTheme>;
}

export function MessagesPanel({ conversationId, onSelect, compact = false, active = true }: { conversationId?: string; onSelect: (id?: string) => void; compact?: boolean; active?: boolean }) {
  const { user } = useAuth();
  const conversations = useDirectConversations(active);
  const [tab, setTab] = useState<'chats' | 'requests'>('chats');
  const selected = conversations.data?.find(c => c.id === conversationId);
  const rows = (conversations.data ?? []).filter(c => tab === 'requests' ? c.status === 'pending' && c.requested_by !== user?.id : c.status !== 'declined' && !(c.status === 'pending' && c.requested_by !== user?.id));
  const ids = [...new Set((conversations.data ?? []).map(c => c.user_a === user?.id ? c.user_b : c.user_a))];
  const profiles = useQuery({ queryKey: ['direct-peers', user?.id, ids.join(',')], enabled: !!ids.length, queryFn: async () => {
    const { data, error } = await supabase.from('profiles').select('user_id,username,display_name,avatar_url').in('user_id', ids);
    if (error) throw error;
    return data ?? [];
  } });
  const requests = conversations.data?.filter(c => c.status === 'pending' && c.requested_by !== user?.id).length ?? 0;
  return <div className="messages-panel" data-compact={compact} data-selected={!!conversationId}>
      <aside className="messages-panel-sidebar" aria-label="Conversations">
        <div className="flex gap-2 border-b border-border p-3"><Button size="sm" variant={tab === 'chats' ? 'default' : 'ghost'} onClick={() => setTab('chats')}>Chats</Button><Button size="sm" variant={tab === 'requests' ? 'default' : 'ghost'} onClick={() => setTab('requests')}>Requests{requests ? ` (${requests})` : ''}</Button></div>
        {conversations.isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading conversations…</p> : conversations.isError ? <div className="space-y-3 p-4"><p className="text-sm text-muted-foreground">Messages couldn’t load.</p><Button variant="outline" onClick={() => void conversations.refetch()}>Retry</Button></div> : !rows.length ? <p className="p-4 text-sm text-muted-foreground">{tab === 'requests' ? 'No message requests.' : 'No conversations yet. Open someone’s profile and choose Message.'}</p> : <ul>{rows.map(c => {
          const peerId = c.user_a === user?.id ? c.user_b : c.user_a;
          const peer = profiles.data?.find(p => p.user_id === peerId);
          return <li key={c.id}><button type="button" onClick={() => onSelect(c.id)} aria-current={selected?.id === c.id ? 'page' : undefined} className={cn('flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50', selected?.id === c.id && 'bg-muted')}><Avatar className="h-9 w-9"><AvatarImage src={peer?.avatar_url || undefined} /><AvatarFallback>{(peer?.display_name || peer?.username || '?')[0]}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-semibold">{peer?.display_name || peer?.username || 'Member'}</p><p className="text-xs text-muted-foreground">{c.status === 'pending' ? 'Message request' : 'Private conversation'}</p></div></button></li>;
        })}</ul>}
      </aside>
      <section className="messages-panel-main" aria-label="Selected conversation">{selected ? <ConversationView key={selected.id} conversation={selected} active={active} onBack={() => onSelect(undefined)} /> : <p className="m-auto p-6 text-center text-sm text-muted-foreground">{conversationId ? conversations.isLoading ? 'Loading conversation…' : 'This conversation is unavailable.' : 'Choose a conversation to start chatting.'}</p>}</section>
  </div>;
}
