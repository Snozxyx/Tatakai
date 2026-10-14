import { expect, test } from 'bun:test';
import { TokoBundleClass } from '../toko/,/src/core/bundle';
import { NOVEL_PROVIDERS } from '../toko/,/src/providers/registry';
test('automatic mapping searches aliases and scrapes the matched provider id', async () => {
  const provider = NOVEL_PROVIDERS.find(p => p.name === 'wuxiaworld')!;
  const search = provider.search, chapters = provider.getChapters;
  const queried: string[] = []; let scraped = '';
  provider.search = async query => { queried.push(query); return query.toLowerCase() === 'english title' ? [{ id: 'matched-book', title: 'English Title' }] : [{ id: 'wrong-book', title: 'Something Else' }]; };
  provider.getChapters = async params => { scraped = params.seriesId || ''; return [{ number: 1, title: 'First', volume: null, sources: [{ provider: 'wuxiaworld', chapterKey: 'wuxiaworld:matched-book:first', providerChapterId: 'matched-book:first', language: 'en', translator: null, releaseDate: null }] }]; };
  try {
    const result = await new TokoBundleClass().getNovelChapters({ provider: 'wuxiaworld', titles: ['Romaji Title', 'English Title'] });
    expect(queried).toEqual(['Romaji Title', 'English Title']); expect(scraped).toBe('matched-book'); expect(result.length).toBe(1);
    scraped = '';
    await new TokoBundleClass().getNovelChapters({ provider: 'wuxiaworld', titles: ['Unrelated Title'] });
    expect(scraped).toBe('');
  } finally { provider.search = search; provider.getChapters = chapters; }
});

test('novel matching preserves subtitles and sequel numbers',async()=>{
 const {pickBestNovelCandidate}=await import('../toko/,/src/utils/novel-title-match');
 expect(pickBestNovelCandidate(['Overgeared'],[{id:'fanfic',title:'Overgeared: Sage of Convergence'}])).toBeNull();
 expect(pickBestNovelCandidate(['Book'],[{id:'sequel',title:'Book 2'}])).toBeNull();
 expect(pickBestNovelCandidate(['Overgeared'],[{id:'fanfic',title:'Overgeared: Sage of Convergence'},{id:'original',title:'Overgeared'}])?.candidate.id).toBe('original');
});
