import type { IPTVStream } from "./types";
export interface ParsedChannel extends IPTVStream {
  name: string;
  tvgId?: string;
  logo?: string;
  group: string;
}
export function parseM3U(text: string, baseUrl?: string): ParsedChannel[] {
  if (/#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE|VERSION)/i.test(text))
    throw new Error("This URL is an HLS stream, not an IPTV channel playlist.");
  const result: ParsedChannel[] = [];
  let item: Omit<ParsedChannel, "url"> | undefined;
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#EXTINF:")) {
      const attrs: Record<string, string> = {};
      for (const m of line.matchAll(
        /([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g
      ))
        attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
      // A comma inside a quoted attribute is not the title delimiter.
      const title = line
        .match(/,(?=(?:[^"]*"[^"]*")*[^"]*$)(.*)$/)?.[1]
        ?.trim();
      item = {
        name: title || attrs["tvg-name"] || "Unnamed channel",
        tvgId: attrs["tvg-id"],
        logo: attrs["tvg-logo"],
        group: attrs["group-title"] || "Other",
        headers: {},
      };
    } else if (item && line.startsWith("#EXTVLCOPT:")) {
      const match = line.match(
        /^#EXTVLCOPT:http-(user-agent|referrer|referer)=(.*)$/i
      );
      if (match)
        item.headers[
          match[1].toLowerCase() === "user-agent" ? "User-Agent" : "Referer"
        ] = match[2];
    } else if (item && line.startsWith("#EXTHTTP:")) {
      try {
        const headers = JSON.parse(line.slice(9));
        for (const [key, value] of Object.entries(headers))
          if (typeof value === "string" && !/[\r\n]/.test(key + value))
            item.headers[key] = value;
      } catch {
        /* malformed optional directive */
      }
    } else if (item && line && !line.startsWith("#")) {
      try {
        const [source, inline] = line.split("|");
        const url = new URL(source, baseUrl);
        if (!["http:", "https:", "rtsp:"].includes(url.protocol)) {
          item = undefined;
          continue;
        }
        if (inline)
          for (const [key, value] of new URLSearchParams(inline))
            item.headers[key] = value;
        result.push({ ...item, url: url.href });
      } catch {
        /* skip malformed channel */
      }
      item = undefined;
    }
  }
  return result;
}
