import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
export function forumHandoffURL(postId: string, commentId?: string) {
  const url = new URL(
    `/community/forum/${encodeURIComponent(postId)}`,
    "https://tatakai.me"
  );
  url.searchParams.set("compose", "reply");
  if (commentId) {
    url.searchParams.set("commentId", commentId);
    url.hash = `comment-${commentId}`;
  }
  return url.href;
}
export function TVHandoff({
  url,
  onClose,
}: {
  url: string | null;
  onClose(): void;
}) {
  return (
    <Dialog
      open={!!url}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="tv-dialog">
        <DialogHeader>
          <DialogTitle>Continue on your phone</DialogTitle>
        </DialogHeader>
        <p>
          Scan to open this exact conversation. Sign in on your phone to write a
          reply.
        </p>
        {url && <QRCodeSVG value={url} size={256} marginSize={4} />}
        <button onClick={onClose}>Done</button>
      </DialogContent>
    </Dialog>
  );
}
