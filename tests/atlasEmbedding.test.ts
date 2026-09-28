import { describe, expect, test } from 'bun:test';
import { computeAtlasLayout } from '../src/core/recommendations/atlasEmbedding';
import type { AnimeMeta } from '../src/core/recommendations/types';

function meta(id: string, genres: string[], studios: string[] = []): AnimeMeta {
  return { id, title: `Title ${id}`, genres, tags: [], studios, year: 2020, averageScore: 75 };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('computeAtlasLayout', () => {
  test('empty input yields empty layout', () => {
    expect(computeAtlasLayout([]).nodes).toHaveLength(0);
  });

  test('places every node and attaches neighbors', () => {
    const metas = [
      meta('a', ['Action', 'Adventure'], ['MAPPA']),
      meta('b', ['Action', 'Adventure'], ['MAPPA']),
      meta('c', ['Romance', 'Slice of Life'], ['KyoAni']),
      meta('d', ['Romance', 'Drama'], ['KyoAni']),
      meta('e', ['Horror'], ['Madhouse']),
    ];
    const layout = computeAtlasLayout(metas, { neighbors: 2 });
    expect(layout.nodes).toHaveLength(5);
    for (const n of layout.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(n.neighbors.length).toBeGreaterThan(0);
    }
  });

  test('similar titles land closer than dissimilar ones', () => {
    const metas = [
      meta('a', ['Action', 'Adventure', 'Fantasy'], ['MAPPA']),
      meta('b', ['Action', 'Adventure', 'Fantasy'], ['MAPPA']),
      meta('c', ['Romance', 'Slice of Life', 'Comedy'], ['KyoAni']),
      meta('d', ['Romance', 'Slice of Life', 'Comedy'], ['KyoAni']),
    ];
    const { nodes } = computeAtlasLayout(metas);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const similar = dist(byId.get('a')!, byId.get('b')!);
    const dissimilar = dist(byId.get('a')!, byId.get('c')!);
    expect(similar).toBeLessThan(dissimilar);
  });

  test('respects maxNodes cap', () => {
    const metas = Array.from({ length: 50 }, (_, i) => meta(String(i), ['Action']));
    expect(computeAtlasLayout(metas, { maxNodes: 20 }).nodes).toHaveLength(20);
  });
});
