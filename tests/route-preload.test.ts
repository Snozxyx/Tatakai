import { expect, test } from 'bun:test';
import { routePreloadKey } from '../src/hooks/ui/useRoutePreload';

test('preloads the matching media detail page while keeping browse routes separate', () => {
  expect(routePreloadKey('/')).toBe('home');
  expect(routePreloadKey('/browse')).toBe('browse');
  expect(routePreloadKey('/manga/123')).toBe('manga-detail');
  expect(routePreloadKey('/novel/123')).toBe('novel-detail');
  expect(routePreloadKey('/manga/discover')).toBe('manga');
  expect(routePreloadKey('/novel/comingsoon')).toBe('novel');
  expect(routePreloadKey('/unrecognized')).toBeUndefined();
});
