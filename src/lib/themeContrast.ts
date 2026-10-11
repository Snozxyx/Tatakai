/** Keep a palette's hue/chroma; adjust only secondary text that fails AA. */
export function readableMutedColor(color: string, surfaces: string[]) {
  const parse = (value: string) => {
    const match = value?.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
    return match ? match.slice(1).map(Number) : null;
  };
  const luminance = ([h, s, l]: number[]) => {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const channel = (n: number) => {
      const k = (n + h / 30) % 12;
      const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return .2126 * channel(0) + .7152 * channel(8) + .0722 * channel(4);
  };
  const text = parse(color);
  const backgrounds = surfaces.map(parse).filter((v): v is number[] => Boolean(v)).map(luminance);
  if (!text || !backgrounds.length) return color;
  const contrast = (candidate: number[]) => {
    const lum = luminance(candidate);
    return Math.min(...backgrounds.map(bg => (Math.max(lum, bg) + .05) / (Math.min(lum, bg) + .05)));
  };
  if (contrast(text) >= 4.5) return color;
  let best: number[] | undefined;
  for (let lightness = 0; lightness <= 100; lightness += .5) {
    const candidate = [text[0], text[1], lightness];
    if (contrast(candidate) >= 4.5 && (!best || Math.abs(lightness - text[2]) < Math.abs(best[2] - text[2]))) best = candidate;
  }
  return best ? `${best[0]} ${best[1]}% ${best[2]}%` : color;
}
