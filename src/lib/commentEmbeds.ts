import type { MediaType } from '@/components/community/feed/MediaPicker';

/**
 * Rich "link/share" cards a comment can carry, mirroring what a community feed
 * post can embed (src/components/community/feed/PostEmbeds.tsx). Stored in the
 * comments.embeds jsonb column (migration 20260922200000). Polls are NOT here —
 * they live in the comment_polls side table, same split the feed uses.
 *
 * Kinds:
 *   media    — a shared anime/manga/manhwa/comic (→ /anime/:id or /manga/:id)
 *   playlist — a linked playlist                 (→ /playlist/:id)
 *   tierlist — a linked tier list                (→ /tierlist/:share or /tierlists)
 *   post     — a linked community (forum) post   (→ /community/forum/:id)
 *
 * The renderer reuses the feed's embed cards directly, so the field names here
 * are chosen to feed those components with minimal remapping.
 */
export type CommentEmbed =
  | { kind: 'media'; id: string; name: string; poster?: string | null; mediaType: MediaType }
  | { kind: 'playlist'; id: string }
  | { kind: 'tierlist'; id: string }
  | { kind: 'post'; id: string };

const MAX_EMBEDS = 4;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Coerce whatever came back from the DB (or a client draft) into a bounded,
 * well-typed embed list. Anything malformed is dropped rather than thrown —
 * a comment with a junk embed still renders its text. Bounded to MAX_EMBEDS to
 * match the comments_embeds_shape CHECK so we never send a payload the DB
 * rejects.
 */
export function sanitizeEmbeds(input: unknown): CommentEmbed[] {
  if (!Array.isArray(input)) return [];
  const out: CommentEmbed[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    switch (e.kind) {
      case 'media':
        if (isNonEmptyString(e.id) && isNonEmptyString(e.name)) {
          const known: MediaType[] = ['anime', 'manga', 'manhwa', 'manhua', 'comics'];
          const mt = known.includes(e.mediaType as MediaType)
            ? (e.mediaType as MediaType)
            : ('anime' as MediaType);
          out.push({
            kind: 'media',
            id: e.id,
            name: e.name,
            poster: isNonEmptyString(e.poster) ? e.poster : null,
            mediaType: mt,
          });
        }
        break;
      case 'playlist':
        if (isNonEmptyString(e.id)) out.push({ kind: 'playlist', id: e.id });
        break;
      case 'tierlist':
        if (isNonEmptyString(e.id)) out.push({ kind: 'tierlist', id: e.id });
        break;
      case 'post':
        if (isNonEmptyString(e.id)) out.push({ kind: 'post', id: e.id });
        break;
      default:
        break;
    }
    if (out.length >= MAX_EMBEDS) break;
  }
  return out;
}
