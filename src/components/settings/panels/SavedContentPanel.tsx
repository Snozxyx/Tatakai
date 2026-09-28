import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bookmark,
  ListChecks,
  ListMusic,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
  Heart,
  Eye,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { usePlaylists } from '@/hooks/user/usePlaylist';
import { useUserTierLists } from '@/hooks/user/useTierLists';
import { useBookmarkedPosts } from '@/hooks/community/usePostSocial';
import { PostCard } from '@/components/community/feed/PostCard';
import { listUserMedia, deleteUserMedia, type UserMediaFile } from '@/lib/userMedia';
import { useStorageUsage } from '@/hooks/user/useStorageUsage';
import { formatBytes } from '@/components/extensions/store/extensionVisuals';
import { SettingsEmptyState } from '@/components/settings/SettingsPrimitives';

type SavedTab = 'bookmarks' | 'tierlists' | 'playlists' | 'media';

const TABS: { id: SavedTab; label: string; icon: React.ReactNode }[] = [
  { id: 'bookmarks', label: 'Bookmarks', icon: <Bookmark className="w-4 h-4" /> },
  { id: 'tierlists', label: 'Tier Lists', icon: <ListChecks className="w-4 h-4" /> },
  { id: 'playlists', label: 'Playlists', icon: <ListMusic className="w-4 h-4" /> },
  { id: 'media', label: 'Media', icon: <ImageIcon className="w-4 h-4" /> },
];

function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  );
}

/** "X of Y used" media-storage meter shown atop Saved Content. */
function StorageUsageBar() {
  const { data, isLoading } = useStorageUsage();
  if (isLoading || !data) return null;
  const { usedBytes, quotaBytes } = data;
  const pct = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;
  const near = pct >= 90;
  return (
    <div className="rounded-xl bg-muted/30 border border-white/10 p-3.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Storage</span>
        <span className="text-muted-foreground tabular-nums">
          {formatBytes(usedBytes) ?? '0 B'} of {formatBytes(quotaBytes) ?? '25 MB'} used
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={'h-full rounded-full transition-all ' + (near ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Saved Content — an inline browser (no navigating away) of the user's saved
 * community bookmarks, tier lists, playlists, and every media file they've
 * uploaded. A `section` of one of the tab ids opens straight to that tab.
 */
export function SavedContentPanel({ section }: { section?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { closeSettings } = useSettingsModal();

  const initialTab = TABS.some((t) => t.id === section) ? (section as SavedTab) : 'bookmarks';
  const [tab, setTab] = useState<SavedTab>(initialTab);

  const bookmarks = useBookmarkedPosts();
  const tierLists = useUserTierLists();
  const playlists = usePlaylists();
  const media = useQuery({
    queryKey: ['user-media', user?.id],
    queryFn: () => listUserMedia(user!.id),
    enabled: !!user && tab === 'media',
  });

  if (!user) {
    return (
      <SettingsEmptyState
        icon={Bookmark}
        title="Sign in to see your saved content"
        description="Your bookmarks, tier lists, playlists, and uploaded media live here once you're signed in."
      />
    );
  }

  const open = (to: string) => {
    navigate(to);
    closeSettings();
  };

  const counts: Record<SavedTab, number | undefined> = {
    bookmarks: bookmarks.data?.length,
    tierlists: tierLists.data?.length,
    playlists: playlists.data?.length,
    media: media.data?.length,
  };

  const handleDeleteMedia = async (file: { bucket: string; path: string }) => {
    try {
      await deleteUserMedia(file);
      queryClient.setQueryData<any[]>(['user-media', user.id], (prev) =>
        (prev || []).filter((f) => !(f.bucket === file.bucket && f.path === file.path)),
      );
      toast.success('Deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete file');
    }
  };

  return (
    <div className="space-y-5">
      <StorageUsageBar />

      {/* Sub-tab bar */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ' +
              (tab === t.id
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'bg-muted/30 text-muted-foreground border border-white/10 hover:bg-muted/50')
            }
          >
            {t.icon}
            {t.label}
            {counts[t.id] != null && (
              <span className="ml-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'bookmarks' && <BookmarksSection query={bookmarks} />}
      {tab === 'tierlists' && <TierListsSection query={tierLists} onOpen={open} />}
      {tab === 'playlists' && <PlaylistsSection query={playlists} onOpen={open} />}
      {tab === 'media' && <MediaSection query={media} onDelete={handleDeleteMedia} />}
    </div>
  );
}

function BookmarksSection({ query }: { query: ReturnType<typeof useBookmarkedPosts> }) {
  if (query.isLoading) return <Loading />;
  const posts = query.data || [];
  if (!posts.length) {
    return <SettingsEmptyState icon={Bookmark} title="No bookmarks yet" description="Tap the bookmark icon on a community post to save it here." />;
  }
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

function TierListsSection({
  query,
  onOpen,
}: {
  query: ReturnType<typeof useUserTierLists>;
  onOpen: (to: string) => void;
}) {
  if (query.isLoading) return <Loading />;
  const lists = query.data || [];
  if (!lists.length) {
    return <SettingsEmptyState icon={ListChecks} title="No tier lists yet" description="You haven't made any tier lists yet." />;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {lists.map((list) => {
        const items = list.items || [];
        const to = list.share_code ? `/tierlist/${list.share_code}` : '/tierlists';
        return (
          <div key={list.id} className="rounded-xl bg-muted/30 border border-white/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{list.title || list.name}</p>
                <p className="text-xs text-muted-foreground">{items.length} title{items.length === 1 ? '' : 's'}</p>
              </div>
              <Button size="sm" variant="ghost" className="gap-1.5 shrink-0" onClick={() => onOpen(to)}>
                <ExternalLink className="w-3.5 h-3.5" /> Open
              </Button>
            </div>
            <div className="mt-3 flex -space-x-2">
              {items.slice(0, 6).map((it, i) => (
                <img
                  key={i}
                  src={it.anime_image}
                  alt=""
                  loading="lazy"
                  className="w-9 h-12 rounded-md object-cover border border-white/10 bg-muted"
                />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {list.likes_count ?? 0}</span>
              <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {list.views_count ?? 0}</span>
              <span>{list.is_public ? 'Public' : 'Private'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlaylistsSection({
  query,
  onOpen,
}: {
  query: ReturnType<typeof usePlaylists>;
  onOpen: (to: string) => void;
}) {
  if (query.isLoading) return <Loading />;
  const playlists = query.data || [];
  if (!playlists.length) {
    return <SettingsEmptyState icon={ListMusic} title="No playlists yet" description="You haven't created any playlists yet." />;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {playlists.map((pl) => (
        <button
          key={pl.id}
          onClick={() => onOpen(`/playlist/${pl.id}`)}
          className="group flex gap-3 text-left rounded-xl bg-muted/30 border border-white/10 p-3 hover:border-primary/40 hover:bg-muted/50 transition-colors"
        >
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
            {pl.cover_image ? (
              <img src={pl.cover_image} alt="" loading="lazy" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <ListMusic className="w-6 h-6" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{pl.name}</p>
            {pl.description && <p className="text-xs text-muted-foreground line-clamp-2">{pl.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {pl.items_count} item{pl.items_count === 1 ? '' : 's'} · {pl.is_public ? 'Public' : 'Private'}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  comment: 'Comment',
  forum_image: 'Forum',
  other: 'Other',
};

function MediaSection({
  query,
  onDelete,
}: {
  query: { isLoading: boolean; data?: UserMediaFile[] };
  onDelete: (file: { bucket: string; path: string }) => void;
}) {
  if (query.isLoading) return <Loading />;
  const files = query.data || [];
  if (!files.length) {
    return <SettingsEmptyState icon={ImageIcon} title="No media yet" description="Images you attach to comments and posts show up here." />;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {files.map((file) => (
        <div key={`${file.bucket}:${file.path}`} className="group relative aspect-square rounded-xl overflow-hidden bg-muted border border-white/10">
          <img src={file.url} alt={file.name} loading="lazy" className="w-full h-full object-cover" />
          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            {CATEGORY_LABEL[file.category] || file.category}
          </span>
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-white/15 p-1.5 text-white hover:bg-white/25"
              title="Open"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={() => onDelete({ bucket: file.bucket, path: file.path })}
              className="rounded-md bg-destructive/80 p-1.5 text-white hover:bg-destructive"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}




