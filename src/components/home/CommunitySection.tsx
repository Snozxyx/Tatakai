import { useMemo } from "react";
import { useTranslation } from "react-i18next";
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
import { cn } from "@/lib/utils";

const SkeletonGrid = ({ count, className, itemClassName, tall }: { count: number; className: string; itemClassName?: string; tall?: boolean }) => (
  <div className={className}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className={cn(`${tall ? "h-64" : "h-40"} rounded-3xl bg-muted/20 animate-pulse`, itemClassName)} />
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
  const { t } = useTranslation();
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
    <section data-mobile-community className="space-y-12">
      <HomeSectionHeading
        icon={<Users className="w-5 h-5 text-primary" />}
        title={t('nav.community')}
        viewAllTo="/community"
        viewAllLabel={t('nav.explore')}
      />

      {/* Top tier lists */}
      {(tlLoading || tierlists.length > 0) && (
        <Reveal>
          <HomeSectionHeading
            as="h3"
            size="sub"
            icon={<ListOrdered className="w-[18px] h-[18px] text-primary" />}
            title={t('home.topTierLists')}
            viewAllTo="/tierlists"
          />
          {tlLoading ? (
            <SkeletonGrid tall count={4} className="flex overflow-x-auto no-scrollbar scrollbar-hide snap-x snap-mandatory gap-4 pb-2 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6 md:overflow-visible md:snap-none md:pb-0" itemClassName="min-w-[260px] max-w-[320px] w-[78vw] shrink-0 snap-start md:w-auto md:min-w-0 md:max-w-none md:shrink" />
          ) : (
            <div data-mobile-home-rail="tierlists" className="flex overflow-x-auto no-scrollbar scrollbar-hide snap-x snap-mandatory gap-4 pb-2 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6 md:overflow-visible md:snap-none md:pb-0">
              {tierlists.map((tl) => (
                <div key={tl.id} className="min-w-[260px] max-w-[320px] w-[78vw] shrink-0 snap-start md:w-auto md:min-w-0 md:max-w-none md:shrink">
                  <TierListCard tierList={tl} />
                </div>
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
            title={t('home.popularPlaylists')}
            viewAllTo="/playlists"
          />
          {plLoading ? (
            <SkeletonGrid count={4} className="flex overflow-x-auto no-scrollbar scrollbar-hide snap-x snap-mandatory gap-4 pb-2 md:grid md:grid-cols-3 lg:grid-cols-4 md:overflow-visible md:snap-none md:pb-0" itemClassName="min-w-[170px] max-w-[210px] w-[50vw] shrink-0 snap-start md:w-auto md:min-w-0 md:max-w-none md:shrink" />
          ) : (
            <div data-mobile-home-rail="playlists" className="flex overflow-x-auto no-scrollbar scrollbar-hide snap-x snap-mandatory gap-4 pb-2 md:grid md:grid-cols-3 lg:grid-cols-4 md:overflow-visible md:snap-none md:pb-0">
              {playlists.map((pl) => (
                <div key={pl.id} className="min-w-[170px] max-w-[210px] w-[50vw] shrink-0 snap-start md:w-auto md:min-w-0 md:max-w-none md:shrink">
                  <PlaylistCard playlist={pl} author={pl.author} showActions={false} />
                </div>
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
            title={t('home.communityPosts')}
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
            title={t('home.liveWatchRooms')}
            viewAllTo="/isshoni"
          />
          {roomLoading ? (
            <SkeletonGrid count={3} className="flex overflow-x-auto no-scrollbar scrollbar-hide snap-x snap-mandatory gap-4 pb-2 md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible md:snap-none md:pb-0" itemClassName="min-w-[240px] max-w-[300px] w-[72vw] shrink-0 snap-start md:w-auto md:min-w-0 md:max-w-none md:shrink" />
          ) : (
            <div data-mobile-home-rail="rooms" className="flex overflow-x-auto no-scrollbar scrollbar-hide snap-x snap-mandatory gap-4 pb-2 md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible md:snap-none md:pb-0">
              {topRooms.map((room) => (
                <div key={room.id} className="min-w-[240px] max-w-[300px] w-[72vw] shrink-0 snap-start md:w-auto md:min-w-0 md:max-w-none md:shrink">
                  <WatchRoomCard room={room} />
                </div>
              ))}
            </div>
          )}
        </Reveal>
      )}

    </section>
  );
}
