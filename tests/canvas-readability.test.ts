import { expect, test } from 'bun:test';
import { adaptiveCanvasColors, colorRGB, contrastRGB, mixRGB, type RGB } from '../src/lib/canvasReadability';

test('canvas text, muted copy and accents remain readable across transparent dark/light compositions', () => {
  const palette = { foreground: '0 0% 98%', mutedForeground: '340 8% 65%', primary: '340 82% 65%' };
  for (const underneath of [[238, 238, 238], [36, 36, 36], [140, 135, 139]] as RGB[]) for (const opacity of [0, .2, .5, .82, 1]) {
    const background = mixRGB([24, 16, 21], underneath, opacity);
    const colors = adaptiveCanvasColors(background, palette);
    for (const value of [colors.foreground, colors.muted, colors.primary, colors.amber]) expect(contrastRGB(colorRGB(value)!, background)).toBeGreaterThanOrEqual(4.49);
  }
  expect(adaptiveCanvasColors([140, 135, 139], palette).darkText).toBe(true);
  expect(adaptiveCanvasColors([24, 16, 21], palette).darkText).toBe(false);
});
