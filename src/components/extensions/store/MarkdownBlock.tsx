/**
 * A small markdown renderer for `readme_text` and version changelogs.
 *
 * The project has no markdown dependency, and the text comes from a third party,
 * so this parses a deliberate subset into React nodes rather than into HTML —
 * there is no `dangerouslySetInnerHTML` here, which is what makes it safe to
 * point at publisher-authored content.
 *
 * Real readmes are not pure markdown. The ones on GitHub open with
 * `<p align="center">` wrappers around an `<img>` logo, use `<br>` for line
 * breaks, `<code>` inline, and lay out capabilities in a pipe table — and the
 * previous version of this file printed every one of those as body copy, so the
 * Toko readme rendered its own HTML source. Alongside the markdown subset
 * (fences, ATX headings, lists, quotes, rules, paragraphs, inline
 * code/bold/italic/links/images) this now understands a small HTML subset and
 * GitHub pipe tables. Anything outside both is dropped tag-first: the markup
 * disappears and its text survives, which is the right failure mode for a readme.
 *
 * Relative targets (`./icon.png`) only resolve against the repository the readme
 * was written for, so they need `baseUrl` — see `githubRawBase` in `store-api`.
 * Without it they are dropped rather than pointed at the app's own origin. A
 * readme's own `#heading` links do work: the headings carry GitHub's slug.
 */
import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MarkdownBlockProps {
  source: string;
  className?: string;
  /** Base for relative image/link targets, e.g. a `raw.githubusercontent.com` root. */
  baseUrl?: string;
}

/** Inline tags kept as elements; every other tag is stripped to its text. */
const INLINE_TAGS = 'code|strong|b|em|i|kbd|sub|sup|ins|del|s|span|small|q|abbr';

/**
 * One pass over a line's inline content. Alternation order is the precedence:
 * `![…](…)` before `[…](…)`, the known tags before the catch-all that eats the
 * unknown ones. Paired tags are matched non-greedily with their closing tag so
 * their contents can be re-parsed rather than escaped.
 */
const INLINE = new RegExp(
  [
    '`[^`]+`',
    '!\\[[^\\]]*\\]\\([^)\\s]+\\)',
    '\\[[^\\]]+\\]\\([^)\\s]+\\)',
    '\\*\\*[^*]+\\*\\*',
    '__[^_]+__',
    '\\*[^*\\n]+\\*',
    '~~[^~]+~~',
    '<!--[\\s\\S]*?-->',
    '<br\\s*/?>',
    '<img\\b[^>]*>',
    '<a\\b[^>]*>[\\s\\S]*?</a\\s*>',
    `<(?:${INLINE_TAGS})\\b[^>]*>[\\s\\S]*?</(?:${INLINE_TAGS})\\s*>`,
    '</?[a-zA-Z][^>]*>',
  ].join('|'),
  'gi',
);

const CODE_CLASS = 'rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-white/85';
const LINK_CLASS =
  'font-semibold text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary';

const HEADING_CLASSES = [
  'font-display mt-6 text-xl font-black tracking-tight text-foreground',
  'font-display mt-6 text-lg font-bold tracking-tight text-foreground',
  'mt-5 text-base font-bold text-white/90',
];

/** Attribute value off a raw tag, quoted or bare. */
function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i').exec(tag);
  return match ? match[1].replace(/^["']|["']$/g, '').trim() : undefined;
}

/** The contents of a balanced `<tag …>…</tag>` token. */
function innerHtml(token: string): string {
  const open = token.indexOf('>');
  const close = token.lastIndexOf('</');
  return open === -1 || close <= open ? '' : token.slice(open + 1, close);
}

/**
 * Absolute target for an image or a link. `javascript:` and friends are never
 * navigable, so they resolve to nothing and the label renders as plain text.
 * Fragments are handled by `linkNode` — they are meaningless for an image.
 */
function resolveTarget(raw: string | undefined, baseUrl?: string): string | undefined {
  const value = String(raw ?? '').trim();
  if (!value) return undefined;
  if (/^(https?:|data:image\/)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('#')) return undefined;
  if (!baseUrl) return undefined;
  return `${baseUrl.replace(/\/+$/, '')}/${value.replace(/^\.\//, '').replace(/^\/+/, '')}`;
}

/**
 * The visible text of an inline string, for a heading's `id`. Markup is stripped
 * rather than rendered, so `## The \`.kai\` bundle` slugs as `the-kai-bundle`.
 */
function plainText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)\s]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim();
}

/**
 * GitHub's own heading-anchor slug, which is what a readme's own `#features`
 * links were written against: lowercase, punctuation dropped, spaces hyphenated.
 */
function slugify(text: string): string {
  return plainText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * An image, or its alt text when the target cannot be resolved — a readme that
 * refers to `./banner.png` with no `baseUrl` should read as prose, not as a
 * broken-image icon. `onError` hides the element for the same reason: a signed or
 * moved asset that 404s leaves no gap.
 */
function imageNode(
  alt: string,
  src: string | undefined,
  key: string,
  baseUrl?: string,
  width?: string,
): ReactNode | null {
  const resolved = resolveTarget(src, baseUrl);
  if (!resolved) return alt ? <Fragment key={key}>{alt}</Fragment> : null;
  const size = Number(String(width ?? '').replace(/px$/i, ''));

  return (
    <img
      key={key}
      src={resolved}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      width={Number.isFinite(size) && size > 0 ? size : undefined}
      className="inline-block h-auto max-w-full rounded-lg align-middle"
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  );
}

/**
 * A link, or its label when the href is not navigable. A readme's own table of
 * contents is a row of `#heading` links, and the headings below carry matching
 * slugs, so those stay real anchors — scrolling the page rather than opening a
 * tab, and never routed through `openExternal`.
 */
function linkNode(
  href: string | undefined,
  label: string,
  key: string,
  baseUrl?: string,
): ReactNode {
  const children = renderInline(label, key, baseUrl);
  const raw = String(href ?? '').trim();

  if (raw.startsWith('#') && raw.length > 1) {
    return (
      <a key={key} href={`#${slugify(raw.slice(1))}`} className={LINK_CLASS}>
        {children}
      </a>
    );
  }

  const resolved = resolveTarget(raw, baseUrl);
  if (!resolved) return <Fragment key={key}>{children}</Fragment>;

  return (
    <a key={key} href={resolved} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
      {children}
    </a>
  );
}

/** `<strong>`, `<code>`, `<kbd>` … — contents re-parsed, tag mapped to a styled node. */
function pairedNode(tag: string, inner: string, key: string, baseUrl?: string): ReactNode {
  const children = renderInline(inner, key, baseUrl);

  switch (tag) {
    case 'code':
      return (
        <code key={key} className={CODE_CLASS}>
          {children}
        </code>
      );
    case 'strong':
    case 'b':
      return (
        <strong key={key} className="font-bold text-white/90">
          {children}
        </strong>
      );
    case 'em':
    case 'i':
      return (
        <em key={key} className="italic text-white/80">
          {children}
        </em>
      );
    case 'kbd':
      return (
        <kbd
          key={key}
          className="rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.8em] text-white/80"
        >
          {children}
        </kbd>
      );
    case 'sub':
      return <sub key={key}>{children}</sub>;
    case 'sup':
      return <sup key={key}>{children}</sup>;
    case 'del':
    case 's':
      return (
        <del key={key} className="text-white/40">
          {children}
        </del>
      );
    default:
      return <Fragment key={key}>{children}</Fragment>;
  }
}

/** One inline token to a node, or null for tokens that leave nothing behind. */
function inlineNode(token: string, key: string, baseUrl?: string): ReactNode | null {
  if (token.startsWith('`')) {
    return (
      <code key={key} className={CODE_CLASS}>
        {token.slice(1, -1)}
      </code>
    );
  }

  if (token.startsWith('![')) {
    const split = token.indexOf('](');
    return imageNode(token.slice(2, split), token.slice(split + 2, -1), key, baseUrl);
  }

  if (token.startsWith('[')) {
    const split = token.indexOf('](');
    return linkNode(token.slice(split + 2, -1), token.slice(1, split), key, baseUrl);
  }

  if (token.startsWith('**') || token.startsWith('__')) {
    return pairedNode('strong', token.slice(2, -2), key, baseUrl);
  }
  if (token.startsWith('~~')) return pairedNode('del', token.slice(2, -2), key, baseUrl);
  if (token.startsWith('*')) return pairedNode('em', token.slice(1, -1), key, baseUrl);

  const lower = token.toLowerCase();
  if (lower.startsWith('<!--')) return null;
  if (lower.startsWith('<br')) return <br key={key} />;
  if (lower.startsWith('<img')) {
    return imageNode(attr(token, 'alt') ?? '', attr(token, 'src'), key, baseUrl, attr(token, 'width'));
  }
  if (lower.startsWith('<a')) return linkNode(attr(token, 'href'), innerHtml(token), key, baseUrl);

  const paired = /^<([a-z][a-z0-9]*)\b[^>]*>[\s\S]*<\/[a-z][a-z0-9]*\s*>$/i.exec(token);
  if (paired) return pairedNode(paired[1].toLowerCase(), innerHtml(token), key, baseUrl);

  return null; // An unknown or unbalanced tag: dropped, its text kept by the caller.
}

function renderInline(text: string, keyPrefix: string, baseUrl?: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;

  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    cursor = match.index + token.length;
    const node = inlineNode(token, `${keyPrefix}-${match.index}`, baseUrl);
    // `INLINE` is shared and `inlineNode` re-enters this function for a paired
    // tag's contents, so the position has to be restored before the next `exec`.
    INLINE.lastIndex = cursor;
    if (node !== null) nodes.push(node);
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/* Block level ------------------------------------------------------------- */

/**
 * Tags whose contents are re-parsed as blocks. `align` is honoured on all of
 * them, which is the whole reason `<p align="center">` needs to be understood
 * rather than stripped: it is how a readme centres its logo and tagline.
 */
const BLOCK_TAG = /^(?:p|div|center|section|article|aside|main|header|footer|figure|figcaption|blockquote|details|summary|h[1-6]|ul|ol|li|table|thead|tbody|tfoot|tr|td|th|picture|dl|dt|dd|pre)$/i;

/** `|:--|:-:|--:|` — a table's alignment row, which needs at least one pipe. */
const TABLE_DELIMITER = /^\s*\|?(?:\s*:?-{1,}:?\s*\|)+\s*:?-{0,}:?\s*\|?\s*$/;

type Align = 'left' | 'center' | 'right';

const ALIGN_CLASS: Record<Align, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function alignOf(cell: string): Align {
  const value = cell.trim();
  if (value.startsWith(':') && value.endsWith(':')) return 'center';
  return value.endsWith(':') ? 'right' : 'left';
}

/**
 * A pipe table. Cells are keyed off the header so a short or long body row lines
 * up with the columns that exist rather than shifting the ones after it, and the
 * wrapper scrolls: a capability table is wider than the detail page's readme
 * column, and the alternative is the whole page scrolling sideways.
 */
function tableNode(
  header: string[],
  aligns: Align[],
  rows: string[][],
  key: string,
  baseUrl?: string,
): ReactNode {
  const alignClass = (column: number) => ALIGN_CLASS[aligns[column] ?? 'left'];

  return (
    <div
      key={key}
      className="mt-4 overflow-x-auto rounded-xl border border-white/[0.07] bg-white/[0.02]"
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/[0.07] bg-white/[0.03]">
            {header.map((cell, column) => (
              <th
                key={column}
                className={cn(
                  'px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70',
                  alignClass(column),
                )}
              >
                {renderInline(cell, `${key}-h${column}`, baseUrl)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-white/[0.04] last:border-b-0">
              {header.map((_, column) => (
                <td
                  key={column}
                  className={cn('px-3 py-2 align-top text-white/60', alignClass(column))}
                >
                  {renderInline(row[column] ?? '', `${key}-${rowIndex}-${column}`, baseUrl)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Span of a `<tag>…</tag>` block starting at the front of `text`, counting nested
 * copies of the same tag so an outer `<div>` is not closed by an inner one. An
 * unterminated tag runs to the end, which is how a truncated readme still renders.
 */
function matchBlock(text: string, tag: string): { inner: string; length: number } | null {
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');

  const open = openRe.exec(text);
  if (!open || open.index !== 0) return null;

  let depth = 1;
  let cursor = openRe.lastIndex;

  while (depth > 0) {
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;
    const nextOpen = openRe.exec(text);
    const nextClose = closeRe.exec(text);

    if (!nextClose) return { inner: text.slice(cursor), length: text.length };

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = openRe.lastIndex;
      continue;
    }

    depth -= 1;
    cursor = closeRe.lastIndex;
    if (depth === 0) {
      return { inner: text.slice(open[0].length, nextClose.index), length: cursor };
    }
  }

  return null;
}

const PRE_CLASS =
  'mt-4 overflow-x-auto rounded-xl border border-white/[0.07] bg-black/40 p-4 text-xs leading-relaxed text-white/70';
const QUOTE_CLASS =
  'mt-4 border-l-2 border-primary/40 pl-4 text-sm italic leading-relaxed text-white/55';

/** A recognised HTML block, with its contents re-parsed as markdown. */
function htmlBlockNode(
  tag: string,
  open: string,
  inner: string,
  key: string,
  baseUrl?: string,
): ReactNode {
  const align = String(attr(open, 'align') ?? (tag === 'center' ? 'center' : '')).toLowerCase();
  const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : '';

  const heading = /^h([1-6])$/.exec(tag);
  if (heading) {
    const level = Math.min(Number(heading[1]), 3);
    const Tag = (['h3', 'h4', 'h5'] as const)[level - 1];
    const text = inner.replace(/\s*\n\s*/g, ' ').trim();
    return (
      <Tag
        key={key}
        id={slugify(text) || undefined}
        className={cn(HEADING_CLASSES[level - 1], alignClass)}
      >
        {renderInline(text, key, baseUrl)}
      </Tag>
    );
  }

  if (tag === 'pre') {
    return (
      <pre key={key} className={PRE_CLASS}>
        <code className="font-mono">
          {inner.replace(/^\n/, '').replace(/<\/?code[^>]*>/gi, '')}
        </code>
      </pre>
    );
  }

  const children = parseBlocks(inner.split('\n'), baseUrl, `${key}i`);
  if (children.length === 0) return null;

  if (tag === 'summary') {
    return (
      <summary
        key={key}
        className={cn('cursor-pointer font-bold text-white/85 [&>*:first-child]:mt-0', alignClass)}
      >
        {children}
      </summary>
    );
  }

  if (tag === 'details') {
    return (
      <details
        key={key}
        className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 [&>*:first-child]:mt-0"
      >
        {children}
      </details>
    );
  }

  if (tag === 'blockquote') {
    return (
      <blockquote key={key} className={cn(QUOTE_CLASS, alignClass)}>
        {children}
      </blockquote>
    );
  }

  return (
    <div key={key} className={cn('mt-4 [&>*:first-child]:mt-0', alignClass)}>
      {children}
    </div>
  );
}

/**
 * Lines to blocks. Recursive: an HTML block's contents come back through here, so
 * a table inside a `<div align="center">` is still a table.
 */
function parseBlocks(lines: string[], baseUrl?: string, seed = 'b'): ReactNode[] {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];

  const key = () => `${seed}-${blocks.length}`;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ');
    paragraph = [];
    const nodes = renderInline(text, key(), baseUrl);
    // Everything on the line may have been markup this renderer drops.
    if (nodes.every((node) => typeof node === 'string' && !node.trim())) return;
    blocks.push(
      <p key={key()} className="mt-3 text-sm leading-relaxed text-white/60">
        {nodes}
      </p>,
    );
  };

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    const items = list.items;
    list = null;
    blocks.push(
      <Tag
        key={key()}
        className={cn(
          'mt-3 space-y-1.5 pl-5 text-sm leading-relaxed text-white/60',
          Tag === 'ol' ? 'list-decimal' : 'list-disc',
        )}
      >
        {items.map((item, index) => (
          <li key={index} className="marker:text-primary/70">
            {renderInline(item, `${key()}-${index}`, baseUrl)}
          </li>
        ))}
      </Tag>,
    );
  };

  const flushQuote = () => {
    if (quote.length === 0) return;
    const text = quote.join(' ');
    quote = [];
    blocks.push(
      <blockquote key={key()} className={QUOTE_CLASS}>
        {renderInline(text, key(), baseUrl)}
      </blockquote>,
    );
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    // Fenced code: consume to the closing fence, or to the end if unterminated.
    if (/^\s*```/.test(line)) {
      flushAll();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push(
        <pre key={key()} className={PRE_CLASS}>
          <code className="font-mono">{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // A comment spanning lines would otherwise leak its text.
    if (/^\s*<!--/.test(line) && !line.includes('-->')) {
      flushAll();
      while (index < lines.length && !lines[index].includes('-->')) index += 1;
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    if (/^\s*(?:[-*_]\s*){3,}$/.test(line) || /^\s*<hr\s*\/?>\s*$/i.test(line)) {
      flushAll();
      blocks.push(<hr key={key()} className="mt-6 border-white/[0.07]" />);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = Math.min(heading[1].length, 3);
      const Tag = (['h3', 'h4', 'h5'] as const)[level - 1];
      blocks.push(
        <Tag
          key={key()}
          id={slugify(heading[2]) || undefined}
          className={HEADING_CLASSES[level - 1]}
        >
          {renderInline(heading[2], key(), baseUrl)}
        </Tag>,
      );
      continue;
    }

    // Pipe table: a header row, an alignment row, then rows until a blank line.
    const next = lines[index + 1] ?? '';
    if (line.includes('|') && next.includes('|') && TABLE_DELIMITER.test(next)) {
      flushAll();
      const header = splitRow(line);
      const aligns = splitRow(next).map(alignOf);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      index -= 1;
      blocks.push(tableNode(header, aligns, rows, key(), baseUrl));
      continue;
    }

    // A block-level tag at the start of a line: consume the whole element.
    const opener = /^\s*<([a-z][a-z0-9]*)\b[^>]*>/i.exec(line);
    if (opener && BLOCK_TAG.test(opener[1])) {
      const tag = opener[1].toLowerCase();
      const rest = lines.slice(index).join('\n');
      const span = matchBlock(rest.slice(rest.indexOf('<')), tag);
      if (span) {
        flushAll();
        const consumed = rest.slice(0, rest.indexOf('<') + span.length).split('\n').length - 1;
        const node = htmlBlockNode(tag, opener[0], span.inner, key(), baseUrl);
        if (node) blocks.push(node);
        index += consumed;
        continue;
      }
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      flushQuote();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    const quoted = /^\s*>\s?(.*)$/.exec(line);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  flushAll();
  return blocks;
}

export function MarkdownBlock({ source, className, baseUrl }: MarkdownBlockProps) {
  const text = String(source ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return null;

  return (
    <div className={cn('min-w-0 break-words [&>*:first-child]:mt-0', className)}>
      {parseBlocks(text.split('\n'), baseUrl)}
    </div>
  );
}
