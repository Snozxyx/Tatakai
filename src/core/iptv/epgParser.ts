import type { IPTVProgram } from "./types";
export function xmltvTime(value: string): number {
  const m = value.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(Z|[+-]\d{4})?$/
  );
  if (!m) return NaN;
  const offset =
    !m[7] || m[7] === "Z"
      ? 0
      : (m[7][0] === "-" ? -1 : 1) *
        (Number(m[7].slice(1, 3)) * 60 + Number(m[7].slice(3)));
  return (
    Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) -
    offset * 60000
  );
}
const decode = (s: string) =>
  s.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[\da-f]+|\d+);/gi, (entity) => {
    const names: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
    };
    if (names[entity]) return names[entity];
    const n = entity.startsWith("&#x")
      ? parseInt(entity.slice(3), 16)
      : parseInt(entity.slice(2), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  });
export function parseXMLTVChunk(
  fragment: string,
  playlistId: string
): IPTVProgram[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(fragment))
    throw new Error("XML entities and document types are not allowed.");
  const rows: IPTVProgram[] = [];
  for (const m of fragment.matchAll(
    /<programme\b([^>]*)>([\s\S]*?)<\/programme\s*>/gi
  )) {
    const attributes: Record<string, string> = {};
    for (const a of m[1].matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g))
      attributes[a[1]] = decode(a[2]);
    const start = xmltvTime(attributes.start || ""),
      stop = xmltvTime(attributes.stop || "");
    if (!Number.isFinite(start) || !(stop > start) || !attributes.channel)
      continue;
    const read = (tag: string) =>
      decode(
        (
          m[2].match(
            new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
          )?.[1] || ""
        )
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
          .replace(/<[^>]+>/g, "")
          .trim()
      );
    rows.push({
      id: `${playlistId}:${attributes.channel}:${start}`,
      playlistId,
      channelId: attributes.channel,
      title: read("title"),
      description: read("desc"),
      start,
      stop,
      expiresAt: stop + 86400000,
    });
  }
  return rows;
}
export function nowNext(programs: IPTVProgram[], now = Date.now()) {
  const sorted = [...programs].sort((a, b) => a.start - b.start);
  return {
    now: sorted.find((p) => p.start <= now && p.stop > now),
    next: sorted.find((p) => p.start > now),
  };
}
