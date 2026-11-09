import { expect, test } from 'bun:test';
import { appearanceBackgroundStyle } from '../src/lib/appearanceBackgroundStyle';
test('artwork blur is bounded and extends the artwork beneath its clipping wrapper', () => {
  expect(appearanceBackgroundStyle({ type: 'image', blur: 24 }, 'blob:fixture')).toMatchObject({ filter: 'blur(24px)', inset: '-48px', backgroundSize: 'cover' });
  expect(appearanceBackgroundStyle({ type: 'gradient', gradient: 'linear-gradient(90deg,#123,#456)', blur: 1000 })).toMatchObject({ filter: 'blur(64px)', inset: '-128px' });
  expect(appearanceBackgroundStyle({ type: 'image', blur: Number.NaN }, 'blob:fixture').filter).toBeUndefined();
  expect(appearanceBackgroundStyle({ type: 'solid', color: '#123456', blur: 32 }).filter).toBeUndefined();
  expect(appearanceBackgroundStyle(undefined)).toEqual({});
});
