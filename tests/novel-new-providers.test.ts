import { expect, test } from 'bun:test';
import ddl from '../toko/,/src/providers/novel/divinedaolibrary';
import buddy from '../toko/,/src/providers/novel/novelbuddy';

const DDL_SEARCH = `<a class="card__link-list-link" href="https://www.divinedaolibrary.com/story/example-novel/">Example Novel</a>
<a class="card__link-list-link" href="https://www.divinedaolibrary.com/story/example-novel/example-novel-chapter-1/">Chapter 1 link (not a series)</a>`;

const DDL_SERIES = `<div class="chapter-group"><button><span>Volume 1 - Beginnings</span></button>
<ol class="chapter-group__list">
<li><a class="chapter-group__list-item-link" href="https://www.divinedaolibrary.com/story/example-novel/example-novel-chapter-1/">Chapter 1, Awakening</a><div><time datetime="1564104057">July 26, 2019</time></div></li>
<li><a class="chapter-group__list-item-link" href="https://www.divinedaolibrary.com/story/example-novel/example-novel-chapter-2/">Chapter 2, Departure</a></li>
</ol></div>`;

const DDL_CHAPTER = `<h1 class="chapter__title">Chapter 1, Awakening</h1>
<section id="chapter-content"><p><strong>Translator: Someone</strong></p><p>First paragraph.</p><p>Second paragraph.</p></section>`;

test('DivineDaoLibrary maps stories, full chapter catalog and paragraphs', async () => {
  const original = globalThis.fetch;
  const visited: string[] = [];
  globalThis.fetch = (async (url: string) => {
    visited.push(String(url));
    if (String(url).includes('/?s=')) return new Response(DDL_SEARCH);
    if (String(url).endsWith('/story/example-novel/')) return new Response(DDL_SERIES);
    if (String(url).includes('chapter-1')) return new Response(DDL_CHAPTER);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  try {
    const chapters = await ddl.getChapters({ titles: ['Example Novel'] });
    expect(chapters.length).toBe(2);
    expect(chapters[0].number).toBe(1);
    expect(chapters[0].title).toBe('Awakening');
    expect(chapters[0].sources[0].provider).toBe('divinedaolibrary');
    expect(visited[0]).toContain('/?s=Example%20Novel');
    const content = await ddl.getContent(chapters[0].sources[0].chapterKey);
    // Translator credit line is filtered; story paragraphs survive.
    expect(content?.title).toBe('Chapter 1, Awakening');
    expect(content?.paragraphs.map((p) => p.text)).toEqual(['First paragraph.', 'Second paragraph.']);
    const before = visited.length;
    expect(await ddl.getContent('divinedaolibrary:https%3A%2F%2Fevil.example%2Fstory%2Fx%2Fy%2F')).toBeNull();
    expect(visited.length).toBe(before);
  } finally {
    globalThis.fetch = original;
  }
});

const BUDDY_SEARCH_HTML = `<script src="/_next/static/abc123XYZ/_buildManifest.js"></script>`;
const BUDDY_SEARCH_JSON = {
  pageProps: {
    ssrItems: [
      { slug: 'example-novel', name: 'Example Novel' },
      { slug: 'unrelated-other', name: 'Unrelated Other' },
    ],
  },
};
const BUDDY_SERIES_JSON = {
  pageProps: {
    initialManga: {
      chapters: [
        { number: 2, name: 'Chapter 2', url: '/example-novel/chapter-2', updatedAt: '2026-01-02' },
        { number: 1, name: 'Chapter 1', url: '/example-novel/chapter-1', updatedAt: '2026-01-01' },
      ],
    },
  },
};
const BUDDY_CHAPTER_JSON = {
  pageProps: {
    initialChapter: {
      name: 'Chapter 1',
      number: 1,
      content: '<p>Buddy first.</p><p>Buddy second.</p>',
    },
  },
};

test('NovelBuddy resolves build id and reads search/chapters/content JSON', async () => {
  const original = globalThis.fetch;
  const visited: string[] = [];
  globalThis.fetch = (async (url: string) => {
    visited.push(String(url));
    if (String(url).endsWith('/search')) return new Response(BUDDY_SEARCH_HTML);
    if (String(url).includes('/search.json')) return Response.json(BUDDY_SEARCH_JSON);
    if (String(url).includes('/example-novel/chapter-1.json')) return Response.json(BUDDY_CHAPTER_JSON);
    if (String(url).includes('/example-novel.json')) return Response.json(BUDDY_SERIES_JSON);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  try {
    const chapters = await buddy.getChapters({ titles: ['Example Novel'] });
    expect(chapters.length).toBe(2);
    expect(chapters.map((c) => c.number)).toEqual([1, 2]);
    expect(chapters[0].sources[0].provider).toBe('novelbuddy');
    expect(chapters[0].sources[0].chapterKey.startsWith('novelbuddy:')).toBe(true);
    const content = await buddy.getContent(chapters[0].sources[0].chapterKey);
    expect(content?.number).toBe(1);
    expect(content?.paragraphs.map((p) => p.text)).toEqual(['Buddy first.', 'Buddy second.']);
    const before = visited.length;
    expect(await buddy.getContent('novelbuddy:https%3A%2F%2Fevil.example%2Fx%2Fy')).toBeNull();
    expect(visited.length).toBe(before);
  } finally {
    globalThis.fetch = original;
  }
});
