import { expect, test } from 'bun:test';
import provider from '../toko/,/src/providers/novel/lightnovelto';
test('LightNovel.to matches clean card titles and fetches the full chapter catalog', async () => {
  const original = globalThis.fetch;
  const visited: string[] = [];
  globalThis.fetch = (async (url: string) => {
    visited.push(String(url));
    if (String(url).includes('/search?q=')) return new Response('<a class="ln-ncard" href="/novel/example"><h3>Example Novel</h3><p>999 chapters</p></a>');
    if (String(url).includes('/api/novel-chapters')) return Response.json({ chapters: [{ slug: 'chapter-1', number: 1, title: 'First' }, { slug: 'chapter-2', number: 2, title: 'Second' }] });
    if (String(url).includes('/chapter-1')) return new Response('<div id="chapter-content"><p>The first paragraph.</p><p>The second paragraph.</p></div>');
    return new Response('<a href="/novel/example/chapter-1">Chapter 1</a>');
  }) as typeof fetch;
  try {
    const chapters = await provider.getChapters({ titles: ['Example Novel'] });
    expect(chapters.length).toBe(2); expect(visited[0]).toContain('/search?q=Example%20Novel');
    const content = await provider.getContent(chapters[0].sources[0].chapterKey);
    expect(content?.paragraphs.map(p => p.text)).toEqual(['The first paragraph.', 'The second paragraph.']);
    const before = visited.length;
    expect(await provider.getContent('lightnovelto:https%3A%2F%2Fevil.example%2Fchapter-1')).toBeNull();
    expect(visited.length).toBe(before);
  } finally { globalThis.fetch = original; }
});
