function numericParts(version: string): number[] {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function compareAppVersions(left: string, right: string): number {
  const a = numericParts(left);
  const b = numericParts(right);
  const width = Math.max(a.length, b.length, 3);
  for (let index = 0; index < width; index++) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}
