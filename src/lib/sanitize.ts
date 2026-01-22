/**
 * Content sanitization utilities
 * Wrapper around security.ts for easy imports
 */

import { sanitizeHTML, escapeHTML, validateInput } from './security';

/**
 * Sanitize user-generated content (comments, titles, descriptions)
 */
export function sanitizeContent(content: string, options?: { allowHTML?: boolean; maxLength?: number }): string {
  if (!content) return '';
  
  const { allowHTML = false, maxLength = 10000 } = options || {};
  
  // Validate first
  const validation = validateInput(content, maxLength);
  if (!validation.valid) {
    return validation.sanitized || '';
  }
  
  if (allowHTML) {
    return sanitizeHTML(content);
  }
  
  return escapeHTML(content);
}

/**
 * Sanitize comment content
 */
export function sanitizeComment(content: string): string {
  return sanitizeContent(content, { allowHTML: true, maxLength: 5000 });
}

/**
 * Sanitize playlist/tier list title
 */
export function sanitizeTitle(content: string): string {
  return sanitizeContent(content, { allowHTML: false, maxLength: 200 });
}

/**
 * Sanitize description/bio
 */
export function sanitizeDescription(content: string): string {
  return sanitizeContent(content, { allowHTML: true, maxLength: 2000 });
}
