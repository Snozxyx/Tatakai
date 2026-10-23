import type { CompatibilitySource } from './client';

export function compatibilityProviderName(source: CompatibilitySource) {
  const suffix = `(${source.lang})`;
  return (source.name.toLowerCase().endsWith(suffix.toLowerCase()) ? source.name.slice(0, -suffix.length) : source.name).trim();
}
export function compatibilityProviderKey(source: CompatibilitySource) {
  return `${source.ecosystem}:${source.packageId}:${source.kind}:${compatibilityProviderName(source).toLowerCase()}`;
}
export function compatibilityProviders(sources: CompatibilitySource[]) {
  const groups = new Map<string, { id: string; name: string; sources: CompatibilitySource[] }>();
  for (const source of sources) {
    const id = compatibilityProviderKey(source), group = groups.get(id) || { id, name: compatibilityProviderName(source), sources: [] };
    group.sources.push(source); groups.set(id, group);
  }
  return [...groups.values()];
}
