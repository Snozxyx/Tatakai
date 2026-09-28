import { sanitizeEmbeds, type CommentEmbed } from '@/lib/commentEmbeds';

/**
 * A community's long-form fields (rules / about / "detail") are stored in single
 * `text` columns on `communities`, but the editor is the same rich composer the
 * comments use — so a field can carry formatted text AND shared media/playlist/
 * tierlist/post embeds ([[community-feed-platform]]).
 *
 * We serialise `{ content, embeds }` as JSON into that one text column. A leading
 * `{` lets the parser tell a rich doc from any legacy plain-text value that was
 * stored before this: legacy text (or anything that fails to parse) is treated as
 * a plain body with no embeds, so nothing ever renders as raw JSON.
 */
export interface CommunityDoc {
  content: string;
  embeds: CommentEmbed[];
}

interface StoredDoc {
  v: 1;
  content: string;
  embeds: CommentEmbed[];
}

/** Serialise a rich doc for storage. Returns '' when the doc is entirely empty. */
export function serializeCommunityDoc(doc: CommunityDoc): string {
  const content = (doc.content ?? '').trim();
  const embeds = sanitizeEmbeds(doc.embeds);
  if (!content && embeds.length === 0) return '';
  const stored: StoredDoc = { v: 1, content, embeds };
  return JSON.stringify(stored);
}

/** Parse a stored value (rich JSON, or legacy plain text) into a rich doc. */
export function parseCommunityDoc(raw: string | null | undefined): CommunityDoc {
  const s = (raw ?? '').trim();
  if (!s) return { content: '', embeds: [] };
  if (s.startsWith('{')) {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      if (o && typeof o === 'object' && ('content' in o || 'embeds' in o)) {
        return {
          content: typeof o.content === 'string' ? o.content : '',
          embeds: sanitizeEmbeds(o.embeds),
        };
      }
    } catch {
      // Not JSON — fall through and treat the whole string as plain text.
    }
  }
  return { content: s, embeds: [] };
}

/** True when a stored value has neither body text nor embeds. */
export function communityDocIsEmpty(raw: string | null | undefined): boolean {
  const doc = parseCommunityDoc(raw);
  return !doc.content.trim() && doc.embeds.length === 0;
}
