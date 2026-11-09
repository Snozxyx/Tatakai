import { afterEach, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { widgetThemeFromColors, widgetThemeFromElement } from '../src/lib/widgetTheme';
const originalStyle = globalThis.getComputedStyle;
afterEach(() => { globalThis.getComputedStyle = originalStyle; });
test('badge information accepts hex, RGB, and HSL profile colors', () => {
  for (const [background, foreground] of [['#fff', '#111'], ['rgb(255 255 255 / 100%)', 'rgb(0% 0% 0%)'], ['hsl(35 20% 95%)', 'hsl(35 20% 10%)'], ['35 20% 95%', '35 20% 10%']]) {
    const theme = widgetThemeFromColors({ background, foreground });
    expect(theme['--popover']).toBeTruthy(); expect(theme['--popover-foreground']).toBeTruthy(); expect(theme.colorScheme).toBe('light');
  }
});
test('malformed iframe colors cannot throw or inject parent styles', () => {
  expect(widgetThemeFromColors({ background: 'url(evil)', foreground: '#fff' })).toEqual({});
  expect(() => widgetThemeFromColors({ background: '#222', foreground: '#fff', border: {}, primary: [], fontFamily: {} } as any)).not.toThrow();
  expect(widgetThemeFromColors({ background: '#222', foreground: '#fff', fontFamily: {} } as any).fontFamily).toBeUndefined();
});
test('theme colors survive alpha and short-hex representations', () => {
  const theme = widgetThemeFromColors({ background: '#222f', foreground: '#ffff', border: 'rgba(255,255,255,0)', primary: 'color(srgb 1 .3 .5)' });
  expect(theme['--border']).not.toBe('0.0 0.0% 0.0%'); expect(theme['--primary']).toBeTruthy(); expect(theme.colorScheme).toBe('dark');
});
test('a transparent badge captures its themed ancestor, not transparent black', () => {
  const dom = new JSDOM('<section style="background:rgb(248,242,228);color:rgb(45,36,28)"><button style="background:transparent;color:rgb(45,36,28)">Badge</button></section>');
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  const style = widgetThemeFromElement(dom.window.document.querySelector('button')!);
  expect(style.colorScheme).toBe('light'); expect(style['--popover']).toContain('93.3%'); dom.window.close();
});
