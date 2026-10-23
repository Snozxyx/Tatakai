/**
 * Comment translation slots.
 *
 * Comments are plain text with the tiny markup subset the composer produces
 * (`||spoiler||`, `` `code` ``, `**bold**`, `*italic*`, `~~strike~~`,
 * `@mention`, links, timestamps). Marking all of those up to an MT engine would
 * let it mangle mentions and eat spoiler fences, so every token is swapped for
 * a stable `‹n›` placeholder first — the same convention the OpenAI-compatible
 * provider system prompt already promises to preserve — and only the remaining
 * prose is translated. Placeholders are restored afterwards; if the engine
 * returns an unknown slot the block falls back to the original text.
 */

import { COMMENT_INLINE_TOKEN_RE } from '@/lib/commentMarkup';

export interface PreparedCommentBlock {
  /** Text with protected tokens replaced by ‹n› placeholders. */
  forTranslation: string;
  /** Protected tokens in slot order (may be empty when nothing was protected). */
  tokens: string[];
  /** False when the remaining prose holds no letters — nothing to translate. */
  translatable: boolean;
}

export function protectCommentMarkup(block: string): PreparedCommentBlock {
  const tokens: string[] = [];
  COMMENT_INLINE_TOKEN_RE.lastIndex = 0;
  const forTranslation = block.replace(COMMENT_INLINE_TOKEN_RE, (token) => {
    tokens.push(token);
    return `‹${tokens.length - 1}›`;
  });
  return {
    forTranslation,
    tokens,
    translatable: /[\p{L}]/u.test(forTranslation.replace(/‹\d+›/gu, '')),
  };
}

const PLACEHOLDER_RE = /‹\s*(\d+)\s*›/u;

/**
 * Put the protected tokens back into a translated block. Returns null when the
 * engine invented or echoed an unusable slot list, so the caller can keep the
 * original text instead.
 */
export function restoreCommentMarkup(text: string, tokens: string[]): string | null {
  if (!tokens.length) return text;
  let valid = true;
  const restored = text.replace(/‹\s*(\d+)\s*›/gu, (match, digits: string) => {
    const index = Number(digits);
    if (!Number.isInteger(index) || index < 0 || index >= tokens.length) {
      valid = false;
      return match;
    }
    return tokens[index];
  });
  if (!valid) return null;
  return restored;
}
