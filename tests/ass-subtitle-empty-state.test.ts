import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useAssSubtitle } from '../src/components/video/hooks/useAssSubtitle';
import type { ExternalSubtitle } from '../src/components/video/VideoPlayer.types';

function renderSubtitle(tracks: ExternalSubtitle[], selection: string) {
  function Probe() {
    const subtitle = useAssSubtitle(tracks, selection);
    return createElement('span', null, subtitle ? 'ASS ready' : 'No ASS');
  }
  return renderToString(createElement(Probe));
}

test('the video player can render while subtitle tracks are still loading', () => {
  expect(renderSubtitle([], 'auto')).toContain('No ASS');
});

test('turning subtitles off does not read a missing loaded subtitle', () => {
  expect(renderSubtitle([{ url: 'https://fixture.test/captions.ass', lang: 'en' }], 'off')).toContain('No ASS');
});

test('a supplied ASS document still renders without waiting for a download', () => {
  expect(renderSubtitle([{ url: 'https://fixture.test/captions.ass', lang: 'en', assContent: '[Script Info]\n[Events]' }], 'en')).toContain('ASS ready');
});
