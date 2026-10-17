import { expect, test } from 'bun:test';
import { nextCandidate } from '../src/core/tv/spatialNavigation';
const rect = (x: number, y: number, width = 100, height = 50) => ({ left: x, right: x + width, top: y, bottom: y + height, width, height });
test('prefers aligned rails and excludes candidates behind the direction', () => {
  const aligned = { id: 'aligned', rect: rect(120, 0) }, diagonal = { id: 'diagonal', rect: rect(110, 60) }, behind = { id: 'behind', rect: rect(-100, 0) };
  expect(nextCandidate(rect(0, 0), [diagonal, behind, aligned], 'right')?.id).toBe('aligned');
});
test('handles all directions and boundaries without wrapping', () => {
  const targets = [{ id: 'up', rect: rect(0, -70) }, { id: 'down', rect: rect(0, 70) }, { id: 'left', rect: rect(-120, 0) }, { id: 'right', rect: rect(120, 0) }];
  for (const direction of ['up', 'down', 'left', 'right'] as const) expect(nextCandidate(rect(0, 0), targets, direction)?.id).toBe(direction);
  expect(nextCandidate(rect(0, 0), [], 'down')).toBeUndefined();
});
test('tolerates subpixel edges', () => expect(nextCandidate(rect(0, 0), [{ id: 'edge', rect: rect(110, 49.9) }], 'right')?.id).toBe('edge'));
test('reaches nearby hero actions before a distant aligned content rail', () => {
  const hero = { id: 'hero', rect: rect(220, 300, 150, 60) };
  const rail = { id: 'rail', rect: rect(350, 600, 220, 130) };
  expect(nextCandidate(rect(400, 0), [rail, hero], 'down')?.id).toBe('hero');
});
test('does not wrap sideways into the next content row', () => {
  expect(nextCandidate(rect(1000, 0), [{ id: 'next-row', rect: rect(1010, 300) }], 'right')).toBeUndefined();
});
