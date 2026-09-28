import { useMemo } from "react";
import { Users, ListOrdered, Music2, MessageCircle, Radio } from "lucide-react";
import { HomeSectionHeading } from "./HomeSectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { TierListCard } from "@/components/tierlist/TierListCard";
import { PlaylistCard } from "@/components/playlist/PlaylistCard";
import { PostCard } from "@/components/community/feed/PostCard";
import { WatchRoomCard } from "@/pages/watch/IsshoNiPage";
import { useFeed, type FeedItem } from "@/hooks/community/useFeed";
import { useDiscoverPlaylists } from "@/hooks/user/usePlaylist";
import { usePublicWatchRooms } from "@/hooks/media/useWatchRoom";
import { usePublicTierLists } from "@/hooks/user/useTierLists";

const SkeletonGrid = ({ count, className, tall }: { count: number; className: string; tall?: boolean }) => (
  <div className={className}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className={`${tall ? "h-64" : "h-40"} rounded-3xl bg-muted/20 animate-pulse`} />
    ))}
  </div>
);

/**
 * Consolidated "Community" block for the home page: the most-liked tier lists
 * and playlists, a couple of recent posts (reusing the community PostCard), and
 * the busiest live watch rooms. Each sub-rail hides itself when empty, and the
 * whole section disappears if the community has nothing to show yet.
 */
export function CommunitySection() {
  // Most-liked public tier lists (with author profiles attached).
  const { data: allTierlists = [], isLoading: tlLoading } = usePublicTierLists(4);
  const tierlists = useMemo(() => allTierlists.slice(0, 4), [allTierlists]);

  // Most-liked public playlists (with author, for the card's attribution row).
  const { data: allPlaylists = [], isLoading: plLoading } = useDiscoverPlaylists({ sort: "most_liked" });
  const playlists = useMemo(() => allPlaylists.slice(0, 4), [allPlaylists]);

  // A couple of recent community posts.
  const { data: feed, isLoading: feedLoading } = useFeed("foryou");
  const posts = useMemo(() => {
    const firstPage = (feed?.pages?.[0] ?? []) as FeedItem[];
    return firstPage.filter((i): i is Extract<FeedItem, { kind: "post" }> => i.kind === "post").slice(0, 4);
  }, [feed]);

  // Busiest public watch rooms (most people watching together).
  const { data: rooms = [], isLoading: roomLoading } = usePublicWatchRooms();
  const topRooms = useMemo(
    () => [...rooms].sort((a, b) => (b.participant_count || 0) - (a.participant_count || 0)).slice(0, 3),
    [rooms],
  );

  const anyLoading = tlLoading || plLoading || feedLoading || roomLoading;
  const isEmpty = !anyLoading && !tierlists.length && !playlists.length && !posts.length && !topRooms.length;
  if (isEmpty) return null;

  return (
    <section className="space-y-12">
      <HomeSectionHeading
        icon={<Users className="w-5 h-5 text-primary" />}
        title="Community"
        viewAllTo="/community"
        viewAllLabel="Explore"
      />

      {/* Top tier lists */}
      {(tlLoading || tierlists.length > 0) && (
        <Reveal>
          <HomeSectionHeading
            as="h3"
            size="sub"
            icon={<ListOrdered className="w-[18px] h-[18px] text-primary" />}
            title="Top Tier Lists"
            viewAllTo="/tierlists"
          />
          {tlLoading ? (
            <SkeletonGrid tall count={4} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {tierlists.map((tl) => (
                <TierListCard key={tl.id} tierList={tl} />
              ))}
            </div>
          )}
        </Reveal>
      )}

      {/* Popular playlists */}
      {(plLoading || playlists.length > 0) && (
        <Reveal>
          <HomeSectionHeading
            as="h3"
            size="sub"
            icon={<Music2 className="w-[18px] h-[18px] text-primary" />}
            title="Popular Playlists"
            viewAllTo="/playlists"
          />
          {plLoading ? (
            <SkeletonGrid count={4} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {playlists.map((pl) => (
                <PlaylistCard key={pl.id} playlist={pl} author={pl.author} showActions={false} />
              ))}
            </div>
          )}
        </Reveal>
      )}

      {/* Recent community posts */}
      {(feedLoading || posts.length > 0) && (
        <Reveal>
          <HomeSectionHeading
            as="h3"
            size="sub"
            icon={<MessageCircle className="w-[18px] h-[18px] text-primary" />}
            title="Community Posts"
            viewAllTo="/community"
          />
          {feedLoading ? (
            <SkeletonGrid tall count={4} className="grid gap-4 lg:grid-cols-2" />
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {posts.map((item) => (
                <PostCard key={item.post.id} post={item.post} contextCommunityId={null} />
              ))}
            </div>
          )}
        </Reveal>
      )}

      {/* Busiest live watch rooms */}
      {(roomLoading || topRooms.length > 0) && (
        <Reveal>
          <HomeSectionHeading
            as="h3"
            size="sub"
            icon={<Radio className="w-[18px] h-[18px] text-red-500" />}
            title="Live Watch Rooms"
            viewAllTo="/isshoni"
          />
          {roomLoading ? (
            <SkeletonGrid count={3} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topRooms.map((room) => (
                <WatchRoomCard key={room.id} room={room} />
              ))}
            </div>
          )}
        </Reveal>
      )}

    </section>
  );
}
