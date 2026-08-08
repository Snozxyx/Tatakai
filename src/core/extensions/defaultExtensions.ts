/**
 * officialExtensions.ts
 *
 * Curated list of first-party / officially endorsed extensions.
 * These are always shown in the Extension Hub under "Official Extensions"
 * with an "Official" badge — they are NOT auto-installed.
 *
 * Users install them like any other extension from the hub.
 */

import type { ExtensionManifest } from '@/pages/base/ExtensionHubPage';

export const OFFICIAL_EXTENSIONS: ExtensionManifest[] = [
  {
    id: 'tatakai.extension.toko',
    name: 'Toko',
    description: [
      'Toko** is the official all-in-one Tatakai extension — your single source for anime streaming, torrent discovery, and manga reading.',
      '',
      '**🎬 Anime Direct Stream**',
      'Animepahe · Anikoto · Mkissa · Anizone · Senshi · Animeya · Toonstream · Reanime · Aniworld · 4Anime.gg · Animelok · Watchanimeworld · Hindidubbed · Desidub · Animesalt',
      '',
      '**⚡ Anime Torrent**',
      'Nyaa · ACG.RIP · Acgnx · Aniliberty · Animetosho · SubPlease · Seadex · nekoBT',
      '',
      '**📖 Manga**',
      'Animesama · AsuraScan · Atsumaru · AllManga · MangaFire',
    ].join('\n'),
    version: '1.0.0',
    author: 'Snozxyx',
    icon: 'https://raw.githubusercontent.com/Snozxyx/toko-extension/refs/heads/main/31653372-dd79-4551-bace-aa79339f2864-pastel-chibi-anime-girl-cute-anime-pfp-ideas-1.png',
    banner:
      'https://raw.githubusercontent.com/Snozxyx/toko-extension/refs/heads/main/videoframe_987.png',
    screenshots: [],
    categories: ['Anime Stream', 'Torrent', 'Manga', 'Preview', 'Website-first Indexing', 'official'],
    permissions: [
      'network:domain:acg.rip',
      'network:domain:animetosho.org',
      'network:domain:subsplease.org',
      'network:domain:releases.moe',
      'network:domain:nekobt.com',
      'network:domain:acgnx.se',
      'network:domain:aniliberty.moe',
      'network:domain:allmanga.to',
      'network:domain:atsu.moe',
      'network:domain:mangafire.to',
      'network:domain:anime-sama.fr',
      'network:domain:asuracomic.net',
    ],
    isApproved: true,
    downloads: 0,
    rating: 5,
    updatedAt: new Date().toISOString(),
    type: 'custom',
    status: 'approved',
  },
];

/** Raw .kai bundle URL — used when the user clicks "Install" on an Official extension */
export const OFFICIAL_EXTENSION_URLS: Record<string, string> = {
  'tatakai.extension.toko':
    'https://raw.githubusercontent.com/Snozxyx/toko-extension/refs/heads/main/toko.kai',
};
