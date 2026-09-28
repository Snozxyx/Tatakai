import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  MessageSquare, FileText, ListChecks, ListMusic, Image as ImageIcon, Award,
  Loader2, Trash2, Heart, Eye, Check, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModerationMenu } from '@/components/moderation/ModerationMenu';
import { CommentContent } from '@/components/comments/CommentContent';
import { CommentAttachments } from '@/components/comments/CommentAttachments';
import { CommentEmbeds } from '@/components/comments/CommentEmbeds';
import { useUserCommentsDetailed } from '@/hooks/user/useUserCommentsDetailed';
import { useUserForumPostsStaff, type ForumPost } from '@/hooks/community/useForum';
import { useUserTierLists } from '@/hooks/user/useTierLists';
import { useUserPlaylistsStaff } from '@/hooks/user/usePlaylist';
import { listUserMedia, deleteUserMedia, type UserMediaFile } from '@/lib/userMedia';
import {
  ACHIEVEMENTS, useUserAchievements, useGrantAchievement, useRevokeAchievement,
} from '@/hooks/admin/useAchievements';
import { formatBytes } from '@/components/extensions/store/extensionVisuals';
import { RichContent, extractHashtags } from '@/components/community/feed/richText';
import {
  PostPollCard, PostImageGrid, PostPlaylistEmbed, PostTierlistEmbed,
  PostWatchroomEmbed, PostMediaEmbed,
} from '@/components/community/feed/PostEmbeds';
import { usePostPoll } from '@/hooks/community/usePostPolls';

type UserTab = 'comments' | 'posts' | 'tierlists' | 'playlists' | 'uploads' | 'badges';

const TABS: { id: UserTab; label: string; icon: any }[] = [
  { id: 'comments', label: 'Comments', icon: MessageSquare },
  { id: 'posts', label: 'Posts', icon: FileText },
  { id: 'tierlists', label: 'Tier lists', icon: ListChecks },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'uploads', label: 'Uploads', icon: ImageIcon },
  { id: 'badges', label: 'Badges', icon: Award },
];

function Spin() {
  return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary/60" /></div>;
}
function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Icon className="mb-3 h-8 w-8 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function CommentsTab({ userId, userName }: { userId: string; userName: string }) {
  const { comments, isLoading } = useUserCommentsDetailed(userId);
  if (isLoading) return <Spin />;
  if (!comments.length) return <Empty icon={MessageSquare} text="No comments." />;
  return (
    <div className="space-y-3">
      {comments.map((c) => (
        <div key={c.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {c.is_spoiler && (
                <span className="mb-1 inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-400">Spoiler</span>
              )}
              <CommentContent content={c.content} clamp className="mb-2" />
              <CommentAttachments attachments={c.attachments} className="mb-2" />
              <CommentEmbeds embeds={c.embeds} poll={c.poll} />
              <p className="mt-2 text-xs text-muted-foreground">
                <Link to={c.target} className="hover:text-primary">{c.title}</Link>
                {c.hasEpisode && ' • Episode'} · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
              </p>
            </div>
            <ModerationMenu contentType="comment" contentId={c.id} authorUserId={userId} authorName={userName} />
          </div>
        </div>
      ))}
    </div>
  );
}

type StaffPost = ForumPost & { is_approved: boolean };

function PostRow({ post, userId, userName }: { post: StaffPost; userId: string; userName: string }) {
  const { data: poll } = usePostPoll(post.id);

  // Derive media the same way the feed's QuotedPostEmbed does: picked GIF, else
  // metadata.images, else the legacy single image_url column.
  const meta = (post.metadata || {}) as Record<string, any>;
  const gif = typeof meta.gif_url === 'string' ? meta.gif_url : null;
  const images: string[] = Array.isArray(meta.images) && meta.images.length
    ? meta.images
    : post.image_url ? [post.image_url] : [];
  const mediaType = meta.media_type || (post.anime_id ? 'anime' : null);
  const watchRoomId = typeof meta.watch_room_id === 'string' ? meta.watch_room_id : null;

  // Tags = the post's flair + hashtags mined from its body (same source the
  // trending feed uses).
  const hashtags = extractHashtags(post.content || '').slice(0, 6);

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {!post.is_approved && (
              <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] text-orange-400">Pending approval</span>
            )}
            {post.is_pinned && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] text-primary">Pinned</span>
            )}
            {post.is_spoiler && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-400">Spoiler</span>
            )}
            {post.is_nsfw && (
              <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-400">NSFW</span>
            )}
          </div>

          <Link to={`/community/forum/${post.id}`} className="font-medium hover:text-primary">
            {post.title || 'Untitled post'}
          </Link>

          {post.content && (
            <RichContent html={post.content} className="mt-1 text-sm text-foreground/90" />
          )}

          {/* Media / embeds — mirrors the feed PostCard body. */}
          <div className="mt-2 space-y-2">
            {poll && <PostPollCard poll={poll} />}
            {gif ? (
              <PostImageGrid images={[gif]} spoiler={post.is_spoiler} />
            ) : images.length > 0 ? (
              <PostImageGrid images={images} spoiler={post.is_spoiler} />
            ) : null}
            {post.playlist_id && <PostPlaylistEmbed playlistId={post.playlist_id} />}
            {post.tierlist_id && <PostTierlistEmbed tierlistId={post.tierlist_id} />}
            {watchRoomId && <PostWatchroomEmbed roomId={watchRoomId} />}
            {post.anime_id && post.anime_name && (
              <PostMediaEmbed id={post.anime_id} name={post.anime_name} poster={post.anime_poster} type={mediaType || 'anime'} variant="pill" />
            )}
          </div>

          {/* Tags: flair + hashtags */}
          {(post.flair || hashtags.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {post.flair && (
                <span className="rounded-md border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/80">
                  {post.flair}
                </span>
              )}
              {hashtags.map((t) => (
                <span key={t} className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  #{t}
                </span>
              ))}
            </div>
          )}

          <p className="mt-2 text-xs text-muted-foreground">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</p>
        </div>
        <ModerationMenu contentType="forum_post" contentId={post.id} authorUserId={userId} authorName={userName} showPauseComments />
      </div>
    </div>
  );
}

function PostsTab({ userId, userName }: { userId: string; userName: string }) {
  const { data: posts = [], isLoading } = useUserForumPostsStaff(userId);
  if (isLoading) return <Spin />;
  if (!posts.length) return <Empty icon={FileText} text="No forum posts." />;
  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <PostRow key={p.id} post={p} userId={userId} userName={userName} />
      ))}
    </div>
  );
}

function TierlistsTab({ userId, userName }: { userId: string; userName: string }) {
  const { data: lists = [], isLoading } = useUserTierLists(userId);
  if (isLoading) return <Spin />;
  if (!lists.length) return <Empty icon={ListChecks} text="No tier lists." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {lists.map((l) => (
        <div key={l.id} className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{l.title || l.name}</p>
              {!l.is_public && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">Private</span>}
            </div>
            {l.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.description}</p>}
            <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{l.items?.length ?? 0} items</span>
              <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {l.likes_count ?? 0}</span>
              <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {l.views_count ?? 0}</span>
            </p>
          </div>
          <ModerationMenu contentType="tier_list" contentId={l.id} authorUserId={userId} authorName={userName} />
        </div>
      ))}
    </div>
  );
}

function PlaylistsTab({ userId, userName }: { userId: string; userName: string }) {
  const { data: lists = [], isLoading } = useUserPlaylistsStaff(userId);
  if (isLoading) return <Spin />;
  if (!lists.length) return <Empty icon={ListMusic} text="No playlists." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {lists.map((p) => (
        <div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {p.cover_image && (
              <img src={p.cover_image} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{p.name}</p>
                {!p.is_public && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">Private</span>}
                {p.is_flagged && <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-400">Flagged</span>}
              </div>
              {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
              <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{p.items_count ?? 0} items</span>
                <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {p.likes_count ?? 0}</span>
              </p>
            </div>
          </div>
          <ModerationMenu contentType="playlist" contentId={p.id} authorUserId={userId} authorName={userName} />
        </div>
      ))}
    </div>
  );
}

function UploadsTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: files = [], isLoading } = useQuery({
    queryKey: ['admin-user-media', userId],
    queryFn: () => listUserMedia(userId),
    enabled: !!userId,
  });

  const remove = async (f: UserMediaFile) => {
    try {
      await deleteUserMedia({ bucket: f.bucket, path: f.path });
      qc.setQueryData<UserMediaFile[]>(['admin-user-media', userId], (prev) =>
        (prev ?? []).filter((x) => !(x.bucket === f.bucket && x.path === f.path)),
      );
      toast.success('File deleted');
    } catch (err: any) {
      toast.error('Failed to delete: ' + (err?.message ?? 'unknown error'));
    }
  };

  if (isLoading) return <Spin />;
  if (!files.length) return <Empty icon={ImageIcon} text="No uploads." />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {files.map((f) => (
        <div key={`${f.bucket}/${f.path}`} className="group relative overflow-hidden rounded-lg border border-white/5 bg-white/[0.02]">
          <a href={f.url} target="_blank" rel="noreferrer" className="block aspect-square">
            <img src={f.url} alt={f.name} className="h-full w-full object-cover" loading="lazy" />
          </a>
          <div className="flex items-center justify-between gap-2 p-2">
            <span className="truncate text-[11px] text-muted-foreground">{formatBytes(f.size ?? 0) ?? '—'}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-rose-400 hover:bg-rose-400/10 hover:text-rose-400"
              onClick={() => remove(f)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function BadgesTab({ userId }: { userId: string }) {
  const { data: granted = [], isLoading } = useUserAchievements(userId);
  const grant = useGrantAchievement();
  const revoke = useRevokeAchievement();
  const grantedIds = new Set(granted.map((g) => g.achievement_id));

  const toggle = async (id: string, has: boolean) => {
    try {
      if (has) await revoke.mutateAsync({ userId, achievementId: id });
      else await grant.mutateAsync({ userId, achievementId: id });
      toast.success(has ? 'Badge revoked' : 'Badge granted');
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? 'unknown error'));
    }
  };

  if (isLoading) return <Spin />;
  const busy = grant.isPending || revoke.isPending;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ACHIEVEMENTS.map((a) => {
        const has = grantedIds.has(a.id);
        return (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Award className={`h-4 w-4 shrink-0 ${has ? 'text-amber-400' : 'text-muted-foreground/40'}`} />
                <p className="truncate text-sm font-medium">{a.title}</p>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
            </div>
            <Button
              variant={has ? 'ghost' : 'outline'}
              size="sm"
              disabled={busy}
              className={has ? 'gap-1.5 text-rose-400 hover:bg-rose-400/10 hover:text-rose-400' : 'gap-1.5'}
              onClick={() => toggle(a.id, has)}
            >
              {has ? <><Check className="h-3.5 w-3.5" /> Granted</> : <><Plus className="h-3.5 w-3.5" /> Grant</>}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function AdminUserTabs({ userId, userName }: { userId: string; userName: string }) {
  const [tab, setTab] = useState<UserTab>('comments');
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'comments' && <CommentsTab userId={userId} userName={userName} />}
      {tab === 'posts' && <PostsTab userId={userId} userName={userName} />}
      {tab === 'tierlists' && <TierlistsTab userId={userId} userName={userName} />}
      {tab === 'playlists' && <PlaylistsTab userId={userId} userName={userName} />}
      {tab === 'uploads' && <UploadsTab userId={userId} />}
      {tab === 'badges' && <BadgesTab userId={userId} />}
    </div>
  );
}
