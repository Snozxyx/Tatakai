import { expect,test } from 'bun:test';
import source from '../toko/,/src/providers/novel/syosetu';
import { clearNovelHttpCache } from '../toko/,/src/providers/novel/novel-http';
test('Part 5 maps only author chapters 461–677, labels Japanese and excludes afterwords',async()=>{
 const original=globalThis.fetch;let calls=0;clearNovelHttpCache();
 globalThis.fetch=(async(url:any)=>{
  calls++;
  if(String(url).includes('/461/'))return new Response('<h1 class="p-novel__title--rensai">プロローグ</h1><div class="p-novel__text"><p>本を読む。</p><p><ruby>図書館<rt>としょかん</rt></ruby>へ行く。</p></div><div class="p-novel__text p-novel__text--afterword"><p>Author note</p></div>');
  const page=Number(new URL(String(url)).searchParams.get('p'));const start=(page-1)*100+1,end=Math.min(page*100,677);
  return new Response(Array.from({length:end-start+1},(_,i)=>`<a class="p-eplist__subtitle" href="/n4830bu/${start+i}/">Chapter ${start+i}</a>`).join(''));
 })as typeof fetch;
 try{
  const match=await source.search!('Ascendance of a Bookworm: Part 5');expect(match[0].id).toBe('n4830bu:5');
  expect(await source.search!('Ascendance of a Bookworm: Part 4')).toEqual([]);
  const chapters=await source.getChapters({seriesId:match[0].id});expect(chapters.length).toBe(217);expect(chapters[0].sources[0].language).toBe('ja');expect(chapters[0].sources[0].chapterKey).toBe('syosetu:n4830bu:5:461');expect(chapters.at(-1)?.number).toBe(217);
  const content=await source.getContent(chapters[0].sources[0].chapterKey);expect(content?.paragraphs.map(p=>p.text)).toEqual(['本を読む。','図書館へ行く。']);
  const before=calls;expect(await source.getContent('syosetu:n4830bu:5:460')).toBeNull();expect(calls).toBe(before);
 }finally{globalThis.fetch=original;clearNovelHttpCache();}
});
