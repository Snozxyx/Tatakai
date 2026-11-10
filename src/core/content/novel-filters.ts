import type { NovelSearchOptions } from './novel-client';

const genres = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror',
  'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance',
  'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
];
const key = (value: string) => value.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
const genreNames = new Map(genres.map(genre => [key(genre), genre]));
// These browse links describe AniList tags, not genres.
const tagNames = new Map([['isekai', 'Isekai'], ['historical', 'Historical'], ['martial arts', 'Martial Arts']]);

export function normalizeNovelFilters(options: NovelSearchOptions): NovelSearchOptions {
  if (!options.genre?.trim()) return options;
  const slug = key(options.genre);
  if (slug === 'hentai') return { ...options, genre: undefined, adultOnly: true };
  const tag = tagNames.get(slug);
  if (tag) return { ...options, genre: undefined, tags: [...new Set([...(options.tags || []), tag])] };
  return { ...options, genre: genreNames.get(slug) || options.genre.trim() };
}

export function mangaBakaGenre(genre?: string): string | undefined {
  return genre?.trim().toLowerCase().replace(/[\s-]+/g, '_') || undefined;
}
