import { expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ReaderImageSlot } from '../src/components/reader/ReaderImageSlot';
import { readerImageLayout } from '../src/lib/reader/imageLayout';

test('a loading page has one layout slot and an absolute spinner overlay', () => {
  const layout = readerImageLayout({ width: '70%', maxWidth: '900px' }, { width: 800, height: 1200 }, false);
  const markup = renderToStaticMarkup(<ReaderImageSlot pageNumber={50} style={layout.slot} pending><img src="page.jpg" style={layout.image} /></ReaderImageSlot>);
  const dom = new JSDOM(markup);
  const slot = dom.window.document.querySelector('[data-page]') as HTMLElement;
  expect(dom.window.document.querySelectorAll('[data-page]').length).toBe(1);
  expect(slot.style.width).toBe('70%');
  expect(slot.style.aspectRatio).toBe('800 / 1200');
  expect(slot.querySelector('[aria-hidden]')?.classList.contains('absolute')).toBe(true);
  expect(slot.querySelector('img')?.style.width).toBe('100%');
  const ready = readerImageLayout({ width: '70%', maxWidth: '900px' }, { width: 800, height: 1200 }, true);
  expect(ready.slot).toEqual(layout.slot);
  dom.window.close();
});

test('height-fit pages do not gain a second vertical placeholder', () => {
  const layout = readerImageLayout({ height: '88vh', width: 'auto' }, {}, false);
  expect(layout.slot.height).toBe('88vh');
  expect(layout.slot.minHeight).toBeUndefined();
  expect(layout.image.width).toBe('auto');
});
