import { useEffect } from 'react';

const destinations: Record<string, () => Promise<unknown>> = {
  home: () => import('@/pages/base/HomeGate'),
  browse: () => import('@/pages/base/Index'),
  search: () => import('@/pages/base/SearchPage'),
  anime: () => import('@/pages/watch/AnimePage'),
  manga: () => import('@/pages/manga/MangaHomePage'),
  novel: () => import('@/pages/novel/NovelHomePage'),
  community: () => import('@/pages/community/CommunityFeedPage'),
  profile: () => import('@/pages/profile/ProfilePage'),
  notifications: () => import('@/pages/profile/NotificationsPage'),
  tierlists: () => import('@/pages/profile/TierListPage'),
  playlists: () => import('@/pages/profile/PlaylistPage'),
  isshoni: () => import('@/pages/watch/IsshoNiPage'),
  extensions: () => import('@/pages/base/ExtensionHubPage'),
};

export function routePreloadKey(pathname: string): string | undefined {
  if (pathname === '/') return 'home';
  const [, section, detail, child] = pathname.split('/');
  if (!child && detail && !['discover', 'genre', 'comingsoon'].includes(detail)) {
    if (section === 'manga') return 'manga-detail';
    if (section === 'novel') return 'novel-detail';
  }
  return section in destinations ? section : undefined;
}

const loaders: Record<string, () => Promise<unknown>> = {
  ...destinations,
  'manga-detail': () => import('@/pages/manga/MangaPage'),
  'novel-detail': () => import('@/pages/novel/NovelPage'),
};

/** Warm code on navigation intent, rather than downloading every page on startup. */
export function useRoutePreload() {
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return;
    const warmed = new Set<string>();
    const warm = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const pathname = url.hash.startsWith('#/') ? url.hash.slice(1).split(/[?#]/)[0] : url.pathname;
      const key = routePreloadKey(pathname);
      if (!key || warmed.has(key)) return;
      warmed.add(key);
      void loaders[key]().catch(() => warmed.delete(key));
    };
    document.addEventListener('pointerover', warm, { passive: true });
    document.addEventListener('focusin', warm);
    document.addEventListener('pointerdown', warm, { passive: true });
    return () => {
      document.removeEventListener('pointerover', warm);
      document.removeEventListener('focusin', warm);
      document.removeEventListener('pointerdown', warm);
    };
  }, []);
}
