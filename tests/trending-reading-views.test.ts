import {expect,test} from 'bun:test';
import {canonicalTrendingAniListId,resolvedTrendingEntries} from '../src/lib/trendingCatalog';
import {readingViewId} from '../src/lib/readingViewId';
test('trending IDs never reinterpret retired provider suffixes or other namespaces as AniList',()=>{
  expect(canonicalTrendingAniListId('11415')).toBe(11415);
  expect(canonicalTrendingAniListId('anilist:16498')).toBe(16498);
  for(const id of ['frieren-beyond-journeys-end-season-2-20409','mal:21','novel:21','https://example.com/21','99999999999','0'])expect(canonicalTrendingAniListId(id)).toBeUndefined();
});
test('the board removes unresolved entries and duplicate identities without leaving rank gaps',()=>{
  const rows=[{id:'old-slug'},{id:'21'},{id:'anilist:21'},{id:'16498'}];
  const result=resolvedTrendingEntries(rows,row=>{
    const id=canonicalTrendingAniListId(row.id);
    return id?{id:`anilist:${id}`,poster:`https://covers.test/${id}.jpg`}:null;
  });
  expect(result.map(item=>item.card.id)).toEqual(['anilist:21','anilist:16498']);
  expect(result.map((_,index)=>index+1)).toEqual([1,2]);
});
test('reading counts share canonical IDs across cards and details but reject legacy slugs',()=>{
  expect(readingViewId('anilist:30013')).toBe(readingViewId(30013));
  expect(readingViewId('old-slug',30013)).toBe('anilist:30013');
  expect(readingViewId('mal:30013')).toBeUndefined();
  expect(readingViewId('old-slug-30013')).toBeUndefined();
  expect(readingViewId('11111111-1111-4111-8111-111111111111')).toBe('catalog:11111111-1111-4111-8111-111111111111');
});
