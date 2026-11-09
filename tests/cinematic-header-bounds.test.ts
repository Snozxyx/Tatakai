import { expect, test } from 'bun:test';
import { cinematicHeaderBounds } from '../src/lib/cinematicHeaderBounds';

test('cinematic artwork spans its local header and hero without crossing the page gutter', () => {
  const owner = { left: 100, top: 50, bottom: 1500, width: 1120 };
  const header = { left: 124, top: 74, bottom: 130, width: 1072 };
  const hero = { left: 124, top: 170, bottom: 820, width: 1072 };
  const bounds = cinematicHeaderBounds(owner, header, hero);
  expect(bounds).toEqual({ left: 24, top: 12, width: 1072, height: 758 });
  expect(owner.top + bounds.top).toBeLessThanOrEqual(header.top);
  expect(owner.top + bounds.top + bounds.height).toBe(hero.bottom);
  expect(bounds.left + bounds.width).toBeLessThanOrEqual(owner.width);
});
test('scaled Preferences canvas uses local coordinates and clips accidental overflow', () => {
  const owner = { left: 20, top: 100, bottom: 800, width: 560 };
  const header = { left: 32, top: 112, bottom: 140, width: 536 };
  const hero = { left: 32, top: 160, bottom: 485, width: 536 };
  expect(cinematicHeaderBounds(owner, header, hero, .5)).toEqual({ left: 24, top: 12, width: 1072, height: 758 });
  const overflow = cinematicHeaderBounds(owner, header, { ...hero, width: 2000 }, .5);
  expect(overflow.left + overflow.width).toBe(1120);
});
