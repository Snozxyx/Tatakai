import { useEffect, useLayoutEffect, useState } from 'react';
import { useAppearanceAsset } from '@/lib/appearanceAssets';
import { adaptiveCanvasColors, colorRGB, mixRGB, type RGB } from '@/lib/canvasReadability';
import { readableMutedColor } from '@/lib/themeContrast';
import type { BackgroundConfig } from '@/lib/customization';
import './canvas-readability.css';

interface Palette { background: string; foreground: string; mutedForeground: string; primary: string; cardForeground: string }
const rgbText = (value: RGB) => `rgb(${value.map(v => Math.round(v)).join(' ')})`;
/** Color estimates stay local; native pixels are protected with local reading scrims. */
export function CanvasReadability({ palette, background, systemBlur, opacity }: { palette: Palette; background?: BackgroundConfig | null; systemBlur: boolean; opacity: number }) {
  const imageUrl = useAppearanceAsset(background?.type === 'image' ? background.asset : undefined);
  const [imageColor, setImageColor] = useState<{ url: string; color: RGB }>();
  const [systemDark, setSystemDark] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)'); const update = () => setSystemDark(query.matches);
    query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!imageUrl?.startsWith('blob:')) return;
    let cancelled = false; const picture = new Image();
    picture.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 24;
        const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return;
        context.drawImage(picture, 0, 0, 24, 24); const pixels = context.getImageData(0, 0, 24, 24).data;
        const total: RGB = [0, 0, 0]; let weight = 0;
        for (let i = 0; i < pixels.length; i += 4) { const alpha = pixels[i + 3] / 255; weight += alpha; for (let c = 0; c < 3; c++) total[c] += pixels[i + c] * alpha; }
        if (weight && !cancelled) setImageColor({ url: imageUrl, color: total.map(v => v / weight) as RGB });
      } catch { /* Local reading surfaces remain safe if an image cannot be sampled. */ }
    };
    picture.src = imageUrl; return () => { cancelled = true; picture.onload = null; };
  }, [imageUrl]);
  const active = !!background || systemBlur;
  let surface = colorRGB(background?.color) || colorRGB(palette.background) || [20, 20, 24] as RGB;
  if (background?.type === 'gradient') {
    const colors = [...(background.gradient || '').matchAll(/#[\da-f]{3,6}\b|(?:rgb|hsl)a?\([^)]*\)/gi)].map(part => colorRGB(part[0])).filter((v): v is RGB => !!v);
    if (colors.length) surface = [0, 1, 2].map(channel => colors.reduce((sum, color) => sum + color[channel], 0) / colors.length) as RGB;
  }
  if (imageUrl && imageColor?.url === imageUrl) surface = imageColor.color;
  if (background?.tint) surface = mixRGB(colorRGB(background.tint) || surface, surface, background.tintOpacity ?? .3);
  if (systemBlur) surface = mixRGB(surface, systemDark ? [36, 36, 36] : [238, 238, 238], Math.max(0, Math.min(1, opacity)));
  const colors = adaptiveCanvasColors(surface, palette);
  const key = JSON.stringify([active, colors, palette.foreground, palette.mutedForeground, palette.primary, palette.cardForeground, surface, systemBlur, background?.type]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!active) return;
    const scrimSurface = colors.darkText ? '0 0% 78%' : '0 0% 22%';
    const vars: Record<string, string> = { '--canvas-readable-text': `hsl(${colors.foreground})`, '--canvas-readable-muted': `hsl(${colors.muted})`, '--canvas-readable-primary': `hsl(${colors.primary})`, '--canvas-readable-amber': `hsl(${colors.amber})`, '--original-readable-text': `hsl(${palette.foreground})`, '--original-readable-muted': `hsl(${palette.mutedForeground})`, '--original-readable-primary': `hsl(${palette.primary})`, '--original-card-text': `hsl(${palette.cardForeground})`, '--canvas-reading-scrim': colors.darkText ? 'rgb(255 255 255 / .78)' : 'rgb(0 0 0 / .78)', '--canvas-reading-ink': colors.darkText ? '#080808' : '#fafafa', '--canvas-scrim-primary': `hsl(${readableMutedColor(palette.primary, [scrimSurface])})`, '--canvas-scrim-muted': `hsl(${readableMutedColor(palette.mutedForeground, [scrimSurface])})`, '--canvas-estimated-surface': rgbText(surface) };
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
    root.dataset.canvasReadability = colors.darkText ? 'light' : 'dark';
    root.toggleAttribute('data-uncertain-canvas', systemBlur || background?.type === 'image' || background?.type === 'gradient');
    return () => { delete root.dataset.canvasReadability; root.removeAttribute('data-uncertain-canvas'); for (const name of Object.keys(vars)) root.style.removeProperty(name); };
  }, [key]);
  return null;
}
