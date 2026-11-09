import { openMediaQuickPeek, peekFromHref, type QuickPeekMedia } from '@/components/media/quickPeekStore';

export type SidebarOpenMode = 'page' | 'quick-view';
const canonicalHosts = new Set(['tatakai.app', 'app.tatakai.app', 'www.tatakai.app', 'tatakai.me', 'app.tatakai.me', 'www.tatakai.me']);
export function normalizeSidebarRoute(value: string, appBase = typeof window !== 'undefined' ? window.location.href : 'https://tatakai.app/'): string | null {
  const input = String(value || '').trim();
  if (!input || input.length > 2048 || input.startsWith('//')) return null;
  try {
    const base = new URL(appBase), absolute = /^[a-z][a-z\d+.-]*:/i.test(input);
    const target = new URL(absolute ? input : input.startsWith('/') ? input : '/' + input, base);
    if (absolute) {
      const sameOrigin = base.origin !== 'null' && target.origin === base.origin;
      const canonical = /^https?:$/.test(target.protocol) && canonicalHosts.has(target.hostname.toLowerCase());
      const native = target.protocol === 'app:' && base.protocol === 'app:' && target.hostname === base.hostname;
      if (!sameOrigin && !canonical && !native) return null;
    }
    const route = target.hash.startsWith('#/') ? target.hash.slice(1) : target.pathname + target.search + target.hash;
    decodeURIComponent(route);
    return route.startsWith('/') && !route.startsWith('//') ? route : null;
  } catch { return null; }
}
export function sidebarQuickPeek(path: string, name: string): QuickPeekMedia | null {
  try {
    const url = new URL(path, 'https://tatakai.app/');
    const match = /^\/(anime|manga|novel)\/([^/]+)\/?$/.exec(url.pathname);
    if (!match) return null;
    const id = decodeURIComponent(match[2]);
    if (!id || ['discover', 'genre', 'read', 'comingsoon'].includes(id.toLowerCase())) return null;
    const peek = peekFromHref(path, { title: name });
    if (!peek) return null;
    const numeric = /^(?:anilist[:_-]?)?(\d+)$/i.exec(id);
    return { ...peek, id, anilistId: numeric ? Number(numeric[1]) : peek.anilistId, enrichIdentity: true };
  } catch { return null; }
}
export function openSidebarLink(link: { path: string; name?: string; mode?: SidebarOpenMode }, navigate: (path: string) => void) {
  const peek = link.mode === 'quick-view' ? sidebarQuickPeek(link.path, link.name || link.path) : null;
  if (peek) openMediaQuickPeek(peek);
  else navigate(link.path);
}
