/**
 * The comment markup token table, shared by the renderer and the translator.
 * One source of truth — CommentContent parses with it, and the translation
 * placeholder pass must protect exactly what the renderer understands.
 */

/** Timestamp token: mm:ss or hh:mm:ss. Seconds/minutes are 2 digits; hours 1-2. */
export const TIMESTAMP_RE = /\b(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)\b/;

export const COMMENT_INLINE_TOKEN_RE = new RegExp(
  [
    '\\|\\|[^|]+\\|\\|',
    '`[^`]+`',
    '\\*\\*[^*]+\\*\\*',
    '~~[^~]+~~',
    '\\*[^*\\n]+\\*',
    '@[a-zA-Z0-9_]{2,32}',
    'https?://[^\\s<]+',
    '(?:\\d{1,2}:)?[0-5]?\\d:[0-5]\\d',
  ].join('|'),
  'g',
);

/**
 * Decode the HTML entities the comment sanitizer (and the GTX engine, which
 * returns serialized HTML) writes into plain text. Single pass — `&amp;lt;`
 * decodes to `&lt;`, never twice. Renderers output React text, so decoded
 * characters are inert.
 */
const HTML_ENTITY_RE = /&(?:lt|gt|quot|#39|#x27|#x2F|nbsp|amp);/gi;
const HTML_ENTITY_MAP: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&#x2f;': '/',
  '&nbsp;': ' ',
  '&amp;': '&',
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(HTML_ENTITY_RE, (entity) => HTML_ENTITY_MAP[entity.toLowerCase()] ?? entity);
}
