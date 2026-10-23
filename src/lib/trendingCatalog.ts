/** Legacy provider slug suffixes are not AniList IDs. */
export function canonicalTrendingAniListId(value:unknown):number|undefined {
  const match=/^(?:anilist[:_-])?([1-9]\d*)$/i.exec(String(value??'').trim());
  if(!match)return undefined;
  const id=Number(match[1]);
  return Number.isSafeInteger(id)&&id<=2147483647?id:undefined;
}
export function resolvedTrendingEntries<Row,Card extends {id:string;poster:string}>(rows:Row[],resolve:(row:Row)=>Card|null|undefined){
  const seen=new Set<string>();
  return rows.flatMap(row=>{
    const card=resolve(row);
    if(!card?.id||!card.poster||seen.has(card.id))return [];
    seen.add(card.id);return [{row,card}];
  });
}
