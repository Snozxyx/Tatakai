// Auto-moderation utilities for content filtering

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

// Simple pattern matching for moderation
const PATTERNS = {
  slurs: { pattern: /shit|damn|hell|ass|bitch|asshole|bastard|crap|fuck|motherfuck|piss|dick|cock|pussy|whore|slut/i, severity: 'critical' as const },
  promotion: { pattern: /buy now|order now|click here|discount code/i, severity: 'medium' as const },
  piracy: { pattern: /torrent|magnet:|gogoanime|9anime|kissanime|zoro\.to|animekisa/i, severity: 'high' as const },
  illegal: { pattern: /drugs?|cocaine|heroin|methamphetamine|weed|cannabis|meth/i, severity: 'critical' as const },
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
  'example.com',
];

// Whitelisted phrases that shouldn't be flagged
const WHITELIST = [
  'recommend',
  'recommendation',
  'follow the anime',
  'follow this',
];

import { logAdminAction } from '@/hooks/useAdminLogs';

/**
 * Check content against moderation rules
 */
export function moderateContent(content: string, userId?: string, source?: string): ModerationResult {
  const violations: ModerationViolation[] = [];
  let sanitizedContent = content;

  try {
    // Check if any whitelist phrases match
    const hasWhitelist = WHITELIST.some(phrase =>
      content.toLowerCase().includes(phrase.toLowerCase())
    );

    // Check each pattern
    Object.entries(PATTERNS).forEach(([type, { pattern, severity }]) => {
      try {
        let match;

        // Use global search
        const globalRegex = new RegExp(pattern.source, 'g' + (pattern.flags?.includes('i') ? 'i' : ''));
        while ((match = globalRegex.exec(content)) !== null) {
          const matchText = match[0];

          // Special handling for links - check if domain is whitelisted
          if (type === 'links') {
            const isWhitelistedDomain = WHITELIST_DOMAINS.some(domain =>
              matchText.toLowerCase().includes(domain.toLowerCase())
            );
            if (isWhitelistedDomain) {
              continue; // Skip this link, it's allowed
            }
          }

          // Skip if whitelisted phrase
          if (hasWhitelist && WHITELIST.some(p => matchText.toLowerCase().includes(p.toLowerCase()))) {
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
