/** Keep the chapter number in the row heading, without repeating a provider's prefix. */
export function chapterTitleText(number: number | null, title: string | null | undefined) {
  if (!title || number == null) return title || '';
  const escaped = String(number).replace('.', '\\.');
  return title.replace(new RegExp('^(?:chapter|ch\\.?)\\s*' + escaped + '(?=\\s|[—–:-]|$)\\s*[—–:-]?\\s*', 'i'), '').trim();
}
