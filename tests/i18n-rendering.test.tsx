import { afterAll, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import i18n from '../src/lib/i18n';
import { PlaybackControls } from '../src/components/video/controls/PlaybackControls';
import { format } from '../src/lib/localeFormat';
import { getAcceptLanguageHeader } from '../src/lib/api/localeHeaders';

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe('localized player controls', () => {
  test('switches languages in place and preserves classes, handlers, and DOM identity', async () => {
    const dom = new JSDOM(
      '<!doctype html><html><body><div id="root"></div></body></html>',
      { url: 'https://tatakai.test/' }
    );
    const previous = {
      window: globalThis.window,
      document: globalThis.document,
      act: (globalThis as any).IS_REACT_ACT_ENVIRONMENT,
    };
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    const container = dom.window.document.getElementById('root')!;
    const root = createRoot(container);
    let clicks = 0;
    try {
      await act(async () => {
        await i18n.changeLanguage('en');
        root.render(
          <PlaybackControls
            isPlaying={false}
            isLive={false}
            timelineSeekingLocked={false}
            timelineUiHidden={false}
            onTogglePlay={() => clicks++}
            onRefresh={() => {}}
            onSkip={() => {}}
          />
        );
      });
      const play = container.querySelector('button')!;
      const classes = play.className;
      expect(play.getAttribute('aria-label')).toBe('Play');
      await act(async () => {
        await i18n.changeLanguage('es');
      });
      expect(container.querySelector('button')).toBe(play);
      expect(play.getAttribute('aria-label')).toBe('Reproducir');
      expect(play.className).toBe(classes);
      await act(async () => {
        await i18n.changeLanguage('ja');
      });
      expect(play.getAttribute('aria-label')).toBe('再生');
      await act(async () => {
        play.click();
      });
      expect(clicks).toBe(1);
    } finally {
      await act(async () => root.unmount());
      Object.assign(globalThis, {
        window: previous.window,
        document: previous.document,
        IS_REACT_ACT_ENVIRONMENT: previous.act,
      });
      dom.window.close();
    }
  });

  test('formats dates using the selected interface language', async () => {
    await i18n.changeLanguage('es');
    expect(format(new Date(2026, 0, 15), 'MMMM')).toBe('enero');
    await i18n.changeLanguage('ja');
    expect(format(new Date(2026, 0, 15), 'MMMM')).toBe('1月');
  });
});
