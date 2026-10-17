import { Link } from "react-router-dom";
import { UserRound, Bookmark, ArrowUpRight, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { TVLoadMore } from "@/components/tv/TVLoadMore";
import { useState } from "react";
import { useFeed, type FeedTab } from "@/hooks/community/useFeed";
import { PostCard } from "@/components/community/feed/PostCard";
import { useForumPost } from "@/hooks/community/useForum";
import { requestTVWriting } from "@/core/tv/writingHandoff";
export default function TVCommunityPage({ postId }: { postId?: string }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<FeedTab>("foryou");
  const feed = useFeed(tab),
    post = useForumPost(postId || "");
  const items =
    feed.data?.pages
      .flatMap((page) =>
        page
          .filter((item) => item.kind === "post")
          .map((item) => (item.kind === "post" ? item.post : null))
      )
      .filter(Boolean) || [];
  return (
    <div className="tv-page tv-community-content">
      <div className="tv-page-heading">
        <div>
          <h1>{postId ? "Conversation" : "Community"}</h1>
          <p>Your people. Your next obsession.</p>
        </div>
        <button onClick={() => requestTVWriting(postId)}>
          Write on your phone
        </button>
      </div>
      {!postId && (
        <div className="tv-filter-tabs">
          {(["foryou", "following", "news"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {value === "foryou"
                ? "For you"
                : value === "following"
                ? "Following"
                : "News"}
            </button>
          ))}
        </div>
      )}
      <div className="tv-community-layout">
        <div className="tv-community-feed">
          {postId ? (
            post.data ? (
              <PostCard post={post.data as any} defaultShowComments />
            ) : (
              <p role="status">
                {post.isLoading
                  ? "Opening conversation…"
                  : "This conversation is unavailable."}
              </p>
            )
          ) : (
            <>
              {feed.isLoading && <p role="status">Loading your community…</p>}
              {feed.error && (
                <button onClick={() => void feed.refetch()}>Retry feed</button>
              )}
              {items.map((item) => (
                <PostCard key={item!.id} post={item!} />
              ))}
              <TVLoadMore
                hasMore={feed.hasNextPage && !feed.error}
                busy={feed.isFetchingNextPage}
                load={() => feed.fetchNextPage()}
                label="More posts"
              />
            </>
          )}
        </div>
        <aside className="tv-community-sidebar" aria-label="Your community">
          <div className="tv-community-account">
            <img
              src={
                profile?.avatar_url || "/assets/logo/tatakai-logo-square.png"
              }
              alt=""
            />
            <h2>
              {profile?.display_name || profile?.username || "Your Tatakai"}
            </h2>
            <p>
              {profile?.username
                ? `@${profile.username}`
                : "Stories are better together."}
            </p>
            <Link to="/profile">
              <UserRound /> Your profile <ArrowUpRight />
            </Link>
            <Link to="/community/bookmarks">
              <Bookmark /> Saved posts <ArrowUpRight />
            </Link>
          </div>
          <div className="tv-community-phone">
            <Smartphone />
            <h2>Keep the conversation going</h2>
            <p>
              Browse, react and follow here. Scan a QR code when you want to
              write.
            </p>
            <button onClick={() => requestTVWriting(postId)}>
              Continue on phone
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
