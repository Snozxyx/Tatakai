import { useState } from "react";
import { useWatchlist } from "@/hooks/user/useWatchlist";
import { useBookmarkedPosts } from "@/hooks/community/usePostSocial";
import { PostCard } from "@/components/community/feed/PostCard";
import { TVContentCard } from "@/components/tv/TVContentCard";
export default function TVSavedPage({
  bookmarks = false,
}: {
  bookmarks?: boolean;
}) {
  const [status, setStatus] = useState("all");
  const list = useWatchlist(),
    posts = useBookmarkedPosts();
  return (
    <div className="tv-page">
      <h1>{bookmarks ? "Saved conversations" : "My watchlist"}</h1>
      <p>Pick up where your curiosity left off.</p>
      {bookmarks ? (
        <div className="tv-community-feed">
          {posts.data?.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {posts.isLoading ? (
            <p>Loading saved posts…</p>
          ) : (
            !posts.data?.length && (
              <p>Bookmark a conversation in Community to find it here.</p>
            )
          )}
        </div>
      ) : (
        <>
          <div className="tv-filter-tabs">
            {[
              ["all", "All titles"],
              ["watching", "Watching"],
              ["plan_to_watch", "Watch later"],
              ["completed", "Completed"],
              ["on_hold", "On hold"],
            ].map(([value, label]) => (
              <button
                aria-pressed={status === value}
                key={value}
                onClick={() => setStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {list.isLoading && <p role="status">Opening your watchlist…</p>}
          {list.error && (
            <button onClick={() => void list.refetch()}>Retry watchlist</button>
          )}
          <div className="tv-poster-grid">
            {list.data
              ?.filter((item) => status === "all" || item.status === status)
              .map((item) => (
                <TVContentCard
                  key={item.id}
                  item={{
                    id: item.anime_id,
                    name: item.anime_name,
                    poster: item.anime_poster || "",
                    subtitle: item.status.replace(/_/g, " "),
                  }}
                />
              ))}
          </div>
          {!list.isLoading && !list.data?.length && (
            <p>Add a title to My list, or link your account in My Tatakai.</p>
          )}
        </>
      )}
    </div>
  );
}
