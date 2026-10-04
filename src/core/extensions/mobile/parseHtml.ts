/**
 * parseHtml.ts — DOMParser-backed `__tatakai_parse_html__` for the in-WebView
 * extension runtime.
 *
 * The desktop worker implements this with cheerio (a Node HTML parser) and
 * exposes a small chainable adapter — `find / first / attr / text / html /
 * each` — that Toko/Aurora provider adapters call. In the WebView we already
 * have a real, fast HTML parser (`DOMParser`), so we reimplement the exact same
 * adapter over live DOM nodes instead of shipping cheerio. The surface must
 * match `desktop/runtime/extension/extension-sandbox.cjs` (CheerioLikeAPI)
 * one-for-one so the same bundle runs unchanged.
 */

export interface CheerioLikeAPI {
  find(selector: string): CheerioLikeAPI;
  first(): CheerioLikeAPI;
  attr(name: string): string | undefined;
  text(): string;
  html(): string | null;
  each(callback: (index: number, el: CheerioLikeAPI) => void): CheerioLikeAPI;
}

/** Wrap a static list of elements in the chainable, cheerio-shaped adapter. */
function wrap(nodes: Element[]): CheerioLikeAPI {
  return {
    find(selector: string): CheerioLikeAPI {
      const out: Element[] = [];
      const seen = new Set<Element>();
      for (const node of nodes) {
        node.querySelectorAll(selector).forEach((el) => {
          if (!seen.has(el)) {
            seen.add(el);
            out.push(el);
          }
        });
      }
      return wrap(out);
    },
    first(): CheerioLikeAPI {
      return wrap(nodes.length ? [nodes[0]] : []);
    },
    attr(name: string): string | undefined {
      const first = nodes[0];
      if (!first) return undefined;
      return first.hasAttribute(name) ? first.getAttribute(name) ?? undefined : undefined;
    },
    text(): string {
      return nodes.map((n) => n.textContent ?? '').join('');
    },
    html(): string | null {
      return nodes[0] ? nodes[0].innerHTML : null;
    },
    each(callback: (index: number, el: CheerioLikeAPI) => void): CheerioLikeAPI {
      nodes.forEach((n, i) => callback(i, wrap([n])));
      return wrap(nodes);
    },
  };
}

export function parseHtml(html: string): CheerioLikeAPI {
  if (typeof html !== 'string' || html.length === 0) {
    const err = new Error('InvalidInputError: html must be a non-empty string');
    err.name = 'InvalidInputError';
    throw err;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Root selection = the document element, so `.find(sel)` searches the whole
  // tree exactly like cheerio's `$.root()`.
  return wrap([doc.documentElement]);
}
