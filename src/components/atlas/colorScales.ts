// Small self-contained color ramps for the Atlas (no d3 dependency).

type RGB = [number, number, number];

function interpolate(stops: RGB[], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const i = Math.floor(scaled);
  const f = scaled - i;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r}, ${g}, ${bl})`;
}

// Plasma-like ramp (deep indigo -> magenta -> amber -> yellow), used for year.
const PLASMA: RGB[] = [
  [13, 8, 135],
  [126, 3, 168],
  [204, 71, 120],
  [248, 149, 64],
  [240, 249, 33],
];

// Red -> yellow -> green, used for rating.
const RDYLGN: RGB[] = [
  [215, 48, 39],
  [254, 224, 139],
  [26, 152, 80],
];

export function yearColor(year: number | null | undefined, minYear: number, maxYear: number): string {
  if (year == null) return 'rgb(120,120,140)';
  const span = Math.max(1, maxYear - minYear);
  return interpolate(PLASMA, (year - minYear) / span);
}

export function ratingColor(score: number | null | undefined): string {
  if (score == null) return 'rgb(120,120,140)';
  // AniList averageScore is 0–100; most sit in 40–90, so stretch that band.
  return interpolate(RDYLGN, (score - 40) / 50);
}
