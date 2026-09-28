import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Image as ImageIcon,
  Film,
  ListChecks,
  Music2,
  Layers,
  Radio,
  Users,
  AlertTriangle,
  X,
  Plus,
} from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { validateImageFile, imageFileFromTransfer, dragHasFiles } from '@/lib/imageIntake';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { uploadUserMedia } from '@/lib/userMedia';
import { getProxiedImageUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunityRulesGate } from '@/components/community/CommunityRulesGate';
import { useCreateForumPost } from '@/hooks/community/useForum';
import { useCreatePostPoll } from '@/hooks/community/usePostPolls';
import { mapUgcError } from '@/lib/ugcErrors';
import { usePlaylists } from '@/hooks/user/usePlaylist';
import { useUserTierLists } from '@/hooks/user/useTierLists';
import { useUserWatchRooms } from '@/hooks/media/useWatchRoom';
import { useCommunities } from '@/hooks/community/useCommunities';
import { GifPicker } from '@/components/comments/GifPicker';
import { MediaPicker, type SelectedMedia } from './MediaPicker';
import { ImagePicker } from './ImagePicker';
import { extractHashtags, extractMentions } from './richText';
import { RichEditor, type RichEditorHandle } from './RichEditor';
import { Tv } from 'lucide-react';

type PollChoice = { text: string; image: string | null };
type PollState = { choices: PollChoice[]; days: number; hours: number; minutes: number } | null;

const DURATION = {
  days: Array.from({ length: 8 }, (_, i) => i),
  hours: Array.from({ length: 24 }, (_, i) => i),
  minutes: Array.from({ length: 60 }, (_, i) => i),
};
const MAX_IMAGES = 4;

function deriveTitle(content: string, fallback: string): string {
  const firstLine = content.trim().split('\n')[0] || '';
  return firstLine ? firstLine.slice(0, 120) : fallback;
}

/** Pull mention user_ids + hashtags out of the tiptap HTML (reliable — driven
 *  by the editor's mention nodes rather than regex). */
function extractFromHtml(html: string): { userIds: string[]; tags: string[] } {
  const userIds = new Set<string>();
  const tags = new Set<string>();
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('[data-mention]').forEach((el) => {
      const id = el.getAttribute('data-user-id');
      if (id) userIds.add(id);
    });
    doc.querySelectorAll('[data-hashtag]').forEach((el) => {
      const t = (el.getAttribute('data-tag') || '').toLowerCase();
      if (t) tags.add(t);
    });
    // Also catch hashtags typed inline without picking a suggestion.
    extractHashtags(doc.body.textContent || '').forEach((t) => tags.add(t));
  } catch { /* non-browser / parse fail */ }
  return { userIds: [...userIds], tags: [...tags] };
}

/** Persist #tags / @mentions after a post is created, and grow the author's
 *  tag interests so their For You feed learns from what they post. */
async function persistTagsAndMentions(postId: string, html: string, plain: string) {
  const db = supabase as any;
  const { userIds, tags } = extractFromHtml(html);

  if (tags.length) {
    try {
      await db.from('post_hashtags').insert(tags.map((tag) => ({ post_id: postId, tag })));
    } catch { /* pre-migration */ }
    try {
      await db.rpc('bump_tag_interest', { p_tags: tags });
    } catch { /* pre-migration / rpc missing */ }
  }

  // Notify explicitly-mentioned users (we already hold their ids from the node).
  for (const uid of userIds) {
    try { await db.rpc('notify_mention', { target_user_id: uid, p_post_id: postId }); } catch { /* rpc missing */ }
  }

  // Fallback: usernames typed without selecting a suggestion → look up + notify.
  const typed = extractMentions(plain);
  if (typed.length) {
    try {
      const { data: users } = await supabase.from('profiles').select('user_id, username').in('username', typed);
      for (const u of users || []) {
        if (userIds.includes(u.user_id)) continue;
        await db.rpc('notify_mention', { target_user_id: u.user_id, p_post_id: postId });
      }
    } catch { /* pre-migration / rpc missing */ }
  }
}

export function PostComposer({ onPosted, defaultCommunityId, defaultMedia }: { onPosted?: () => void; defaultCommunityId?: string; defaultMedia?: SelectedMedia }) {
  const { user, profile } = useAuth();
  const ensureAgreed = useCommunityRulesGate();
  const createPost = useCreateForumPost();
  const createPoll = useCreatePostPoll();

  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [poll, setPoll] = useState<PollState>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [tierlistId, setTierlistId] = useState<string | null>(null);
  const [watchRoomId, setWatchRoomId] = useState<string | null>(null);
  const [communityId, setCommunityId] = useState<string | null>(defaultCommunityId ?? null);
  const [media, setMedia] = useState<SelectedMedia | null>(defaultMedia ?? null);
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const editorRef = useRef<RichEditorHandle>(null);
  const pollImgRef = useRef<HTMLInputElement>(null);
  const pollImgIdx = useRef<number>(-1);

  const { data: playlists = [] } = usePlaylists();
  const { data: tierlists = [] } = useUserTierLists(user?.id);
  const { data: rooms = [] } = useUserWatchRooms();
  const { data: communities = [] } = useCommunities();

  if (!user) return null;

  const reset = () => {
    setContent('');
    setTitle('');
    editorRef.current?.clear();
    setPoll(null);
    setGifUrl(null);
    setImageUrls([]);
    setPlaylistId(null);
    setTierlistId(null);
    setWatchRoomId(null);
    setCommunityId(defaultCommunityId ?? null);
    setMedia(defaultMedia ?? null);
    setIsSpoiler(false);
  };

  const handleImagePick = (url: string) => {
    if (imageUrls.length >= MAX_IMAGES) {
      toast.error(`Up to ${MAX_IMAGES} images per post`);
      return;
    }
    setGifUrl(null);
    setImageUrls((prev) => [...prev, url]);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const { url } = await uploadUserMedia(file, user.id, 'forum_image');
    return url;
  };

  const intakeImageFile = async (file: File) => {
    if (imageUrls.length >= MAX_IMAGES) { toast.error(`Up to ${MAX_IMAGES} images per post`); return; }
    const err = validateImageFile(file);
    if (err) { toast.error(err); return; }
    setIntakeBusy(true);
    try {
      const url = await uploadImage(file);
      setGifUrl(null);
      setImageUrls((prev) => (prev.length >= MAX_IMAGES ? prev : [...prev, url]));
    } catch (e) {
      toast.error('Upload failed', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setIntakeBusy(false);
    }
  };

  const handlePollImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const idx = pollImgIdx.current;
    if (pollImgRef.current) pollImgRef.current.value = '';
    if (!file || idx < 0) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Each image must be under 5MB'); return; }
    try {
      const url = await uploadImage(file);
      setPoll((p) => (p ? { ...p, choices: p.choices.map((c, i) => (i === idx ? { ...c, image: url } : c)) } : p));
    } catch (err) {
      toast.error('Failed to upload image', { description: err instanceof Error ? err.message : undefined });
    }
  };

  const togglePoll = () =>
    setPoll((p) => (p ? null : { choices: [{ text: '', image: null }, { text: '', image: null }], days: 1, hours: 0, minutes: 0 }));

  const pollOptions = poll?.choices.map((c) => ({ text: c.text.trim(), image: c.image })).filter((c) => c.text) ?? [];
  const pollValid = !poll || pollOptions.length >= 2;
  const hasContent = content.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length > 0;
  const hasAttachment = !!(poll || gifUrl || imageUrls.length || playlistId || tierlistId || watchRoomId || media);
  const canPost = (hasContent || hasAttachment) && pollValid && !submitting;

  const handleSubmit = async () => {
    if (!canPost) return;
    if (!(await ensureAgreed())) return;
    setSubmitting(true);
    try {
      const html = editorRef.current?.getHTML() ?? content;
      const plain = (editorRef.current?.getText() ?? html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

      const metadata: Record<string, unknown> = {};
      if (gifUrl) metadata.gif_url = gifUrl;
      if (imageUrls.length) metadata.images = imageUrls;
      if (watchRoomId) metadata.watch_room_id = watchRoomId;
      if (media) metadata.media_type = media.type;

      const content_type = poll ? 'poll' : imageUrls.length || gifUrl ? 'image' : 'text';
      const finalTitle = title.trim() || deriveTitle(
        plain,
        poll ? 'Poll' : media ? `Shared ${media.name}` : playlistId ? 'Shared a playlist' : tierlistId ? 'Shared a tier list' : watchRoomId ? 'Watch Together lobby' : 'Post',
      );

      const created = await createPost.mutateAsync({
        title: finalTitle,
        content: hasContent ? html : '',
        content_type,
        image_url: imageUrls[0],
        is_spoiler: isSpoiler,
        ...(Object.keys(metadata).length ? { metadata } : {}),
        playlist_id: playlistId || undefined,
        tierlist_id: tierlistId || undefined,
        ...(media ? { anime_id: media.id, anime_name: media.name, anime_poster: media.poster || undefined } : {}),
        ...(communityId ? ({ community_id: communityId } as any) : {}),
      } as any);

      if (poll && created?.id) {
        const totalMs = ((poll.days * 24 + poll.hours) * 60 + poll.minutes) * 60 * 1000;
        const endsAt = new Date(Date.now() + (totalMs > 0 ? totalMs : 24 * 60 * 60 * 1000)).toISOString();
        await createPoll.mutateAsync({ postId: created.id, question: finalTitle, options: pollOptions, endsAt });
      }

      if (created?.id) await persistTagsAndMentions(created.id, html, plain);

      toast.success(imageUrls.length ? 'Post submitted for approval' : 'Posted', {
        description: imageUrls.length ? 'Posts with images require admin approval before they appear.' : undefined,
      });
      reset();
      onPosted?.();
    } catch (err) {
      const friendly = mapUgcError(err instanceof Error ? err : null);
      toast.error(friendly || 'Failed to post', {
        description: friendly ? undefined : err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const ToolbarIcon = ({ icon: Icon, label, active, onClick }: { icon: any; label: string; active?: boolean; onClick: () => void }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn('flex h-9 w-9 items-center justify-center rounded-full transition-colors', active ? 'bg-primary/20 text-primary' : 'text-primary/70 hover:bg-primary/10 hover:text-primary')}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );

  return (
    <GlassPanel
      className={cn('relative overflow-hidden p-4 transition-shadow', dropActive && 'ring-2 ring-primary/60')}
      onDragOver={(e) => {
        if (!dragHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropActive(false);
      }}
      onDrop={(e) => {
        if (!dragHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        setDropActive(false);
        const file = imageFileFromTransfer(e.dataTransfer);
        if (file) intakeImageFile(file);
      }}
    >
      {(dropActive || intakeBusy) && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-background/80 backdrop-blur-sm">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            {intakeBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : 'Drop image to attach'}
          </p>
        </div>
      )}
      <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/10 blur-[70px]" />
      <div className="relative flex gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={profile?.avatar_url || undefined} />
          <AvatarFallback>{(profile?.display_name || profile?.username || 'U')[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            {profile?.username && <p className="text-sm font-display font-bold tracking-tight text-muted-foreground">@{profile.username}</p>}
            {communityId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                in {communities.find((c) => c.id === communityId)?.name}
                <button type="button" aria-label="Clear community" onClick={() => setCommunityId(null)}><X className="h-3 w-3" /></button>
              </span>
            )}
          </div>

          <input
            type="text"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a title (optional)"
            className="mb-1.5 w-full bg-transparent text-[17px] font-display font-bold tracking-tight text-white placeholder:text-muted-foreground/40 focus:outline-none"
          />

          <RichEditor
            ref={editorRef}
            placeholder="What’s happening?"
            minHeight="52px"
            className="text-[15px] leading-relaxed"
            onChange={setContent}
            onSubmit={handleSubmit}
            onPasteFiles={(files) => intakeImageFile(files[0])}
          />

          {/* Formatting hint */}
          <p className="mt-1 text-[11px] text-muted-foreground/50">
            Add an optional title, then a description · select text to format · type <span className="font-semibold text-primary/70">@</span> to mention · <span className="font-semibold text-primary/70">#</span> to tag
          </p>

          {/* Poll editor */}
          {poll && (
            <div className="mt-2 space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3">
              <div className="space-y-2">
                {poll.choices.map((choice, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {choice.image ? (
                      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-white/10">
                        <img src={getProxiedImageUrl(choice.image)} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          aria-label="Remove choice image"
                          onClick={() => setPoll((p) => (p ? { ...p, choices: p.choices.map((c, idx) => (idx === i ? { ...c, image: null } : c)) } : p))}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                        >
                          <X className="h-4 w-4 text-white" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label="Add choice image"
                        onClick={() => { pollImgIdx.current = i; pollImgRef.current?.click(); }}
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-muted-foreground hover:text-primary"
                      >
                        <ImageIcon className="h-4 w-4" />
                      </button>
                    )}
                    <Input
                      value={choice.text}
                      maxLength={80}
                      placeholder={`Choice ${i + 1}`}
                      onChange={(e) => setPoll((p) => (p ? { ...p, choices: p.choices.map((c, idx) => (idx === i ? { ...c, text: e.target.value } : c)) } : p))}
                      className="h-10 rounded-xl bg-white/[0.03] border-white/10"
                    />
                    {poll.choices.length > 2 && (
                      <button type="button" aria-label="Remove choice" onClick={() => setPoll((p) => (p ? { ...p, choices: p.choices.filter((_, idx) => idx !== i) } : p))} className="text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {i === poll.choices.length - 1 && poll.choices.length < 4 && (
                      <button type="button" aria-label="Add choice" onClick={() => setPoll((p) => (p ? { ...p, choices: [...p.choices, { text: '', image: null }] } : p))} className="text-primary hover:text-primary/80">
                        <Plus className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-2 text-sm font-display font-bold tracking-tight">Poll length</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['days', 'hours', 'minutes'] as const).map((unit) => (
                    <div key={unit}>
                      <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground/70">{unit}</label>
                      <Select value={String(poll[unit])} onValueChange={(v) => setPoll((p) => (p ? { ...p, [unit]: Number(v) } : p))}>
                        <SelectTrigger className="h-10 rounded-xl bg-white/[0.03] border-white/10"><SelectValue /></SelectTrigger>
                        <SelectContent>{DURATION[unit].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setPoll(null)} className="text-sm font-medium text-destructive hover:underline">Remove poll</button>
            </div>
          )}

          {/* Media preview */}
          {(imageUrls.length > 0 || gifUrl) && (
            <div className={cn('mt-2 gap-1.5', gifUrl ? '' : 'grid', !gifUrl && imageUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
              {gifUrl ? (
                <div className="relative overflow-hidden rounded-2xl border border-white/[0.06]">
                  <img src={getProxiedImageUrl(gifUrl)} alt="gif" className="max-h-80 w-full object-contain bg-black/20" />
                  <button type="button" aria-label="Remove" onClick={() => setGifUrl(null)} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                imageUrls.map((src, i) => (
                  <div key={i} className="relative overflow-hidden rounded-2xl border border-white/[0.06]">
                    <img src={getProxiedImageUrl(src)} alt="preview" className="h-44 w-full object-cover" />
                    <button type="button" aria-label="Remove image" onClick={() => setImageUrls((p) => p.filter((_, idx) => idx !== i))} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"><X className="h-4 w-4" /></button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Attachment chips */}
          {(playlistId || tierlistId || watchRoomId || media) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {playlistId && <AttachChip label={`Playlist: ${playlists.find((p) => p.id === playlistId)?.name ?? ''}`} onClear={() => setPlaylistId(null)} />}
              {tierlistId && <AttachChip label={`Tier list: ${tierlists.find((t) => t.id === tierlistId)?.title ?? ''}`} onClear={() => setTierlistId(null)} />}
              {watchRoomId && <AttachChip label={`Lobby: ${rooms.find((r) => r.id === watchRoomId)?.name ?? ''}`} onClear={() => setWatchRoomId(null)} />}
              {media && <AttachChip label={`${media.type}: ${media.name}`} onClear={() => setMedia(null)} />}
            </div>
          )}

          {/* Toolbar */}
          <div className="mt-3 flex items-center gap-0.5 border-t border-white/[0.05] pt-3">
            <ImagePicker
              userId={user.id}
              uploadFile={async (f) => ({ url: await uploadImage(f) })}
              onSelect={(img) => handleImagePick(img.url)}
              trigger={<span><ToolbarIcon icon={ImageIcon} label="Image" active={imageUrls.length > 0} onClick={() => {}} /></span>}
            />
            <GifPicker onSelect={(att) => { setImageUrls([]); setGifUrl(att.url); }} trigger={<span><ToolbarIcon icon={Film} label="GIF" active={!!gifUrl} onClick={() => {}} /></span>} />
            <ToolbarIcon icon={ListChecks} label="Poll" active={!!poll} onClick={togglePoll} />
            <PickerPopover icon={Music2} label="Playlist" active={!!playlistId} items={playlists.map((p) => ({ id: p.id, label: p.name }))} empty="You have no playlists yet." onPick={setPlaylistId} />
            <PickerPopover icon={Layers} label="Tier list" active={!!tierlistId} items={tierlists.map((t) => ({ id: t.id, label: t.title }))} empty="You have no tier lists yet." onPick={setTierlistId} />
            <PickerPopover icon={Radio} label="Watch Together lobby" active={!!watchRoomId} items={rooms.map((r) => ({ id: r.id, label: r.name }))} empty="You have no active lobbies." onPick={setWatchRoomId} />
            <PickerPopover icon={Users} label="Post to community" active={!!communityId} items={communities.map((c) => ({ id: c.id, label: c.name }))} empty="No communities yet." onPick={setCommunityId} />
            <MediaPicker onSelect={setMedia} trigger={<span><ToolbarIcon icon={Tv} label="Share anime / manga" active={!!media} onClick={() => {}} /></span>} />
            <ToolbarIcon icon={AlertTriangle} label="Mark spoiler" active={isSpoiler} onClick={() => setIsSpoiler((v) => !v)} />

            <Button onClick={handleSubmit} disabled={!canPost} className="ml-auto h-9 rounded-full px-5 text-sm font-bold">
              {submitting ? 'Posting…' : 'Post'}
            </Button>
          </div>

          <input ref={pollImgRef} type="file" accept="image/*" className="hidden" onChange={handlePollImageSelect} />
        </div>
      </div>
    </GlassPanel>
  );
}

function AttachChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
      <span className="max-w-[180px] truncate">{label}</span>
      <button type="button" aria-label="Remove" onClick={onClear} className="hover:text-primary/70"><X className="h-3 w-3" /></button>
    </span>
  );
}

function PickerPopover({ icon: Icon, label, active, items, empty, onPick }: {
  icon: any; label: string; active: boolean; items: Array<{ id: string; label: string }>; empty: string; onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} title={label} className={cn('flex h-9 w-9 items-center justify-center rounded-full transition-colors', active ? 'bg-primary/20 text-primary' : 'text-primary/70 hover:bg-primary/10 hover:text-primary')}>
          <Icon className="h-[18px] w-[18px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="px-2 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        {items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {items.map((item) => (
              <button key={item.id} type="button" onClick={() => { onPick(item.id); setOpen(false); }} className="w-full truncate rounded-lg px-2 py-2 text-left text-sm hover:bg-white/5">
                {item.label}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
