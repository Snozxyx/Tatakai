import type { CSSProperties } from 'react';
import { parse } from 'postcss';
import { readSekaiConfig, safeThemeImage } from '@/lib/profileThemes';
import { MIDNIGHT_LOFI_ROOM, readMidnightLofiConfig } from '@/components/profile/themes/midnight-lofi/config';
import { EMPRESS_POSTER } from '@/components/profile/themes/gothic-empress/config';

function hsl(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const hue = !d ? 0 : max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return `${Math.round(hue)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
/** Chat surfaces use the same palette, artwork and saved configuration as profiles. */
export function profileThemeConversation(theme: string, configuration?: unknown): { style: CSSProperties; image?: string } {
  let bg = '', ink = '', muted = '', surface = '', accent = '', line = '', image: string | undefined;
  switch (theme) {
    case 'custom-html': {
      const colors: Record<string, string> = {};
      try { parse(typeof configuration === 'string' ? configuration.slice(0, 20000) : '').walkRules(rule => {
        if (rule.parent?.type !== 'root' || ![':root', 'body', 'html'].includes(rule.selector.trim())) return;
        rule.walkDecls(decl => { if (/^#[0-9a-f]{6}$/i.test(decl.value.trim())) colors[decl.prop] = decl.value.trim(); });
      }); } catch { return { style: {} }; }
      if (!Object.keys(colors).length) return { style: {} };
      [bg, ink, muted, surface, accent, line] = [colors['background-color'] || colors.background || colors['--bg'] || '#10111a', colors.color || colors['--ink'] || '#f0eef8', colors['--muted'] || '#aaa7be', colors['--surface'] || '#1a1d2b', colors['--accent'] || '#c4b5fd', colors['--border'] || '#3b3c50'];
      break;
    }
    case 'uchiha': [bg, ink, muted, surface, accent, line] = ['#0c0d0f', '#ebe8e5', '#a9a5a1', '#151619', '#dd5f5f', '#292a2d']; image = '/assets/profile-themes/uchiha/itachi-rain-poster.webp'; break;
    case 'gothic-empress': [bg, ink, muted, surface, accent, line] = ['#0b0b0f', '#eee8e6', '#aaa0a5', '#111116', '#ef667c', '#3c2932']; image = EMPRESS_POSTER; break;
    case 'midnight-lofi': {
      const c = readMidnightLofiConfig(configuration);
      [bg, ink, muted, surface, accent, line] = ['#060913', '#f1f5f9', '#b0bdcd', '#111b2c', c?.accent === 'amber' ? '#f1cc91' : c?.accent === 'violet' ? '#c5b8f3' : '#a9cce7', '#34445c']; image = MIDNIGHT_LOFI_ROOM; break;
    }
    case 'komorebi': [bg, ink, muted, surface, accent, line] = ['#f7f5eb', '#302d22', '#6c644c', '#ede9d8', '#7d5b10', '#c6bd9c']; image = '/assets/profile-themes/komorebi/garden.webp'; break;
    case 'sekaipop': {
      const c = readSekaiConfig(configuration);
      if (!c) return { style: {} };
      const dark = c.mode !== 'light';
      [bg, ink, muted, surface, accent, line] = [dark ? '#201828' : '#f1e7f6', dark ? '#f0e9fa' : c.colors.ink, dark ? '#c2b4d3' : c.colors.ink, dark ? '#30243d' : c.colors.paper, dark ? c.colors.primary : c.colors.ink, dark ? '#736080' : '#c6b5d5'];
      image = safeThemeImage(c.wallpaper.url) || undefined; break;
    }
    default: return { style: {} };
  }
  const tokens: Record<string, string> = {
    '--background': hsl(bg), '--foreground': hsl(ink), '--card': hsl(surface), '--card-foreground': hsl(ink),
    '--popover': hsl(surface), '--popover-foreground': hsl(ink), '--primary': hsl(accent), '--primary-foreground': hsl(bg),
    '--secondary': hsl(surface), '--secondary-foreground': hsl(ink), '--muted': hsl(surface), '--muted-foreground': hsl(muted),
    '--accent': hsl(surface), '--accent-foreground': hsl(ink), '--border': hsl(line), '--input': hsl(line), '--ring': hsl(accent),
  };
  return { style: { ...tokens, backgroundColor: bg, color: ink } as CSSProperties, image };
}
