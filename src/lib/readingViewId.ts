export type ReadingMediaKind='manga'|'novel';
/** Only current catalog identities are counted, never obsolete provider slugs. */
export function readingViewId(id?:string|number|null,anilistId?:string|number|null):string|undefined {
  const explicit=String(anilistId??'').trim();
  const raw=String(id??'').trim();
  const numeric=/^[1-9]\d{0,9}$/.test(explicit)?explicit:/^(?:anilist:)?([1-9]\d{0,9})$/i.exec(raw)?.[1];
  if(numeric)return `anilist:${Number(numeric)}`;
  const uuid=/^(?:catalog:)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(raw)?.[1];
  return uuid?`catalog:${uuid.toLowerCase()}`:undefined;
}
