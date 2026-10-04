import { useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  EyeOff,
  ImagePlus,
  Loader2,
  Clock,
  X,
  ListChecks,
  Music2,
  Layers,
  Tv,
  MessageSquareQuote,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getGlobalVideo, getLastSavedTime } from '@/core/player/global-video-ref';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { EmojiPicker, EmojiIcon } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import { uploadCommentMedia, type CommentAttachment } from '@/lib/commentMedia';
import { ImagePicker, type PickedImage } from '@/components/community/feed/ImagePicker';
import { validateImageFile, imageFileFromTransfer, dragHasFiles } from '@/lib/imageIntake';
import type { CommentEmbed } from '@/lib/commentEmbeds';
import type { CommentPollDraft } from '@/hooks/community/useComments';
import { usePlaylists } from '@/hooks/user/usePlaylist';
import { useUserTierLists } from '@/hooks/user/useTierLists';
import { MediaPicker, type SelectedMedia } from '@/components/community/feed/MediaPicker';

interface ComposerPayload {
  content: string;
  attachments: CommentAttachment[];
  isSpoiler: boolean;
  embeds: CommentEmbed[];
  poll: CommentPollDraft | null;
}

type PollState = { choices: string[]; days: number; hours: number; minutes: number } | null;

const POLL_DURATION = {
  days: Array.from({ length: 8 }, (_, i) => i),
  hours: Array.from({ length: 24 }, (_, i) => i),
  minutes: Array.from({ length: 60 }, (_, i) => i),
};

interface RichCommentComposerProps {
  onSubmit: (payload: ComposerPayload) => Promise<unknown> | unknown;
  submitting?: boolean;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  compact?: boolean;
  showSpoiler?: boolean;
  onCancel?: () => void;
  /** Prefill the draft (e.g. an `@mention` when replying to a reply). */
  initialContent?: string;
  /**
   * Show an "insert current time" button that stamps the on-page player's
   * position (mm:ss / h:mm:ss) into the draft. Only useful where a video is
   * present (watch/anime pages); CommentContent turns those tokens into
   * seek links. Off by default.
   */
  allowTimestamp?: boolean;
  /**
   * Show the rich-embed toolbar (share anime/manga, link a playlist / tier list /
   * community post, attach a poll) — comment parity with the community feed
   * composer. Off by default; enable on top-level comment composers.
   */
  allowEmbeds?: boolean;
  /**
   * Seed the embed slots when re-editing existing rich content (e.g. a community's
   * rules/about). Only the first embed of each kind is restored — the composer
   * holds one slot per kind. Polls/attachments are not seeded. Read once on mount.
   */
  initialEmbeds?: CommentEmbed[];
}

interface MentionCandidate {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

const MENTION_TOKEN = /@([a-zA-Z0-9_]{0,32})$/;

export function RichCommentComposer({
  onSubmit,
  submitting = false,
  placeholder = 'Share your thoughts...',
  submitLabel = 'Post Comment',
  autoFocus = false,
  compact = false,
  showSpoiler = true,
  onCancel,
  initialContent = '',
  allowTimestamp = false,
  allowEmbeds = false,
  initialEmbeds,
}: RichCommentComposerProps) {
  const { user } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [content, setContent] = useState(initialContent);
  const [attachments, setAttachments] = useState<CommentAttachment[]>([]);
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [intakeBusy, setIntakeBusy] = useState(false);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  // Rich embeds — single slot per type, assembled into the embeds[] array on
  // submit (matches the feed composer's model). Only loaded when allowEmbeds.
  // Slots are seeded once from initialEmbeds so re-editing keeps existing embeds.
  const [media, setMedia] = useState<SelectedMedia | null>(() => {
    const e = (initialEmbeds ?? []).find((x) => x.kind === 'media');
    return e && e.kind === 'media'
      ? { id: e.id, name: e.name, poster: e.poster ?? null, type: e.mediaType }
      : null;
  });
  const [playlistId, setPlaylistId] = useState<string | null>(
    () => (initialEmbeds ?? []).find((e) => e.kind === 'playlist')?.id ?? null,
  );
  const [tierlistId, setTierlistId] = useState<string | null>(
    () => (initialEmbeds ?? []).find((e) => e.kind === 'tierlist')?.id ?? null,
  );
  const [postId, setPostId] = useState<string | null>(
    () => (initialEmbeds ?? []).find((e) => e.kind === 'post')?.id ?? null,
  );
  const [poll, setPoll] = useState<PollState>(null);

  const { data: playlists = [] } = usePlaylists();
  const { data: tierlists = [] } = useUserTierLists(user?.id);
  const myPosts = useQuery({
    queryKey: ['my-recent-posts', user?.id],
    queryFn: async () => {
      if (!user) return [] as Array<{ id: string; label: string }>;
      const { data, error } = await supabase
        .from('forum_posts')
        .select('id, title, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: String(p.id),
        label: (p.title && p.title !== p.content ? p.title : p.content) || 'Untitled post',
      }));
    },
    enabled: allowEmbeds && !!user,
    staleTime: 60 * 1000,
  });

  const mentions = useQuery<MentionCandidate[]>({
    queryKey: ['mention-search', mentionQuery],
    queryFn: async () => {
      const q = (mentionQuery ?? '').trim();
      if (!q) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .ilike('username', `${q}%`)
        .not('username', 'is', null)
        .limit(6);
      if (error) throw error;
      return (data ?? []) as MentionCandidate[];
    },
    enabled: mentionQuery !== null && mentionQuery.length > 0,
    staleTime: 30 * 1000,
  });

  const detectMention = useCallback((value: string, caret: number) => {
    const before = value.slice(0, caret);
    const match = MENTION_TOKEN.exec(before);
    setMentionQuery(match ? match[1] : null);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);
    detectMention(value, e.target.selectionStart ?? value.length);
  };

  const insertMention = (candidate: MentionCandidate) => {
    if (!candidate.username) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? content.length;
    const before = content.slice(0, caret);
    const after = content.slice(caret);
    const replaced = before.replace(MENTION_TOKEN, `@${candidate.username} `);
    const next = replaced + after;
    setContent(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = replaced.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const wrapSelection = (marker: string, markerEnd = marker) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end) || 'text';
    const next = content.slice(0, start) + marker + selected + markerEnd + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + marker.length, start + marker.length + selected.length);
    });
  };

  const insertText = (text: string) => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? content.length;
    const next = content.slice(0, caret) + text + content.slice(caret);
    setContent(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = caret + text.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  // Stamp the on-page player's current position as a mm:ss / h:mm:ss token,
  // padded so CommentContent's timestamp matcher accepts it. Falls back to the
  // last saved position if the live element has gone (e.g. miniplayer).
  const insertCurrentTime = () => {
    const v = getGlobalVideo();
    const raw = v && Number.isFinite(v.currentTime) ? v.currentTime : getLastSavedTime();
    const total = Math.max(0, Math.floor(raw));
    if (!total && !v) {
      toast.error('No video is playing right now');
      return;
    }
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    // Surround with spaces so it stays a standalone token.
    const caret = textareaRef.current?.selectionStart ?? content.length;
    const needsLead = caret > 0 && !/\s$/.test(content.slice(0, caret));
    insertText(`${needsLead ? ' ' : ''}${stamp} `);
  };

  const addImageAttachment = (img: PickedImage) => {
    if (attachments.length >= 4) {
      toast.error('Up to 4 attachments per comment');
      return;
    }
    setAttachments((prev) => [...prev, { type: 'image', url: img.url, width: img.width, height: img.height }]);
  };

  const addGif = (attachment: CommentAttachment) => {
    if (attachments.length >= 4) {
      toast.error('Up to 4 attachments per comment');
      return;
    }
    setAttachments((prev) => [...prev, attachment]);
  };

  // Shared path for images arriving by drag-drop or clipboard paste — validates,
  // uploads to the comment bucket, then attaches (same result as the picker).
  const intakeImageFile = async (file: File) => {
    if (!user) { toast.error('Sign in to attach images'); return; }
    if (attachments.length >= 4) { toast.error('Up to 4 attachments per comment'); return; }
    const err = validateImageFile(file);
    if (err) { toast.error(err); return; }
    setIntakeBusy(true);
    try {
      const a = await uploadCommentMedia(file, user.id);
      setAttachments((prev) =>
        prev.length >= 4 ? prev : [...prev, { type: 'image', url: a.url, width: a.width, height: a.height }],
      );
    } catch (e) {
      toast.error('Upload failed', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setIntakeBusy(false);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Embeds / poll helpers -------------------------------------------------
  const togglePoll = () =>
    setPoll((p) => (p ? null : { choices: ['', ''], days: 1, hours: 0, minutes: 0 }));

  const pollChoices = poll?.choices.map((c) => c.trim()).filter(Boolean) ?? [];
  const pollValid = !poll || pollChoices.length >= 2;

  /** Assemble the single-slot embed picks into the bounded embeds[] array. */
  const buildEmbeds = (): CommentEmbed[] => {
    const out: CommentEmbed[] = [];
    if (media) out.push({ kind: 'media', id: media.id, name: media.name, poster: media.poster, mediaType: media.type });
    if (playlistId) out.push({ kind: 'playlist', id: playlistId });
    if (tierlistId) out.push({ kind: 'tierlist', id: tierlistId });
    if (postId) out.push({ kind: 'post', id: postId });
    return out.slice(0, 4);
  };

  const hasEmbed = !!(media || playlistId || tierlistId || postId || poll);

  const canSubmit =
    (content.trim().length > 0 || attachments.length > 0 || hasEmbed) &&
    pollValid &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (poll && !pollValid) {
      toast.error('A poll needs at least 2 choices');
      return;
    }

    let pollDraft: CommentPollDraft | null = null;
    if (poll && pollValid) {
      const totalMs = ((poll.days * 24 + poll.hours) * 60 + poll.minutes) * 60 * 1000;
      const endsAt = new Date(Date.now() + (totalMs > 0 ? totalMs : 24 * 60 * 60 * 1000)).toISOString();
      pollDraft = { options: pollChoices, endsAt };
    }

    const payload: ComposerPayload = {
      content: content.trim(),
      attachments,
      isSpoiler,
      embeds: buildEmbeds(),
      poll: pollDraft,
    };
    const result = await onSubmit(payload);
    if (result === false) return; // caller signalled failure — keep the draft
    void triggerHaptic('comment');
    setContent('');
    setAttachments([]);
    setIsSpoiler(false);
    setMentionQuery(null);
    setMedia(null);
    setPlaylistId(null);
    setTierlistId(null);
    setPostId(null);
    setPoll(null);
  };

  const toolbarButton = (icon: React.ReactNode, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {icon}
    </button>
  );

  return (
    <div
      className={cn(
        'relative space-y-2',
        compact ? 'max-md:space-y-3' : 'rounded-xl border border-border/30 bg-card/50 p-3 max-md:p-4',
        dropActive && 'ring-2 ring-primary/60',
      )}
      onDragOver={(e) => {
        if (dragHasFiles(e.dataTransfer)) { e.preventDefault(); setDropActive(true); }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropActive(false);
      }}
      onDrop={(e) => {
        if (!dragHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        setDropActive(false);
        const file = imageFileFromTransfer(e.dataTransfer);
        if (file) intakeImageFile(file);
        else toast.error('Please choose an image file');
      }}
    >
      {(dropActive || intakeBusy) && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-background/80 backdrop-blur-sm">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            {intakeBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : 'Drop image to attach'}
          </p>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5">
        {toolbarButton(<Bold className="h-4 w-4" />, 'Bold', () => wrapSelection('**'))}
        {toolbarButton(<Italic className="h-4 w-4" />, 'Italic', () => wrapSelection('*'))}
        {toolbarButton(<Strikethrough className="h-4 w-4" />, 'Strikethrough', () => wrapSelection('~~'))}
        {toolbarButton(<Code className="h-4 w-4" />, 'Code', () => wrapSelection('`'))}
        {toolbarButton(<EyeOff className="h-4 w-4" />, 'Spoiler', () => wrapSelection('||'))}
        <span className="mx-1 h-5 w-px bg-border/60" />
        <EmojiPicker
          onSelect={insertText}
          trigger={
            <button
              type="button"
              title="Emoji"
              aria-label="Emoji"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <EmojiIcon className="h-4 w-4" />
            </button>
          }
        />
        <GifPicker
          onSelect={addGif}
          trigger={
            <button
              type="button"
              title="GIF"
              aria-label="GIF"
              className="flex h-8 items-center justify-center rounded-md px-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              GIF
            </button>
          }
        />
        <ImagePicker
          userId={user?.id}
          align="start"
          uploadFile={async (f) => {
            if (!user) throw new Error('Sign in to upload');
            const a = await uploadCommentMedia(f, user.id);
            return { url: a.url, width: a.width, height: a.height };
          }}
          onSelect={addImageAttachment}
          trigger={
            <button
              type="button"
              title="Attach image"
              aria-label="Attach image"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
          }
        />
        {allowTimestamp && (
          <>
            <span className="mx-1 h-5 w-px bg-border/60" />
            {toolbarButton(<Clock className="h-4 w-4" />, 'Insert current time', insertCurrentTime)}
          </>
        )}
        {allowEmbeds && (
          <>
            <span className="mx-1 h-5 w-px bg-border/60" />
            {toolbarButton(<ListChecks className="h-4 w-4" />, 'Add a poll', togglePoll)}
            <MediaPicker
              onSelect={setMedia}
              trigger={
                <button
                  type="button"
                  title="Share anime / manga"
                  aria-label="Share anime / manga"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Tv className="h-4 w-4" />
                </button>
              }
            />
            <EmbedPicker
              icon={<Music2 className="h-4 w-4" />}
              label="Link a playlist"
              items={playlists.map((p) => ({ id: p.id, label: p.name }))}
              empty="You have no playlists yet."
              onPick={setPlaylistId}
            />
            <EmbedPicker
              icon={<Layers className="h-4 w-4" />}
              label="Link a tier list"
              items={tierlists.map((t) => ({ id: t.id, label: t.title }))}
              empty="You have no tier lists yet."
              onPick={setTierlistId}
            />
            <EmbedPicker
              icon={<MessageSquareQuote className="h-4 w-4" />}
              label="Link a community post"
              items={myPosts.data ?? []}
              empty={myPosts.isLoading ? 'Loading…' : 'You have no posts yet.'}
              onPick={setPostId}
            />
          </>
        )}
      </div>

      {/* Textarea + mention dropdown */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onKeyDown={(e) => {
            const candidates = mentions.data ?? [];
            const mentionOpen =
              mentionQuery !== null && mentionQuery.length > 0 && candidates.length > 0;
            // Enter sends (Shift+Enter = new line). While the @-mention list is
            // open, Enter picks the top match instead of submitting.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (mentionOpen) { insertMention(candidates[0]); return; }
              handleSubmit();
              return;
            }
            if (e.key === 'Escape') {
              if (mentionOpen) { e.preventDefault(); setMentionQuery(null); return; }
              if (onCancel) { e.preventDefault(); onCancel(); }
            }
          }}
          onPaste={(e) => {
            const file = imageFileFromTransfer(e.clipboardData);
            if (file) { e.preventDefault(); intakeImageFile(file); }
          }}
          className={cn('bg-muted/50 text-sm leading-relaxed', compact ? 'min-h-[76px] max-md:px-3 max-md:py-2.5' : 'min-h-[112px] max-md:px-3 max-md:py-3')}
        />
        {mentionQuery !== null && mentionQuery.length > 0 && (mentions.data?.length ?? 0) > 0 && (
          <div className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg">
            {mentions.data!.map((c) => (
              <button
                key={c.user_id}
                type="button"
                onClick={() => insertMention(c)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={c.avatar_url || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {(c.display_name || c.username || 'U')[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate font-medium">{c.display_name || c.username}</span>
                <span className="truncate text-xs text-muted-foreground">@{c.username}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div key={`${a.url}-${i}`} className="group relative">
              <img
                src={a.preview || a.url}
                alt={a.title || 'attachment'}
                className="h-20 w-20 rounded-lg object-contain bg-muted/40"
              />
              {a.type === 'gif' && (
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9px] font-bold text-white">
                  GIF
                </span>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                aria-label="Remove attachment"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Poll editor */}
      {poll && (
        <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-3">
          <div className="space-y-2">
            {poll.choices.map((choice, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={choice}
                  maxLength={80}
                  placeholder={`Choice ${i + 1}`}
                  onChange={(e) =>
                    setPoll((p) => (p ? { ...p, choices: p.choices.map((c, idx) => (idx === i ? e.target.value : c)) } : p))
                  }
                  className="h-9 bg-muted/40 text-sm"
                />
                {poll.choices.length > 2 && (
                  <button
                    type="button"
                    aria-label="Remove choice"
                    onClick={() => setPoll((p) => (p ? { ...p, choices: p.choices.filter((_, idx) => idx !== i) } : p))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {i === poll.choices.length - 1 && poll.choices.length < 4 && (
                  <button
                    type="button"
                    aria-label="Add choice"
                    onClick={() => setPoll((p) => (p ? { ...p, choices: [...p.choices, ''] } : p))}
                    className="text-primary hover:text-primary/80"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Poll length</p>
            <div className="grid grid-cols-3 gap-2">
              {(['days', 'hours', 'minutes'] as const).map((unit) => (
                <div key={unit}>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground/70">{unit}</label>
                  <Select value={String(poll[unit])} onValueChange={(v) => setPoll((p) => (p ? { ...p, [unit]: Number(v) } : p))}>
                    <SelectTrigger className="h-9 bg-muted/40 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{POLL_DURATION[unit].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => setPoll(null)} className="text-xs font-medium text-destructive hover:underline">
            Remove poll
          </button>
        </div>
      )}

      {/* Embed chips */}
      {(media || playlistId || tierlistId || postId) && (
        <div className="flex flex-wrap gap-2">
          {media && <EmbedChip label={`${media.type}: ${media.name}`} onClear={() => setMedia(null)} />}
          {playlistId && <EmbedChip label={`Playlist: ${playlists.find((p) => p.id === playlistId)?.name ?? ''}`} onClear={() => setPlaylistId(null)} />}
          {tierlistId && <EmbedChip label={`Tier list: ${tierlists.find((t) => t.id === tierlistId)?.title ?? ''}`} onClear={() => setTierlistId(null)} />}
          {postId && <EmbedChip label={`Post: ${(myPosts.data ?? []).find((p) => p.id === postId)?.label ?? 'linked'}`} onClear={() => setPostId(null)} />}
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showSpoiler ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={isSpoiler} onCheckedChange={(c) => setIsSpoiler(c as boolean)} />
            Contains spoilers
          </label>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button size="sm" variant="outline" onClick={onCancel} type="button">
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit} type="button">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Toolbar popover listing the user's own playlists / tier lists / posts to link. */
function EmbedPicker({
  icon,
  label,
  items,
  empty,
  onPick,
}: {
  icon: React.ReactNode;
  label: string;
  items: Array<{ id: string; label: string }>;
  empty: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="px-2 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        {items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onPick(item.id); setOpen(false); }}
                className="w-full truncate rounded-lg px-2 py-2 text-left text-sm hover:bg-accent"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Removable chip summarising a chosen embed. */
function EmbedChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
      <span className="max-w-[180px] truncate">{label}</span>
      <button type="button" aria-label="Remove" onClick={onClear} className="hover:text-primary/70">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
