/** Source timing overrides AniSkip only for the matching segment type. */
export function mergeSkipSegments<T>(source: T[], fallback: T[], typeOf: (segment: T) => string): T[] {
  const family = (type: string) => type === 'mixed-op' ? 'op' : type === 'mixed-ed' ? 'ed' : type;
  const supplied = new Set(source.map(segment => family(typeOf(segment))));
  return [...source, ...fallback.filter(segment => !supplied.has(family(typeOf(segment))))];
}
