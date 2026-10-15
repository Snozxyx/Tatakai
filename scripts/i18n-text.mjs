/** JSX decodes entities before rendering; extracted strings need the same treatment. */
export function decodeJsxEntities(value) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: '\u00a0',
    copy: '©',
    reg: '®',
    hellip: '…',
    ndash: '–',
    mdash: '—',
    bull: '•',
    middot: '·',
    times: '×',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === '#') {
      const point = Number.parseInt(
        code.slice(code[1].toLowerCase() === 'x' ? 2 : 1),
        code[1].toLowerCase() === 'x' ? 16 : 10
      );
      return Number.isFinite(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity;
    }
    return named[code] ?? entity;
  });
}
