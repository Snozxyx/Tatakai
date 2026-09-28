/**
 * SafeHtml — the only sanctioned way to render stored user HTML.
 *
 * Write-time sanitization is not sufficient on its own. A row written last year passed
 * through last year's DOMPurify config; if that config allowed a tag we later decided was
 * unsafe, the row is still sitting in the database carrying it. So the sanitizer runs
 * again here, at render, against the config that is current.
 *
 * Use this instead of `dangerouslySetInnerHTML` for anything a user authored. If you find
 * yourself reaching for the raw prop, that is the signal to widen
 * `sanitizeRichTextHTML`'s allowlist instead.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { installRichTextSanitizerHooks, sanitizeRichTextHTML } from '@/lib/sanitize';

// The anchor-hardening hook is global to DOMPurify, so it has to be installed before the
// first sanitize call. Module scope runs once per bundle, ahead of any render.
installRichTextSanitizerHooks();

export interface SafeHtmlProps {
  /** Stored HTML, as it came out of the database. Sanitized here — do not pre-trust it. */
  html: string | null | undefined;
  className?: string;
  /** Wrapper element. `div` by default; use `span` inline. */
  as?: 'div' | 'span' | 'p';
}

export function SafeHtml({ html, className, as: Tag = 'div' }: SafeHtmlProps) {
  const clean = useMemo(() => sanitizeRichTextHTML(html ?? ''), [html]);

  if (!clean) return null;

  return (
    <Tag
      className={cn('break-words', className)}
      // Safe by construction: `clean` is the output of `sanitizeRichTextHTML` on the line
      // above, and there is no path into this prop that skips it.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

export default SafeHtml;
