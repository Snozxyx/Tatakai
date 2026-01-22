/**
 * Playlist export/import utilities
 */

import { Playlist, PlaylistItem } from '@/hooks/usePlaylist';

export interface ExportedPlaylist {
  name: string;
  description: string | null;
  items: Array<{
    anime_id: string;
    anime_name: string;
    anime_poster: string | null;
  }>;
  exported_at: string;
  version: string;
}

/**
 * Export playlist to JSON
 */
export function exportPlaylistToJSON(
  playlist: Playlist,
  items: PlaylistItem[]
): string {
  const exported: ExportedPlaylist = {
    name: playlist.name,
    description: playlist.description,
    items: items.map((item) => ({
      anime_id: item.anime_id,
      anime_name: item.anime_name,
      anime_poster: item.anime_poster,
    })),
    exported_at: new Date().toISOString(),
    version: '1.0',
  };

  return JSON.stringify(exported, null, 2);
}

/**
 * Export playlist to OPML
 */
export function exportPlaylistToOPML(
  playlist: Playlist,
  items: PlaylistItem[]
): string {
  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXML(playlist.name)}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
    <outline text="${escapeXML(playlist.name)}" title="${escapeXML(playlist.name)}">
${items
  .map(
    (item) =>
      `      <outline text="${escapeXML(item.anime_name)}" title="${escapeXML(
        item.anime_name
      )}" type="anime" animeId="${escapeXML(item.anime_id)}" />`
  )
  .join('\n')}
    </outline>
  </body>
</opml>`;

  return opml;
}

/**
 * Import playlist from JSON
 */
export function importPlaylistFromJSON(json: string): ExportedPlaylist {
  try {
    const parsed = JSON.parse(json) as ExportedPlaylist;

    if (!parsed.name || !Array.isArray(parsed.items)) {
      throw new Error('Invalid playlist format');
    }

    return parsed;
  } catch (error) {
    throw new Error('Failed to parse playlist JSON');
  }
}

/**
 * Import playlist from OPML
 */
export function importPlaylistFromOPML(opml: string): ExportedPlaylist {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(opml, 'text/xml');

    const titleElement = doc.querySelector('head > title');
    const outlineElement = doc.querySelector('body > outline');

    if (!titleElement || !outlineElement) {
      throw new Error('Invalid OPML format');
    }

    const name = titleElement.textContent || 'Imported Playlist';
    const items: ExportedPlaylist['items'] = [];

    outlineElement.querySelectorAll('outline').forEach((outline) => {
      const animeId = outline.getAttribute('animeId');
      const animeName = outline.getAttribute('title') || outline.getAttribute('text') || '';

      if (animeId && animeName) {
        items.push({
          anime_id: animeId,
          anime_name: animeName,
          anime_poster: null,
        });
      }
    });

    return {
      name,
      description: null,
      items,
      exported_at: new Date().toISOString(),
      version: '1.0',
    };
  } catch (error) {
    throw new Error('Failed to parse playlist OPML');
  }
}

/**
 * Escape XML special characters
 */
function escapeXML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Download file
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
