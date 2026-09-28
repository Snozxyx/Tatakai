// Client-side 2D embedding for the Anime Atlas.
//
// We can't run sprout's offline UMAP pipeline (its trained model + the content
// API are both unavailable here), so we project our own candidate metadata into
// 2D in-browser. Feature vectors come from genres/tags/studios; the projection
// is classical MDS (double-centered cosine Gram -> top-2 eigenvectors via power
// iteration). Dependency-free and fast for a few hundred points.

import type { AnimeMeta } from './types';

export interface AtlasNode {
  id: string;
  x: number;
  y: number;
  title: string;
  poster?: string | null;
  year?: number | null;
  averageScore?: number | null; // 0–100
  genres: string[];
  neighbors: string[]; // ids of nearest neighbors, for hover lines
  mediaType?: 'anime' | 'manga';
  href?: string; // route target for the info card link
}

/** Metadata plus optional atlas-only routing fields. */
export type AtlasInput = AnimeMeta & { mediaType?: 'anime' | 'manga'; href?: string };

export interface AtlasLayout {
  nodes: AtlasNode[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Build L2-normalized sparse feature vectors keyed by category tokens. */
function buildVectors(metas: AnimeMeta[]): number[][] {
  const index = new Map<string, number>();
  const tokenize = (m: AnimeMeta): Array<[string, number]> => {
    const toks: Array<[string, number]> = [];
    for (const g of m.genres) toks.push([`g:${g}`, 1]);
    for (const t of m.tags) toks.push([`t:${t}`, 0.6]);
    for (const s of m.studios) toks.push([`s:${s}`, 0.8]);
    return toks;
  };

  const rows = metas.map(tokenize);
  for (const row of rows) for (const [tok] of row) if (!index.has(tok)) index.set(tok, index.size);

  const dim = index.size;
  return rows.map((row) => {
    const vec = new Array(dim).fill(0);
    for (const [tok, w] of row) vec[index.get(tok)!] += w;
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) vec[i] /= norm;
    return vec;
  });
}

/** Cosine Gram matrix (rows are already L2-normalized -> dot == cosine). */
function gramMatrix(vectors: number[][]): number[][] {
  const n = vectors.length;
  const G: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let dot = 0;
      const vi = vectors[i];
      const vj = vectors[j];
      for (let k = 0; k < vi.length; k++) dot += vi[k] * vj[k];
      G[i][j] = dot;
      G[j][i] = dot;
    }
  }
  return G;
}

/** Double-center a symmetric matrix in place-ish (returns new matrix). */
function doubleCenter(G: number[][]): number[][] {
  const n = G.length;
  const rowMean = new Array(n).fill(0);
  let grand = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += G[i][j];
    rowMean[i] = s / n;
    grand += s;
  }
  grand /= n * n;
  const B: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      B[i][j] = G[i][j] - rowMean[i] - rowMean[j] + grand;
    }
  }
  return B;
}

function matVec(M: number[][], v: number[]): number[] {
  const n = M.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const row = M[i];
    for (let j = 0; j < n; j++) s += row[j] * v[j];
    out[i] = s;
  }
  return out;
}

function norm(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

/** Dominant eigenpair of a symmetric matrix via power iteration. */
function powerIteration(M: number[][], iters: number, seed: number): { vec: number[]; val: number } {
  const n = M.length;
  // Deterministic pseudo-random seed so layouts are stable across renders.
  let state = seed || 1;
  const rand = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff - 0.5;
  };
  let v = Array.from({ length: n }, () => rand());
  let nv = norm(v) || 1;
  v = v.map((x) => x / nv);

  for (let it = 0; it < iters; it++) {
    const w = matVec(M, v);
    const wn = norm(w);
    if (wn === 0) break;
    v = w.map((x) => x / wn);
  }
  const Mv = matVec(M, v);
  let val = 0;
  for (let i = 0; i < n; i++) val += v[i] * Mv[i]; // Rayleigh quotient
  return { vec: v, val };
}

/** Subtract the rank-1 component (deflation) so the next power iteration finds the 2nd eigenvector. */
function deflate(M: number[][], vec: number[], val: number): void {
  const n = M.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      M[i][j] -= val * vec[i] * vec[j];
    }
  }
}

function kNearest(G: number[][], i: number, k: number, ids: string[]): string[] {
  const sims = G[i]
    .map((s, j) => ({ j, s }))
    .filter((o) => o.j !== i)
    .sort((a, b) => b.s - a.s)
    .slice(0, k);
  return sims.map((o) => ids[o.j]);
}

/**
 * Compute a 2D layout for the given anime. Points with too few features still
 * get placed (with jitter) so the galaxy stays fully populated.
 */
export function computeAtlasLayout(metas: AtlasInput[], opts: { maxNodes?: number; neighbors?: number } = {}): AtlasLayout {
  const maxNodes = opts.maxNodes ?? 400;
  const neighbors = opts.neighbors ?? 6;
  const items = metas.slice(0, maxNodes);
  const n = items.length;

  if (n === 0) return { nodes: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
  if (n === 1) {
    const m = items[0];
    return {
      nodes: [{ id: m.id, x: 0, y: 0, title: m.title, poster: m.poster, year: m.year, averageScore: m.averageScore, genres: m.genres, neighbors: [], mediaType: m.mediaType, href: m.href }],
      bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
    };
  }

  const vectors = buildVectors(items);
  const G = gramMatrix(vectors);
  const B = doubleCenter(G);
  // Copy B for deflation (powerIteration reads, deflate mutates).
  const work = B.map((row) => row.slice());

  const e1 = powerIteration(work, 80, 1);
  deflate(work, e1.vec, e1.val);
  const e2 = powerIteration(work, 80, 7);

  const s1 = Math.sqrt(Math.max(0, e1.val));
  const s2 = Math.sqrt(Math.max(0, e2.val));

  const ids = items.map((m) => m.id);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const rawX: number[] = [];
  const rawY: number[] = [];
  for (let i = 0; i < n; i++) {
    // Small deterministic jitter breaks ties for identical feature vectors.
    const jitter = ((i * 2654435761) % 1000) / 1000 - 0.5;
    const x = e1.vec[i] * s1 + jitter * 0.02;
    const y = e2.vec[i] * s2 + jitter * 0.02;
    rawX.push(x);
    rawY.push(y);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }

  const nodes: AtlasNode[] = items.map((m, i) => ({
    id: m.id,
    x: rawX[i],
    y: rawY[i],
    title: m.title,
    poster: m.poster,
    year: m.year,
    averageScore: m.averageScore,
    genres: m.genres,
    neighbors: kNearest(G, i, neighbors, ids),
    mediaType: m.mediaType,
    href: m.href,
  }));

  return { nodes, bounds: { minX, maxX, minY, maxY } };
}
