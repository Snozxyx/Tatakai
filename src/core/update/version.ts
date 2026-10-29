/** SemVer precedence, including numeric beta identifiers and stable promotion. */
export function compareAppVersions(left: string, right: string): number {
  const parse = (value: string) => String(value || '').trim().replace(/^v/i, '').split('+')[0].match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  const a = parse(left), b = parse(right); if (!a || !b) return 0;
  for (let i = 1; i <= 3; i++) { const d = Number(a[i]) - Number(b[i]); if (d) return d > 0 ? 1 : -1; }
  if (!a[4] || !b[4]) return a[4] ? -1 : b[4] ? 1 : 0;
  const ap = a[4].split('.'), bp = b[4].split('.');
  for (let i = 0; i < Math.max(ap.length,bp.length); i++) {
    if (ap[i] === undefined) return -1; if (bp[i] === undefined) return 1; if (ap[i] === bp[i]) continue;
    const an = /^\d+$/.test(ap[i]), bn = /^\d+$/.test(bp[i]);
    if (an && bn) return Number(ap[i]) > Number(bp[i]) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1; return ap[i] > bp[i] ? 1 : -1;
  }
  return 0;
}
