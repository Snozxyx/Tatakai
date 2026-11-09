/** Give API badge values readable casing while preserving titles and acronyms. */
export function readableBadgeLabel(value: string): string {
  const label = value.trim();
  if (/^(TV|OVA|ONA|OAD|PV)$/i.test(label)) return label.toUpperCase();
  if (!/^(manga|manhwa|manhua|novel|light[ _-]novel|movie|special|music|comic|ongoing|airing|releasing|publishing|completed|finished(?:[ _-]airing)?|hiatus|on[ _-]hold|cancelled|canceled|upcoming|not[ _-]yet[ _-](?:aired|published))$/i.test(label)) return value;
  const words = label.replace(/[_-]/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
