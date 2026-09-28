// Render-time HTML sanitization — see src/lib/security.ts
//
// The write-time pass (`sanitizeHTML`) only proves what the config in force *at write
// time* allowed. Rows already in the database went through an older config, so
// `sanitizeRichTextHTML` runs again at display time. These tests pin what it strips.
//
// DOMPurify needs a real DOM, so jsdom is registered as globals *before* the module under
// test is imported: the default DOMPurify export binds to `window` on first evaluation,
// which is why the import below is dynamic.
//
// jsdom rather than happy-dom deliberately. happy-dom's NodeIterator does not implement
// the spec's pre-removal steps, so the iterator goes dead the first time DOMPurify removes
// a node and every later sibling is skipped — under happy-dom even DOMPurify's *default*
// config leaves `<iframe>` and `<embed>` standing. A sanitizer cannot be tested against a
// DOM that reports it did nothing.
import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { JSDOM } from 'jsdom';

const { window: win } = new JSDOM('', { url: 'https://tatakai.test/' });
(globalThis as Record<string, unknown>).window = win;
const GLOBAL_KEYS = [
  'document', 'Node', 'NodeFilter', 'Element', 'HTMLElement', 'HTMLAnchorElement',
  'HTMLTemplateElement', 'HTMLFormElement', 'DocumentFragment', 'Document', 'DOMParser',
  'NamedNodeMap', 'MutationObserver', 'Text', 'Comment', 'getComputedStyle', 'trustedTypes',
] as const;
for (const key of GLOBAL_KEYS) {
  const value = (win as unknown as Record<string, unknown>)[key];
  if (value === undefined) continue;
  try {
    (globalThis as Record<string, unknown>)[key] = value;
  } catch {
    // Some globals are getter-only on the host; DOMPurify reads them off `window` anyway.
  }
}

const { sanitizeRichTextHTML, installRichTextSanitizerHooks } = await import('../src/lib/security');

// Production installs the hook at module scope (src/components/ui/safe-html.tsx), so the
// hardened-anchor behaviour is what every test below should see. Called twice on purpose:
// the guard flag has to make the second call a no-op, or the hook stacks on every import.
installRichTextSanitizerHooks();
installRichTextSanitizerHooks();

const ANCHOR_REL = 'noopener noreferrer nofollow ugc';

describe('sanitizeRichTextHTML — script execution vectors', () => {
  test('drops script elements and their contents', () => {
    expect(sanitizeRichTextHTML('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>');
  });

  test('drops inline event handlers but keeps the element', () => {
    expect(sanitizeRichTextHTML('<p onclick="alert(1)">text</p>')).toBe('<p>text</p>');
  });

  test('drops img entirely, so onerror has nothing to attach to', () => {
    expect(sanitizeRichTextHTML('<img src=x onerror="alert(1)">')).toBe('');
  });

  test('drops iframe, object and embed', () => {
    expect(
      sanitizeRichTextHTML('<iframe src="https://evil.com"></iframe><object data="x"></object><embed src="x">')
    ).toBe('');
  });

  test('drops form controls', () => {
    expect(sanitizeRichTextHTML('<form action="/x"><input name="p"></form>')).toBe('');
  });

  test('drops svg and its script payload', () => {
    expect(sanitizeRichTextHTML('<svg><script>alert(1)</script></svg>')).toBe('');
  });

  test('drops style elements and style attributes', () => {
    expect(sanitizeRichTextHTML('<style>p{color:red}</style><p style="position:fixed">x</p>')).toBe('<p>x</p>');
  });

  test('keeps the text of an unknown wrapper rather than the wrapper', () => {
    // KEEP_CONTENT is on: stripping a tag must not silently delete what the user wrote.
    expect(sanitizeRichTextHTML('<div><span>kept</span></div>')).toBe('kept');
  });
});

describe('sanitizeRichTextHTML — the formatting authors are allowed', () => {
  const ALLOWED = ['b', 'i', 'em', 'strong', 'p', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 's', 'u'];

  test('every allowlisted tag survives a round trip', () => {
    for (const tag of ALLOWED) {
      expect(sanitizeRichTextHTML(`<${tag}>x</${tag}>`)).toBe(`<${tag}>x</${tag}>`);
    }
  });

  test('br survives', () => {
    expect(sanitizeRichTextHTML('a<br>b')).toBe('a<br>b');
  });

  test('title is kept on an anchor', () => {
    const clean = sanitizeRichTextHTML('<a href="https://anilist.co/x" title="t">l</a>');
    expect(clean).toContain('title="t"');
  });

  test('empty and nullish input yields an empty string, not "null"', () => {
    expect(sanitizeRichTextHTML('')).toBe('');
    expect(sanitizeRichTextHTML(null as unknown as string)).toBe('');
    expect(sanitizeRichTextHTML(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeRichTextHTML — href schemes', () => {
  test('keeps http, https and mailto', () => {
    for (const href of ['https://anilist.co/a', 'http://anilist.co/a', 'mailto:a@b.co']) {
      expect(sanitizeRichTextHTML(`<a href="${href}">l</a>`)).toContain(`href="${href}"`);
    }
  });

  test('strips javascript:, data:, vbscript: and blob: hrefs but keeps the link text', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox', 'blob:https://x/y']) {
      const clean = sanitizeRichTextHTML(`<a href="${href}">click</a>`);
      expect(clean).not.toContain('href=');
      expect(clean).toContain('click');
    }
  });

  test('strips a protocol-relative href, which resolves to an arbitrary origin', () => {
    expect(sanitizeRichTextHTML('<a href="//evil.com/x">l</a>')).not.toContain('href=');
  });

  test('strips a case-and-whitespace obfuscated javascript: href', () => {
    const clean = sanitizeRichTextHTML('<a href="JaVaScRiPt&#58;alert(1)">l</a>');
    expect(clean).not.toContain('href=');
  });
});

describe('sanitizeRichTextHTML — anchor hardening', () => {
  test('a real link is forced to a new tab with a hardened rel', () => {
    const clean = sanitizeRichTextHTML('<a href="https://anilist.co/x">l</a>');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain(`rel="${ANCHOR_REL}"`);
  });

  test('an author-supplied target and rel are overwritten, not merged', () => {
    const clean = sanitizeRichTextHTML('<a href="https://anilist.co/x" target="_self" rel="dofollow">l</a>');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain(`rel="${ANCHOR_REL}"`);
    expect(clean).not.toContain('_self');
    expect(clean).not.toContain('dofollow');
  });

  test('an anchor left hrefless by scheme filtering gets no target or rel', () => {
    // Otherwise a stripped javascript: link still renders as something clickable-looking.
    const clean = sanitizeRichTextHTML('<a href="javascript:alert(1)">l</a>');
    expect(clean).not.toContain('target=');
    expect(clean).not.toContain('rel=');
  });
});

describe('sanitizeRichTextHTML — without a DOM', () => {
  // The module falls back to entity escaping when `window` is missing. That branch has to
  // emit no markup at all: it is the one path where DOMPurify never runs.
  function withoutWindow<T>(fn: () => T): T {
    const saved = (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).window;
    try {
      return fn();
    } finally {
      (globalThis as Record<string, unknown>).window = saved;
    }
  }

  test('escapes rather than sanitizes', () => {
    const clean = withoutWindow(() => sanitizeRichTextHTML('<script>alert(1)</script>'));
    expect(clean).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('never emits an angle bracket', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (raw) => {
        const clean = withoutWindow(() => sanitizeRichTextHTML(raw));
        return !clean.includes('<') && !clean.includes('>');
      }),
      { numRuns: 200 }
    );
  });
});

describe('sanitizeRichTextHTML properties', () => {
  // Assembled from hostile fragments rather than arbitrary unicode: the interesting inputs
  // are the ones a parser has to make a decision about.
  const fragment = fc.constantFrom(
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="https://evil.com"></iframe>',
    '<a href="javascript:alert(1)">l</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">l</a>',
    '<a href="https://anilist.co/x">ok</a>',
    '<svg onload=alert(1)>',
    '<style>@import url(//evil.com)</style>',
    '<p onmouseover="alert(1)">t</p>',
    '<b>bold</b>',
    '<form><input onfocus=alert(1) autofocus></form>',
    '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    '"><script>alert(1)</script>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    'plain text & ampersand',
    '<blockquote>q</blockquote>'
  );
  const dirty = fc.array(fragment, { minLength: 1, maxLength: 6 }).map((parts) => parts.join(''));

  test('output never carries a script element or an inline handler', () => {
    fc.assert(
      fc.property(dirty, (raw) => {
        const clean = sanitizeRichTextHTML(raw).toLowerCase();
        return !clean.includes('<script') && !/\son[a-z]+\s*=/.test(clean);
      }),
      { numRuns: 300 }
    );
  });

  test('output never carries a javascript: or data: URL', () => {
    fc.assert(
      fc.property(dirty, (raw) => {
        const clean = sanitizeRichTextHTML(raw).toLowerCase();
        return !clean.includes('javascript:') && !clean.includes('data:');
      }),
      { numRuns: 300 }
    );
  });

  test('sanitizing is idempotent, so re-rendering stored output cannot drift', () => {
    fc.assert(
      fc.property(dirty, (raw) => {
        const once = sanitizeRichTextHTML(raw);
        return sanitizeRichTextHTML(once) === once;
      }),
      { numRuns: 300 }
    );
  });

  test('every surviving anchor is hardened', () => {
    fc.assert(
      fc.property(dirty, (raw) => {
        const clean = sanitizeRichTextHTML(raw);
        const anchors = clean.match(/<a\b[^>]*>/g) ?? [];
        return anchors.every((a) => !a.includes('href=') || (a.includes('target="_blank"') && a.includes(ANCHOR_REL)));
      }),
      { numRuns: 300 }
    );
  });
});




