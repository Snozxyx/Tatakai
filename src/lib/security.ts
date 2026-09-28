/**
 * Security utilities for production-grade protection
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 */
export function sanitizeHTML(dirty: string): string {
  if (typeof window === 'undefined') {
    // Server-side: basic sanitization
    return dirty
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // Client-side: use DOMPurify
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/**
 * Sanitize stored HTML at render time.
 *
 * Write-time sanitization only proves what *that* build's DOMPurify config allowed. Rows
 * already in the database were sanitized by whatever config was in force when they were
 * written, so anything rendered through `dangerouslySetInnerHTML` must be re-sanitized
 * here, at display time, with the config that is current.
 *
 * Same tag allowlist as `sanitizeHTML`, plus anchor hardening: every link is forced to
 * `target="_blank" rel="noopener noreferrer nofollow ugc"` so user content cannot reach
 * the opening window or lend it ranking weight.
 */
export function sanitizeRichTextHTML(dirty: string): string {
  if (!dirty) return '';

  if (typeof window === 'undefined') {
    // No DOM to purify against; fall back to escaping so nothing renders as markup.
    return escapeHTML(dirty);
  }

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 's', 'u'],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'object', 'embed'],
    FORBID_ATTR: ['style', 'srcset', 'formaction'],
    RETURN_TRUSTED_TYPE: false,
  });
}

/**
 * Register the anchor-hardening hook once, on first use in a browser context.
 *
 * DOMPurify hooks are global to the instance, so this also hardens anchors produced by
 * `sanitizeHTML` at write time. That is the intended direction — a stored link picking up
 * `rel="noopener"` costs nothing — but it does mean output shape depends on whether this
 * has run, so it is called at module scope by the render component rather than lazily.
 */
let anchorHookInstalled = false;
export function installRichTextSanitizerHooks(): void {
  if (anchorHookInstalled || typeof window === 'undefined') return;
  anchorHookInstalled = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName !== 'A') return;
    const el = node as unknown as HTMLAnchorElement;
    if (!el.getAttribute('href')) {
      el.removeAttribute('target');
      el.removeAttribute('rel');
      return;
    }
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer nofollow ugc');
  });
}

/**
 * Escape HTML entities
 */
export function escapeHTML(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Generate CSRF token
 */
export function generateCSRFToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Store CSRF token in sessionStorage
 */
export function setCSRFToken(): string {
  const token = generateCSRFToken();
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('csrf_token', token);
  }
  return token;
}

/**
 * Get CSRF token from sessionStorage
 */
export function getCSRFToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('csrf_token');
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(token: string | null): boolean {
  const stored = getCSRFToken();
  return stored !== null && token === stored;
}

/**
 * Redact PII from logs
 */
export function redactPII(text: string): string {
  // Email
  text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');

  // Phone numbers
  text = text.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');

  // Credit cards
  text = text.replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, '[CARD_REDACTED]');

  // IP addresses (optional - might want to keep for security)
  // text = text.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP_REDACTED]');

  return text;
}

/**
 * Validate input to prevent injection attacks
 */
export function validateInput(input: string, maxLength = 10000): { valid: boolean; sanitized: string; error?: string } {
  if (!input || typeof input !== 'string') {
    return { valid: false, sanitized: '', error: 'Invalid input type' };
  }

  if (input.length > maxLength) {
    return { valid: false, sanitized: '', error: `Input exceeds maximum length of ${maxLength}` };
  }

  // Check for common malicious patterns (script tags, etc.) - XSS is handle by sanitizeHTML below
  // We remove the overly aggressive SQL patterns which were causing false positives for regular text

  // Sanitize HTML
  const sanitized = sanitizeHTML(input);

  return { valid: true, sanitized };
}

/**
 * Check if origin is allowed (CORS validation)
 */
export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.some(allowed => {
    if (allowed === origin) return true;
    // Support wildcard subdomains
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      return origin.endsWith(domain);
    }
    return false;
  });
}
