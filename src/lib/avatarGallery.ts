export type AvatarGender = 'male' | 'female' | 'any';

export interface GalleryCharacter {
  id: number;
  gender?: string | null;
  name?: { full?: string };
  image?: { large?: string; medium?: string };
}

export function selectGalleryCharacters(rows: GalleryCharacter[], gender: AvatarGender) {
  const seen = new Set<number>();
  return rows.filter(row => {
    if (!row.id || seen.has(row.id) || !row.image?.large) return false;
    if (gender !== 'any' && row.gender?.trim().toLowerCase() !== gender) return false;
    seen.add(row.id);
    return true;
  });
}

/** Only explicit provider metadata establishes gender; never infer it from a request. */
export async function fetchAvatarGallery(endpoint: string, gender: AvatarGender, limit = 12, fetcher = fetch) {
  const rows: GalleryCharacter[] = [];
  const query = `query ($page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      characters(sort: FAVOURITES_DESC) { id gender name { full } image { large medium } }
    }
  }`;
  for (let page = 1; page <= 5; page++) {
    const response = await fetcher(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { page } }),
    });
    if (!response.ok) throw new Error('Could not load avatars. Please retry.');
    const result = await response.json();
    if (result.errors?.length || !Array.isArray(result.data?.Page?.characters)) {
      throw new Error('Could not load avatars. Please retry.');
    }
    rows.push(...result.data.Page.characters);
    if (!result.data.Page.pageInfo?.hasNextPage) break;
  }
  const matches = selectGalleryCharacters(rows, gender);
  for (let i = matches.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [matches[i], matches[j]] = [matches[j], matches[i]];
  }
  return matches.slice(0, limit).map(row => ({
    id: `anilist-character-${row.id}`, url: row.image!.large!, rating: 'safe',
    gender: row.gender?.toLowerCase() === 'male' ? 'male' as const
      : row.gender?.toLowerCase() === 'female' ? 'female' as const : 'any' as const,
    provider: 'AniList', animeName: row.name?.full,
  }));
}
