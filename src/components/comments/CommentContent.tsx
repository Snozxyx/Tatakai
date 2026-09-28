import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { getGlobalVideo } from '@/core/player/global-video-ref';
import { SpoilerSpan } from '@/components/community/SpoilerSpan';

/**
 * Comment body renderer. Comments are stored as plain text with a small,
 * deliberately-tiny markup subset that the composer's toolbar produces:
 *
 *   `code`   **bold**   *italic*   ~~strike~~   @mention   https://links
 *
 * Everything is parsed into React nodes — there is no `dangerouslySetInnerHTML`
 * here, so no stored string can inject markup. Unlike the readme renderer this
 * intentionally does NOT understand images-from-text or raw HTML: a comment's
 * only images are its structured attachments, never its body.
 */

const MENTION_CLASS =
  'font-medium text-primary hover:underline underline-offset-2';
const CODE_CLASS =
  'rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground/85';
const LINK_CLASS =
  'text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary break-all';
const TIMESTAMP_CLASS =
  'inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[0.85em] text-primary hover:bg-primary/25 transition-colors cursor-pointer';

// Timestamp token: mm:ss or hh:mm:ss. The surrounding \b-ish guards (via the
// alternation order) keep it from swallowing bare numbers. Seconds/minutes are
// 2 digits; hours 1-2. Matched only when it looks like a real time.
const TIMESTAMP_RE = /\b(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)\b/;

const INLINE = new RegExp(
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

/** Parse "1:23" / "1:02:03" → total seconds, or null if not a timestamp. */
export function parseTimestamp(token: string): number | null {
  const m = token.match(/^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)$/);
  if (!m) return null;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

/** Usernames @-mentioned in a body, lowercased and de-duplicated. */
export function extractMentionUsernames(content: string): string[] {
  const out = new Set<string>();
  const re = /@([a-zA-Z0-9_]{2,32})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.add(m[1].toLowerCase());
  return [...out];
}

/**
 * How a timestamp token (e.g. "0:42") should behave:
 *  - 'seek'  : seek the on-page player to that time (watch/anime page).
 *  - a builder fn: return an href to open elsewhere (global feed → open the
 *    episode at that time). Given the seconds, returns a URL or null.
 *  - undefined: render as plain text (no player context).
 */
export type TimestampTarget =
  | 'seek'
  | ((seconds: number) => string | null)
  | undefined;

function TimestampToken({ token, seconds, target }: { token: string; seconds: number; target: TimestampTarget }) {
  if (target === 'seek') {
    return (
      <button
        type="button"
        className={TIMESTAMP_CLASS}
        onClick={() => {
          const v = getGlobalVideo();
          if (v) {
            v.currentTime = seconds;
            void v.play?.().catch(() => {});
          }
        }}
      >
        {token}
      </button>
    );
  }
  if (typeof target === 'function') {
    const href = target(seconds);
    if (href) {
      return (
        <Link to={href} className={TIMESTAMP_CLASS}>
          {token}
        </Link>
      );
    }
  }
  // No player context — show the timestamp as inert styled text.
  return <span className="font-mono text-foreground/80">{token}</span>;
}

function inlineNode(token: string, key: string, timestampTarget: TimestampTarget): ReactNode {
  // Timestamp first — before the generic fallthrough — but only when it parses.
  if (TIMESTAMP_RE.test(token)) {
    const seconds = parseTimestamp(token);
    if (seconds != null) {
      return <TimestampToken key={key} token={token} seconds={seconds} target={timestampTarget} />;
    }
  }
  if (token.startsWith('||')) {
    return <SpoilerSpan key={key}>{token.slice(2, -2)}</SpoilerSpan>;
  }
  if (token.startsWith('`')) {
    return (
      <code key={key} className={CODE_CLASS}>
        {token.slice(1, -1)}
      </code>
    );
  }
  if (token.startsWith('**')) {
    return (
      <strong key={key} className="font-semibold">
        {token.slice(2, -2)}
      </strong>
    );
  }
  if (token.startsWith('~~')) {
    return (
      <s key={key} className="text-foreground/50">
        {token.slice(2, -2)}
      </s>
    );
  }
  if (token.startsWith('*')) {
    return (
      <em key={key} className="italic">
        {token.slice(1, -1)}
      </em>
    );
  }
  if (token.startsWith('@')) {
    const name = token.slice(1);
    return (
      <Link key={key} to={`/@${name}`} className={MENTION_CLASS}>
        {token}
      </Link>
    );
  }
  if (/^https?:\/\//i.test(token)) {
    return (
      <a key={key} href={token} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
        {token}
      </a>
    );
  }
  return <Fragment key={key}>{token}</Fragment>;
}

function renderInline(text: string, keyPrefix: string, timestampTarget: TimestampTarget): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;

  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    nodes.push(inlineNode(match[0], `${keyPrefix}-${match.index}`, timestampTarget));
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function CommentContent({
  content,
  className,
  timestampTarget,
  clamp = false,
}: {
  content: string;
  className?: string;
  /** Enables clickable video timestamps. See TimestampTarget. */
  timestampTarget?: TimestampTarget;
  /** Collapse long bodies to ~6 lines behind a "Show more" toggle. */
  clamp?: boolean;
}) {
  const text = String(content ?? '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  // While clamped, measure whether the body actually overflows so the toggle
  // only appears for genuinely long comments.
  useLayoutEffect(() => {
    if (!clamp || expanded) return;
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight - el.clientHeight > 4);
  }, [clamp, expanded, content]);

  const body = (
    <p
      ref={ref}
      className={cn(
        'text-sm text-foreground/90 break-words whitespace-pre-wrap',
        clamp && !expanded && 'line-clamp-6',
        className,
      )}
    >
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {renderInline(line, `l${i}`, timestampTarget)}
        </Fragment>
      ))}
    </p>
  );

  if (!clamp) return body;

  return (
    <div>
      {body}
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 text-xs font-semibold text-primary hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
