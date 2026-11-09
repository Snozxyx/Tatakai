import { isTV } from "./device";
export function requestTVWriting(postId?: string, commentId?: string): boolean {
  if (!isTV()) return false;
  const url = new URL(
    postId
      ? `/community/forum/${encodeURIComponent(postId)}`
      : window.location.pathname,
    "https://tatakai.app"
  );
  url.searchParams.set("compose", "reply");
  if (commentId) {
    url.searchParams.set("commentId", commentId);
    url.hash = `comment-${commentId}`;
  }
  window.dispatchEvent(
    new CustomEvent("tatakai-tv-writing", { detail: url.href })
  );
  return true;
}
