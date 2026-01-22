/**
 * Deep linking utilities for shareable permalinks
 */

/**
 * Generate deep link for anime
 */
export function generateAnimeLink(animeId: string, episodeId?: string): string {
  const base = `${window.location.origin}/anime/${animeId}`;
  return episodeId ? `${base}?episode=${episodeId}` : base;
}

/**
 * Generate deep link for playlist
 */
export function generatePlaylistLink(playlistId: string, shareSlug?: string): string {
  if (shareSlug) {
    return `${window.location.origin}/p/${shareSlug}`;
  }
  return `${window.location.origin}/playlists/${playlistId}`;
}

/**
 * Generate deep link for watch room
 */
export function generateWatchRoomLink(roomId: string): string {
  return `${window.location.origin}/watch-room/${roomId}`;
}

/**
 * Generate deep link for tier list
 */
export function generateTierListLink(tierListId: string): string {
  return `${window.location.origin}/tierlist/${tierListId}`;
}

/**
 * Generate deep link for forum post
 */
export function generateForumPostLink(postId: string): string {
  return `${window.location.origin}/forum/${postId}`;
}

/**
 * Parse deep link
 */
export interface ParsedDeepLink {
  type: 'anime' | 'playlist' | 'watch-room' | 'tierlist' | 'forum' | 'unknown';
  id: string;
  params?: Record<string, string>;
}

export function parseDeepLink(url: string): ParsedDeepLink {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    // Anime: /anime/:id
    const animeMatch = path.match(/^\/anime\/([^/]+)$/);
    if (animeMatch) {
      const params: Record<string, string> = {};
      const episode = urlObj.searchParams.get('episode');
      if (episode) params.episode = episode;
      return { type: 'anime', id: animeMatch[1], params };
    }

    // Playlist: /p/:slug or /playlists/:id
    const playlistSlugMatch = path.match(/^\/p\/([^/]+)$/);
    if (playlistSlugMatch) {
      return { type: 'playlist', id: playlistSlugMatch[1] };
    }
    const playlistMatch = path.match(/^\/playlists\/([^/]+)$/);
    if (playlistMatch) {
      return { type: 'playlist', id: playlistMatch[1] };
    }

    // Watch room: /watch-room/:id
    const watchRoomMatch = path.match(/^\/watch-room\/([^/]+)$/);
    if (watchRoomMatch) {
      return { type: 'watch-room', id: watchRoomMatch[1] };
    }

    // Tier list: /tierlist/:id
    const tierListMatch = path.match(/^\/tierlist\/([^/]+)$/);
    if (tierListMatch) {
      return { type: 'tierlist', id: tierListMatch[1] };
    }

    // Forum: /forum/:id
    const forumMatch = path.match(/^\/forum\/([^/]+)$/);
    if (forumMatch) {
      return { type: 'forum', id: forumMatch[1] };
    }

    return { type: 'unknown', id: '' };
  } catch {
    return { type: 'unknown', id: '' };
  }
}

/**
 * Copy link to clipboard
 */
export async function copyLinkToClipboard(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      document.body.removeChild(textArea);
      return false;
    }
  }
}

/**
 * Share via Web Share API
 */
export async function shareLink(
  url: string,
  title: string,
  text?: string
): Promise<boolean> {
  if (!navigator.share) {
    // Fallback to clipboard
    return copyLinkToClipboard(url);
  }

  try {
    await navigator.share({
      title,
      text: text || title,
      url,
    });
    return true;
  } catch (error: any) {
    // User cancelled or error
    if (error.name !== 'AbortError') {
      // Fallback to clipboard on error
      return copyLinkToClipboard(url);
    }
    return false;
  }
}
