import { expect, test } from 'bun:test';
import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { PostDrafts } from '../src/components/community/PostDrafts';

test('drafts restore every field after remount, stay account-scoped, and clear only on publication', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.test' });
  const previous = { window: globalThis.window, document: globalThis.document,
    HTMLFormElement: globalThis.HTMLFormElement, HTMLElement: globalThis.HTMLElement, HTMLSelectElement: globalThis.HTMLSelectElement,
    localStorage: globalThis.localStorage, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLFormElement: dom.window.HTMLFormElement, HTMLElement: dom.window.HTMLElement, HTMLSelectElement: dom.window.HTMLSelectElement,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.confirm = () => true;
  const root = createRoot(dom.window.document.getElementById('root')!);
  const value = { title: 'Draft title', content: '<p>Full formatting</p>', poll: { choices: ['Yes','No'] }, images: ['https://example.com/image.png'], spoiler: true, communityId: 'community' };
  let restored: typeof value | undefined;
  const publishRef = createRef<(() => void) | null>() as React.MutableRefObject<(() => void) | null>;
  const render = (userId: string) => act(async () => { root.render(<PostDrafts userId={userId} scope="feed" value={value} title={value.title} onRestore={(draft) => { restored = draft; }} publishRef={publishRef} />); });
  try {
    await render('alice');
    await act(async () => { (dom.window.document.querySelector('button') as HTMLButtonElement).click(); });
    expect(JSON.parse(localStorage.getItem('tatakai-post-drafts:alice:feed')!)[0].value).toEqual(value);
    await act(async () => root.render(null));
    await render('alice');
    const select = dom.window.document.querySelector('select')!;
    await act(async () => { select.value = select.options[1].value; select.dispatchEvent(new dom.window.Event('change', {bubbles:true})); });
    expect(restored).toEqual(value);
    await render('bob');
    expect(dom.window.document.querySelector('select')).toBeNull();
    expect(JSON.parse(localStorage.getItem('tatakai-post-drafts:alice:feed')!)).toHaveLength(1);
    await render('alice');
    const loaded = dom.window.document.querySelector('select')!;
    await act(async () => { loaded.value = loaded.options[1].value; loaded.dispatchEvent(new dom.window.Event('change', {bubbles:true})); });
    await act(async () => { publishRef.current?.(); });
    expect(JSON.parse(localStorage.getItem('tatakai-post-drafts:alice:feed')!)).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});
