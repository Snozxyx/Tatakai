import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getProxiedImageUrl } from '@/lib/api';
import { Plus, Minus, Maximize2 } from 'lucide-react';
import type { AtlasLayout, AtlasNode } from '@/core/recommendations/atlasEmbedding';
import { ratingColor, yearColor } from './colorScales';

export type ColorBy = 'year' | 'rating';

interface View {
  scale: number;
  tx: number;
  ty: number;
}

/** Deterministic faint background stars in normalized [0,1] space. */
function makeStars(count: number) {
  let s = 987654321;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  return Array.from({ length: count }, () => ({ x: rand(), y: rand(), r: rand() * 1.1 + 0.2, a: rand() * 0.4 + 0.08 }));
}

/**
 * Interactive canvas galaxy of anime/manga. Points are positioned by the
 * precomputed 2D layout, colored by release year or average rating, over a
 * starfield with a soft vignette. Pan, zoom, hover and click are all supported.
 */
export function AnimeAtlas({ layout, colorBy, controls }: { layout: AtlasLayout; colorBy: ColorBy; controls?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const dragRef = useRef<{ active: boolean; x: number; y: number; moved: boolean }>({ active: false, x: 0, y: 0, moved: false });
  const touchRef = useRef({
    pan: { active: false, x: 0, y: 0, moved: false },
    pinch: { active: false, dist: 0, mid: { x: 0, y: 0 } },
  });

  const [hovered, setHovered] = useState<AtlasNode | null>(null);
  const [selected, setSelected] = useState<AtlasNode | null>(null);

  const stars = useMemo(() => makeStars(160), []);
  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);

  const { minYear, maxYear } = useMemo(() => {
    const years = layout.nodes.map((n) => n.year).filter((y): y is number => y != null);
    return { minYear: years.length ? Math.min(...years) : 1990, maxYear: years.length ? Math.max(...years) : new Date().getFullYear() };
  }, [layout]);

  const colorFor = useCallback(
    (n: AtlasNode) => (colorBy === 'year' ? yearColor(n.year, minYear, maxYear) : ratingColor(n.averageScore)),
    [colorBy, minYear, maxYear],
  );

  const nodeRadius = useCallback((n: AtlasNode) => {
    const s = n.averageScore ?? 55;
    return Math.max(3, Math.min(11, 3 + (s / 100) * 8));
  }, []);

  const fitView = useCallback(() => {
    const { w, h } = sizeRef.current;
    const { minX, maxX, minY, maxY } = layout.bounds;
    const cw = Math.max(1e-3, maxX - minX);
    const ch = Math.max(1e-3, maxY - minY);
    const scale = Math.min(w / cw, h / ch) * 0.82;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    viewRef.current = { scale, tx: w / 2 - cx * scale, ty: h / 2 - cy * scale };
  }, [layout]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h, dpr } = sizeRef.current;
    const { scale, tx, ty } = viewRef.current;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Deep-space background.
    const bg = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.75);
    bg.addColorStop(0, '#0b1020');
    bg.addColorStop(1, '#04050b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Starfield (screen-fixed, parallax-free).
    for (const st of stars) {
      ctx.globalAlpha = st.a;
      ctx.fillStyle = '#cbd5f5';
      ctx.beginPath();
      ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const sx = (x: number) => x * scale + tx;
    const sy = (y: number) => y * scale + ty;

    const highlight = hovered ?? selected;
    const highlightNeighbors = highlight ? new Set(highlight.neighbors) : null;

    if (highlight) {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      for (const nid of highlight.neighbors) {
        const nb = byId.get(nid);
        if (!nb) continue;
        ctx.beginPath();
        ctx.moveTo(sx(highlight.x), sy(highlight.y));
        ctx.lineTo(sx(nb.x), sy(nb.y));
        ctx.stroke();
      }
    }

    // Glowing points (additive blend for a luminous galaxy look).
    ctx.globalCompositeOperation = 'lighter';
    for (const n of layout.nodes) {
      const x = sx(n.x);
      const y = sy(n.y);
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      const r = nodeRadius(n);
      const color = colorFor(n);
      const focused = highlight && (highlight.id === n.id || highlightNeighbors?.has(n.id));
      const alpha = highlight ? (focused ? 1 : 0.22) : 0.92;

      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      glow.addColorStop(0, color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Bright core dot on the focused node for a crisp anchor.
    if (highlight) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx(highlight.x), sy(highlight.y), 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Labels.
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const labelFor = (n: AtlasNode, strong: boolean) => {
      const x = sx(n.x);
      const y = sy(n.y);
      const text = n.title.length > 28 ? n.title.slice(0, 27) + '…' : n.title;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(text, x, y - nodeRadius(n) - 3);
      ctx.fillStyle = strong ? 'rgba(255,255,255,0.97)' : 'rgba(255,255,255,0.65)';
      ctx.fillText(text, x, y - nodeRadius(n) - 3);
    };
    if (highlight) {
      labelFor(highlight, true);
      for (const nid of highlight.neighbors) {
        const nb = byId.get(nid);
        if (nb) labelFor(nb, false);
      }
    } else {
      for (const n of layout.nodes) {
        if (nodeRadius(n) >= 9 && scale > 40) labelFor(n, false);
      }
    }

    // Vignette to sink the edges.
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
  }, [layout, hovered, selected, colorFor, nodeRadius, stars, byId]);

  const hitTest = useCallback((mx: number, my: number): AtlasNode | null => {
    const { scale, tx, ty } = viewRef.current;
    let best: AtlasNode | null = null;
    let bestDist = Infinity;
    for (const n of layout.nodes) {
      const x = n.x * scale + tx;
      const y = n.y * scale + ty;
      const r = nodeRadius(n) + 4;
      const d = Math.hypot(x - mx, y - my);
      if (d < r && d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  }, [layout, nodeRadius]);

  const zoomBy = useCallback((factor: number) => {
    const { w, h } = sizeRef.current;
    const v = viewRef.current;
    v.tx = w / 2 - (w / 2 - v.tx) * factor;
    v.ty = h / 2 - (h / 2 - v.ty) * factor;
    v.scale *= factor;
    draw();
  }, [draw]);

  const resetView = useCallback(() => { fitView(); draw(); }, [fitView, draw]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      fitView();
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [fitView, draw]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const localXY = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };
    const localMouse = (e: MouseEvent) => localXY(e.clientX, e.clientY);

    const onDown = (e: MouseEvent) => {
      const { x, y } = localMouse(e);
      dragRef.current = { active: true, x, y, moved: false };
    };
    const onMove = (e: MouseEvent) => {
      const { x, y } = localMouse(e);
      if (dragRef.current.active) {
        const dx = x - dragRef.current.x;
        const dy = y - dragRef.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) dragRef.current.moved = true;
        viewRef.current.tx += dx;
        viewRef.current.ty += dy;
        dragRef.current.x = x;
        dragRef.current.y = y;
        draw();
      } else {
        const hit = hitTest(x, y);
        setHovered((prev) => (prev?.id === hit?.id ? prev : hit));
        canvas.style.cursor = hit ? 'pointer' : 'grab';
      }
    };
    const onUp = (e: MouseEvent) => {
      if (dragRef.current.active && !dragRef.current.moved) {
        const { x, y } = localMouse(e);
        const hit = hitTest(x, y);
        if (hit) setSelected(hit);
      }
      dragRef.current.active = false;
    };
    const onLeave = () => { setHovered(null); dragRef.current.active = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = localMouse(e);
      const f = Math.exp(-e.deltaY * 0.0015);
      const v = viewRef.current;
      v.tx = x - (x - v.tx) * f;
      v.ty = y - (y - v.ty) * f;
      v.scale *= f;
      draw();
    };

    // ── Touch: 1-finger pan, 2-finger pinch-zoom, tap to select ──
    const touchState = touchRef.current;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const { x, y } = localXY(t.clientX, t.clientY);
        touchState.pan = { active: true, x, y, moved: false };
      } else if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        touchState.pan.active = false;
        touchState.pinch = {
          active: true,
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          mid: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
        };
        e.preventDefault();
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchState.pinch.active) {
        const a = e.touches[0];
        const b = e.touches[1];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const rect = canvas.getBoundingClientRect();
        const mx = (a.clientX + b.clientX) / 2 - rect.left;
        const my = (a.clientY + b.clientY) / 2 - rect.top;
        if (touchState.pinch.dist > 0 && dist > 0) {
          const f = dist / touchState.pinch.dist;
          const v = viewRef.current;
          v.tx = mx - (mx - v.tx) * f;
          v.ty = my - (my - v.ty) * f;
          v.scale = Math.max(4, Math.min(4000, v.scale * f));
          draw();
        }
        touchState.pinch.dist = dist;
        e.preventDefault();
        return;
      }
      if (e.touches.length === 1 && touchState.pan.active) {
        const t = e.touches[0];
        const { x, y } = localXY(t.clientX, t.clientY);
        const dx = x - touchState.pan.x;
        const dy = y - touchState.pan.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) touchState.pan.moved = true;
        // Only hijack the gesture once it's clearly horizontal — otherwise let
        // the page scroll vertically (canvas uses touch-action: pan-y).
        if (touchState.pan.moved && Math.abs(dx) > Math.abs(dy)) {
          viewRef.current.tx += dx;
          viewRef.current.ty += dy;
          draw();
          e.preventDefault();
        }
        touchState.pan.x = x;
        touchState.pan.y = y;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchState.pinch.active) {
        if (e.touches.length < 2) touchState.pinch.active = false;
        if (e.touches.length === 1) {
          const t = e.touches[0];
          const { x, y } = localXY(t.clientX, t.clientY);
          touchState.pan = { active: true, x, y, moved: false };
        }
        return;
      }
      if (touchState.pan.active && !touchState.pan.moved && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        const { x, y } = localXY(t.clientX, t.clientY);
        const hit = hitTest(x, y);
        if (hit) setSelected(hit);
      }
      touchState.pan.active = false;
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [draw, hitTest]);

  const info = hovered ?? selected;
  const infoHref = info ? info.href ?? `/anime/${info.id}` : '#';

  return (
    <div ref={containerRef} className="relative h-[420px] md:h-[560px] w-full overflow-hidden rounded-2xl border border-white/10">
      <canvas ref={canvasRef} className="block h-full w-full [touch-action:pan-y]" style={{ cursor: 'grab' }} />

      {/* Control overlay (top-left), styled like the reference galaxy. */}
      {controls && (
        <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/55 px-2.5 py-2 backdrop-blur-md">
          {controls}
        </div>
      )}

      {/* Zoom controls (bottom-right) — larger targets on touch. */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <button onClick={() => zoomBy(1.3)} aria-label="Zoom in" className="flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-lg border border-white/10 bg-black/55 text-white/80 backdrop-blur-md transition-colors hover:bg-white/10 active:scale-95">
          <Plus className="h-4 w-4" />
        </button>
        <button onClick={() => zoomBy(1 / 1.3)} aria-label="Zoom out" className="flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-lg border border-white/10 bg-black/55 text-white/80 backdrop-blur-md transition-colors hover:bg-white/10 active:scale-95">
          <Minus className="h-4 w-4" />
        </button>
        <button onClick={resetView} aria-label="Reset view" className="flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-lg border border-white/10 bg-black/55 text-white/80 backdrop-blur-md transition-colors hover:bg-white/10 active:scale-95">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {info && (
        <div className="absolute bottom-3 left-3 w-[min(16rem,calc(100%-1.5rem))] rounded-xl border border-white/10 bg-black/80 p-3 backdrop-blur-md flex gap-3">
          {info.poster && (
            <img src={getProxiedImageUrl(info.poster)} alt={info.title} className="h-24 w-16 flex-shrink-0 rounded-md object-cover" loading="lazy" />
          )}
          <div className="min-w-0">
            <Link to={infoHref} className="block text-sm font-bold text-white hover:text-primary line-clamp-2">{info.title}</Link>
            <p className="mt-1 text-xs text-muted-foreground">
              {info.mediaType === 'manga' ? 'Manga' : 'Anime'}
              {info.year ? ` · ${info.year}` : ''}
              {info.averageScore != null ? ` · ★ ${(info.averageScore / 10).toFixed(1)}` : ''}
            </p>
            {info.genres.length > 0 && (
              <p className="mt-1 text-[10px] text-white/50 line-clamp-2">{info.genres.slice(0, 3).join(' · ')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
