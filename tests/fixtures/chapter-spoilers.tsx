import { expect } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { PornhwaChapterDetails } from '../../src/components/manga/PornhwaChapterDetails';

const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.test' });
const original = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT };
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const root = createRoot(document.getElementById('root')!);
const series = { id: 137, identity: { pornhwaId: '137' }, characters: [{ id: 1, name: 'Character fixture', image: 'https://images.example/character.svg' }], chapters: [{ chapterStart: 1, chapterEnd: 3, characters: [1], tags: ['Scene fixture'] }] };
const render = async (hideSpoilers: boolean) => { await act(async () => root.render(<MemoryRouter><PornhwaChapterDetails series={series} chapterNumber={2} hideSpoilers={hideSpoilers} /></MemoryRouter>)); };
try {
  await render(true);
  expect(document.querySelectorAll('img')).toHaveLength(1);
  expect(document.querySelector('a')?.getAttribute('href')).toContain('characterIds=1');
  expect(document.body.textContent).not.toContain('Scene fixture');
  await act(async () => document.querySelector<HTMLButtonElement>('button')!.click());
  expect(document.body.textContent).toContain('Scene fixture');
  await render(false);
  expect(document.body.textContent).toContain('Scene fixture');
  expect(document.querySelector('button')).toBeNull();
  await render(true);
  expect(document.body.textContent).not.toContain('Scene fixture');
  console.log('CHAPTER_PORTRAITS_SPOILER_REVEAL_AND_PREFERENCE_OK');
} finally { await act(async () => root.unmount()); Object.assign(globalThis, original); dom.window.close(); }
