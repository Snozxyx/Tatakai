import { uploadUserMedia } from '@/lib/userMedia';

/**
 * A media card attached to a comment. Stored in `comments.attachments` (jsonb
 * array) rather than packed into `content`, which is capped at 2000 chars by a
 * DB CHECK. `gif` and `image` render identically; the distinction is kept so the
 * composer can badge a GIF and so moderation can treat the two differently later.
 */
export interface CommentAttachment {
  type: 'image' | 'gif';
  url: string;
  /** Smaller still/preview URL, when the source provides one (Giphy does). */
  preview?: string;
  width?: number;
  height?: number;
  title?: string;
}

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/**
 * Read an image file's intrinsic pixel dimensions in the browser, so the
 * rendered attachment can reserve the right aspect ratio (no layout shift, no
 * forced cropping). Best-effort — resolves to null if the file can't be decoded.
 */
async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = img.naturalWidth && img.naturalHeight
        ? { width: img.naturalWidth, height: img.naturalHeight }
        : null;
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Upload an image/GIF file for a comment. Delegates to the shared user-media
 * helper (unified `user-media/<uid>/comment/…` bucket, with a fallback to the
 * legacy `comment-media/comments/<uid>/…` layout), and captures intrinsic
 * dimensions first so the renderer can reserve the real aspect ratio.
 */
export async function uploadCommentMedia(file: File, userId: string): Promise<CommentAttachment> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only PNG, JPEG, GIF or WebP images are allowed');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Image must be 8MB or smaller');
  }

  const dims = await readImageDimensions(file);
  const { url } = await uploadUserMedia(file, userId, 'comment');

  return {
    type: file.type === 'image/gif' ? 'gif' : 'image',
    url,
    title: file.name,
    width: dims?.width,
    height: dims?.height,
  };
}

/**
 * Coerce an untrusted `attachments` value (a jsonb column read back from the DB,
 * possibly written by an older/misbehaving client) into a safe, bounded array.
 * Only `http(s)` URLs survive, so a stored `javascript:`/`data:` URL never
 * becomes a rendered `src`.
 */
export function sanitizeAttachments(input: unknown): CommentAttachment[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 4)
    .map((a: any): CommentAttachment => ({
      type: a?.type === 'gif' ? 'gif' : 'image',
      url: typeof a?.url === 'string' ? a.url : '',
      preview: typeof a?.preview === 'string' && /^https?:\/\//i.test(a.preview) ? a.preview : undefined,
      width: Number.isFinite(a?.width) ? Number(a.width) : undefined,
      height: Number.isFinite(a?.height) ? Number(a.height) : undefined,
      title: typeof a?.title === 'string' ? a.title.slice(0, 120) : undefined,
    }))
    .filter((a) => /^https?:\/\//i.test(a.url));
}
