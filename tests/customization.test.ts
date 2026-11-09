import { expect, test } from 'bun:test';
import { EMPTY_CUSTOMIZATION, getTargetCustomization, mergeCustomization, readCustomization } from '../src/lib/customization';

test('per-theme and per-device edits retain unrelated designs and section overrides', () => {
  const original = readCustomization({ version: 1, themes: {
    midnight: { logo: 'dark', targets: { desktop: { activeDesign: 'one', pages: { home: { order: ['hero', 'trending'], sections: { trending: { density: 'compact' } } } } }, mobile: { activeDesign: 'phone' } } },
    'light-minimal': { logo: 'light' },
  } });
  const next = mergeCustomization(original, { themes: { midnight: { targets: { desktop: { pages: { home: { order: ['trending', 'hero'], sections: { hero: { visible: false } } } } } } } } });
  expect(getTargetCustomization(next, 'midnight', 'desktop').pages?.home?.order).toEqual(['trending', 'hero']);
  expect(getTargetCustomization(next, 'midnight', 'desktop').pages?.home?.sections?.trending?.density).toBe('compact');
  expect(getTargetCustomization(next, 'midnight', 'mobile').activeDesign).toBe('phone');
  expect(next.themes['light-minimal']?.logo).toBe('light');
  expect(original.themes.midnight?.targets?.desktop?.pages?.home?.order).toEqual(['hero', 'trending']);
});
test('reset tombstones survive merging and can later be replaced by a custom value', () => {
  const saved = mergeCustomization(EMPTY_CUSTOMIZATION, { themes: { midnight: { palette: { primary: '120 80% 40%' }, targets: { desktop: { activeDesign: 'custom', pages: { home: { sections: { trending: { visible: false } } } } } } } } });
  const reset = mergeCustomization(saved, { themes: { midnight: { palette: null, targets: { desktop: { activeDesign: null, pages: { home: { sections: { trending: null } } } } } } } });
  expect(reset.themes.midnight?.palette).toBeNull();
  expect(getTargetCustomization(reset, 'midnight', 'desktop').pages?.home?.sections?.trending).toBeNull();
  expect(getTargetCustomization(reset, 'midnight', 'desktop').activeDesign).toBeNull();
  const replaced = mergeCustomization(reset, { themes: { midnight: { palette: { primary: '240 60% 55%' } } } });
  expect(replaced.themes.midnight?.palette).toEqual({ primary: '240 60% 55%' });
});
test('unknown versions fall back safely and unsafe object keys never enter the store', () => {
  expect(readCustomization({ version: 99, themes: {} })).toBe(EMPTY_CUSTOMIZATION);
  const next = readCustomization(JSON.parse('{"version":1,"themes":{"__proto__":{"polluted":true},"midnight":{"logo":"dark"}}}'));
  expect(Object.hasOwn(next.themes, '__proto__')).toBe(false);
  expect(({} as any).polluted).toBeUndefined();
});
