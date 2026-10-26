export interface FeedPosition { createdAt: string; id: string }
export type FeedCursor = { posts: FeedPosition | false | null; comments: FeedPosition | false | null };

/** Use the database order, even when personalization reorders the rendered page. */
export function nextFeedPosition(rows: FeedPosition[], pageSize: number): FeedPosition | false {
  if (rows.length < pageSize) return false;
  return rows.reduce((oldest, row) => row.createdAt < oldest.createdAt ||
    (row.createdAt === oldest.createdAt && row.id < oldest.id) ? row : oldest);
}

export function nextFeedCursor(posts: FeedPosition[], comments: FeedPosition[], pageSize: number): FeedCursor | undefined {
  const next = { posts: nextFeedPosition(posts, pageSize), comments: nextFeedPosition(comments, pageSize) };
  return next.posts === false && next.comments === false ? undefined : next;
}
