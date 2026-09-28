// Auto-moderation utilities for content filtering

import { isUrlAllowed } from '@/lib/urlHost';

export interface ModerationResult {
  isAllowed: boolean;
  violations: ModerationViolation[];
  sanitizedContent: string;
}

export interface ModerationViolation {
  type: 'slur' | 'promotion' | 'link' | 'piracy' | 'illegal' | 'spam';
  severity: 'low' | 'medium' | 'high' | 'critical';
  match: string;
  position: number;
}

// Simple pattern matching for moderation.
//
// All word-list patterns use \b word boundaries and are matched against the
// PLAIN-TEXT projection of the content (HTML stripped — see moderateContent),
// so "hello"⊄"hell", "class"⊄"ass", "method"⊄"meth", and the tiptap-emitted
// `class="text-primary font-semibold"` on mention/hashtag spans no longer
// trips the filter. Strong profanity is sanitized (medium) rather than
// hard-blocked so ordinary posts stop being rejected; only genuinely harmful
// content (hard drugs, pirate sites) blocks.
const PATTERNS = {
  slurs: { pattern: /\b(?:fuck\w*|motherfuck\w*|bitch|asshole|bastard|cunt|dick|cock|pussy|whore|slut)\b/i, severity: 'medium' as const },
  promotion: { pattern: /\b(?:buy now|order now|click here|discount code)\b/i, severity: 'medium' as const },
  piracy: { pattern: /\b(?:gogoanime|9anime|kissanime|animekisa)\b|magnet:\?|zoro\.to/i, severity: 'high' as const },
  illegal: { pattern: /\b(?:cocaine|heroin|methamphetamine|fentanyl)\b/i, severity: 'critical' as const },
  spam: { pattern: /(.)\1{15,}/, severity: 'low' as const }, // 15+ repeated characters
  links: { pattern: /https?:\/\/[^\s]+/, severity: 'medium' as const }, // ALL links
};

// Whitelisted domains that are safe
const WHITELIST_DOMAINS = [
  'myanimelist.net',
  'anilist.co',
  'mal.net',
  'kitsu.io',
  'imgur.com',
  'i.imgur.com',
  'tenor.com',
  'giphy.com',
];

// Whitelisted phrases that shouldn't be flagged
const WHITELIST = [
  'recommend',
  'recommendation',
  'follow the anime',
  'follow this',
];

import { logAdminAction } from '@/hooks/admin/useAdminLogs';

/**
 * Check content against moderation rules
 */
export function moderateContent(content: string, userId?: string, source?: string): ModerationResult {
  const violations: ModerationViolation[] = [];
  let sanitizedContent = content;

  // Match against the plain-text projection, not the raw HTML — tiptap emits
  // `class="…"`, `data-*`, and tag names that would otherwise be scanned as
  // prose (e.g. "class" contains "ass"). Strip tags and decode the few entities
  // that could reconstitute a flagged word.
  const scanText = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  try {
    // Check if any whitelist phrases match
    const hasWhitelist = WHITELIST.some(phrase =>
      scanText.toLowerCase().includes(phrase.toLowerCase())
    );

    // Check each pattern
    Object.entries(PATTERNS).forEach(([type, { pattern, severity }]) => {
      try {
        let match;

        // Use global search
        const globalRegex = new RegExp(pattern.source, 'g' + (pattern.flags?.includes('i') ? 'i' : ''));
        while ((match = globalRegex.exec(scanText)) !== null) {
          const matchText = match[0];

          // Special handling for links — the host must be allowlisted. Compared as a
          // parsed hostname, not a substring: `matchText.includes(domain)` used to let
          // https://evil.com/?ref=giphy.com through. See `@/lib/urlHost`.
          if (type === 'links') {
            if (isUrlAllowed(matchText, WHITELIST_DOMAINS)) {
              continue; // Skip this link, it's allowed
            }
          }

          // Skip if whitelisted phrase. Not applied to links: a URL can embed any
          // phrase, so "https://evil.com/recommend" would otherwise pass.
          if (type !== 'links' && hasWhitelist && WHITELIST.some(p => matchText.toLowerCase().includes(p.toLowerCase()))) {
            continue;
          }

          violations.push({
            type: type as ModerationViolation['type'],
            severity,
            match: matchText,
            position: match.index,
          });

          sanitizedContent = sanitizedContent.replace(matchText, '*'.repeat(matchText.length));
        }
      } catch (e) {
        console.error(`Pattern error for ${type}:`, e);
      }
    });

    const hasBlockingViolation = violations.some(
      v => v.severity === 'critical' || v.severity === 'high'
    );

    // Log blocking violations if userId provided
    if (hasBlockingViolation && userId) {
      // Fire and forget logging
      logAdminAction(
        userId,
        'automod_violation',
        source || 'content',
        undefined,
        {
          violations: violations.map(v => ({ type: v.type, match: v.match })),
          original_content: content.substring(0, 1000) // Truncate if too long
        }
      ).catch(err => console.error('Failed to log automod violation:', err));
    }

    return {
      isAllowed: !hasBlockingViolation,
      violations,
      sanitizedContent: hasBlockingViolation ? sanitizedContent : content,
    };
  } catch (error) {
    console.error('Moderation error:', error);
    return {
      isAllowed: true,
      violations: [],
      sanitizedContent: content
    };
  }
}

/**
 * Quick check if content should be blocked
 */
export function isContentBlocked(content: string): boolean {
  const result = moderateContent(content);
  return !result.isAllowed;
}

/**
 * Get human-readable violation message
 */
export function getViolationMessage(violations: ModerationViolation[]): string {
  if (violations.length === 0) return '';

  const critical = violations.filter(v => v.severity === 'critical');
  const high = violations.filter(v => v.severity === 'high');

  if (critical.length > 0) {
    return 'Your content contains prohibited language. Please review and try again.';
  }

  if (high.length > 0) {
    return 'Your content was flagged for potentially harmful content. Please review and try again.';
  }

  return 'Your content was modified to comply with community guidelines.';
}

