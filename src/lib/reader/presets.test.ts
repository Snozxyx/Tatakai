import { expect, test } from 'bun:test';
import { normalizeReaderPresets } from './presets';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';

test('protects Default and retains valid named presets with normalized settings', () => {
  const presets = normalizeReaderPresets({ active:'custom', updatedAt:123, items:[
    { id:'default', name:'Overwrite Default', settings:{ zoom:250 } },
    { id:'custom', name:' Webtoon ', settings:{ zoom:180, widthPercent:85 } },
    { id:'custom', name:'Duplicate', settings:{} },
    { id:'bad', name:' ', settings:{} },
  ] });
  expect(presets.items).toHaveLength(1);
  expect(presets.items[0].name).toBe('Webtoon');
  expect(presets.items[0].settings.zoom).toBe(180);
  expect(presets.active).toBe('custom');
  expect(DEFAULT_SETTINGS.zoom).toBe(100);
  expect(normalizeReaderPresets({ active:'deleted' }).active).toBe('default');
});
test('normalizes legacy reader settings without losing valid width and zoom', () => {
  expect(normalizeSettings({ widthPercent:65, zoom:80 }).widthPercent).toBe(65);
  expect(normalizeSettings({ widthPercent:65, zoom:80 }).zoom).toBe(80);
  expect(normalizeSettings({ zoom:Infinity }).zoom).toBe(100);
  expect(normalizeSettings({ zoom:500 }).zoom).toBe(300);
});
