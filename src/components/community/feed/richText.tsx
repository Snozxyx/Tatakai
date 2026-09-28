import { Link } from 'react-router-dom';
import { createElement, Fragment, type ReactNode } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import { ProfileWidgetCard } from '@/components/profile/ProfileWidgetCard';
import { SpoilerSpan } from '@/components/community/SpoilerSpan';

const TOKEN = /(@[a-zA-Z0-9_]{2,30}|#[a-zA-Z0-9_]{1,50})/g;

/** Extract lowercased hashtags from post content (no leading #). */
export function extractHashtags(text: string): string[] {
  const tags = new Set<string>();
  const re = /#([a-zA-Z0-9_]{1,50})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) tags.add(m[1].toLowerCase());
  return [...tags];
}

/** Extract @usernames from post content (no leading @). */
export function extractMentions(text: string): string[] {
  const names = new Set<string>();
  const re = /@([a-zA-Z0-9_]{2,30})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) names.add(m[1]);
  return [...names];
}

/** Render post content with @mentions and #hashtags as links. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const name = part.slice(1);
          return (
            <Link
              key={i}
              to={`/@${name}`}
              onClick={(e) => e.stopPropagation()}
              className="text-primary hover:underline"
            >
              {part}
            </Link>
          );
        }
        if (part.startsWith('#')) {
          const tag = part.slice(1).toLowerCase();
          return (
            <Link
              key={i}
              to={`/community?tag=${encodeURIComponent(tag)}`}
              onClick={(e) => e.stopPropagation()}
              className="text-primary hover:underline"
            >
              {part}
            </Link>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

// ── HTML content (tiptap output) ────────────────────────────────────────────
const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'span'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class', 'data-mention', 'data-user-id', 'data-label', 'data-hashtag', 'data-tag', 'data-spoiler'];
const RENDER_TAGS = new Set(['p', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote', 'h2', 'h3', 'ul', 'ol', 'li', 'span']);

/**
 * Some legacy rows stored the tiptap HTML entity-escaped (e.g. `&lt;p&gt;…`), so
 * it would fail the tag test below and render as literal `<p>` text. If we see
 * escaped tag markers and no real tags, decode them back to HTML first.
 */
function maybeDecodeEntities(value: string): string {
  if (/&lt;\/?[a-z]/i.test(value) && !/<[a-z]/i.test(value)) {
    return new DOMParser().parseFromString(value, 'text/html').body.textContent || value;
  }
  return value;
}

function nodeToReact(node: ChildNode, key: string): ReactNode {
  if (node.nodeType === 3) return node.textContent; // text
  if (node.nodeType !== 1) return null; // non-element
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map((c, i) => nodeToReact(c, `${key}-${i}`));

  if (tag === 'span' && el.hasAttribute('data-mention')) {
    const uid = el.getAttribute('data-user-id') || undefined;
    const label = el.getAttribute('data-label') || (el.textContent || '').replace(/^@/, '');
    const trigger = <span className="cursor-pointer font-semibold text-primary hover:underline">@{label}</span>;
    return uid ? (
      <ProfileWidgetCard key={key} userId={uid} username={label}>{trigger}</ProfileWidgetCard>
    ) : (
      <Link key={key} to={`/@${label}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-primary hover:underline">@{label}</Link>
    );
  }
  if (tag === 'span' && el.hasAttribute('data-hashtag')) {
    const t = (el.getAttribute('data-tag') || (el.textContent || '').replace(/^#/, '')).toLowerCase();
    return (
      <Link key={key} to={`/community?tag=${encodeURIComponent(t)}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-primary hover:underline">#{t}</Link>
    );
  }
  if (tag === 'span' && el.hasAttribute('data-spoiler')) {
    return <SpoilerSpan key={key}>{children.length ? children : undefined}</SpoilerSpan>;
  }
  if (tag === 'br') return <br key={key} />;
  if (tag === 'a') {
    const href = el.getAttribute('href') || '#';
    return (
      <a key={key} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{children}</a>
    );
  }
  if (RENDER_TAGS.has(tag)) return createElement(tag, { key }, children.length ? children : undefined);
  return <Fragment key={key}>{children}</Fragment>;
}

/**
 * Render stored post/comment content. tiptap emits HTML; older rows are plain
 * text — if no tags are present we fall back to the {@link RichText} linkifier
 * so legacy posts keep their clickable @mentions/#hashtags.
 */
export function RichContent({ html, className }: { html?: string | null; className?: string }) {
  const value = maybeDecodeEntities(html || '');
  if (!/<[a-z][\s\S]*>/i.test(value)) {
    return <div className={cn('whitespace-pre-wrap break-words', className)}><RichText text={value} /></div>;
  }
  const clean = DOMPurify.sanitize(value, { ALLOWED_TAGS, ALLOWED_ATTR });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  const nodes = Array.from(doc.body.childNodes).map((n, i) => nodeToReact(n, `n-${i}`));
  return <div className={cn('rich-content break-words [&_h2]:text-lg [&_h2]:font-bold [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:rounded [&_code]:bg-white/[0.08] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs', className)}>{nodes}</div>;
}
