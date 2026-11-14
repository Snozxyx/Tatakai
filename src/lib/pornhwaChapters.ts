import type { PornhwaIdentity } from './pornhwaIdentity';

export interface PornhwaCharacter { id: number | string; name: string; image?: string }
export interface PornhwaChapter {
  chapterStart: number | string;
  chapterEnd?: number | string | null;
  characters?: Array<PornhwaCharacter | number | string>;
  tags?: Array<string | { name?: string }>;
}
export interface PornhwaSeries {
  id: number;
  identity: PornhwaIdentity;
  characters: PornhwaCharacter[];
  chapters: PornhwaChapter[];
}

/** Curated chapter ranges use PornhwaDB character IDs, independently of AniList IDs. */
export function pornhwaChapterAppearances(series: PornhwaSeries | null | undefined, chapterNumber: number | null) {
  if (!series || chapterNumber == null || !Number.isFinite(chapterNumber)) return null;
  const matching = (series.chapters || []).filter(chapter => {
    const start = Number(chapter.chapterStart);
    const end = chapter.chapterEnd == null ? start : Number(chapter.chapterEnd);
    return Number.isFinite(start) && Number.isFinite(end) && chapterNumber >= start && chapterNumber <= end;
  });
  if (!matching.length) return null;
  const known = new Map((series.characters || []).map(character => [String(character.id), character]));
  const characters = new Map<string, PornhwaCharacter>();
  const tags = new Set<string>();
  for (const chapter of matching) {
    for (const reference of chapter.characters || []) {
      const id = String(typeof reference === 'object' ? reference.id : reference);
      const character = typeof reference === 'object' ? { ...known.get(id), ...reference, image: reference.image || known.get(id)?.image } : known.get(id);
      if (character?.name) characters.set(id, character);
    }
    for (const tag of chapter.tags || []) {
      const name = typeof tag === 'string' ? tag : tag.name;
      if (name?.trim()) tags.add(name.trim());
    }
  }
  return { characters: [...characters.values()], tags: [...tags] };
}
