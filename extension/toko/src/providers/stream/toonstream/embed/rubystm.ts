/**
 * StreamRuby / rubystm.com embed resolver (ported from A1).
 */
import { loadHtml } from '../../../../utils/http/fetch.js';
import { fetchResponse } from '../../../../utils/http/fetch.js';
import type { SourceResult } from '../../../../types.js';
import { normalizeQuality } from '../../../../utils/scraping/quality.js';

export const RUBYSTM_ORIGIN = 'https://rubystm.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

function unpack(p: string, a: number, c: number, k: string[]): string {
  while (c--) {
    if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
  }
  return p;
}

function extractPackedArgs(text: string) {
  try {
    const packerSignature = 'eval(function(p,a,c,k,e,d)';
    const startIdx = text.indexOf(packerSignature);
    if (startIdx === -1) return null;

    const endIdx = text.lastIndexOf(".split('|'))");
    if (endIdx === -1) return null;

    const functionEnd = text.indexOf('}', startIdx);
    const argsStart = text.indexOf('(', functionEnd);
    const argsBody = text.substring(argsStart + 1, endIdx);

    const lastComma = argsBody.lastIndexOf(',');
    const kRaw = argsBody.substring(lastComma + 1);
    const k = kRaw.replace(/^['"]|['"]$/g, '').split('|');

    const secondLastComma = argsBody.lastIndexOf(',', lastComma - 1);
    const c = parseInt(argsBody.substring(secondLastComma + 1, lastComma));

    const thirdLastComma = argsBody.lastIndexOf(',', secondLastComma - 1);
    const a = parseInt(argsBody.substring(thirdLastComma + 1, secondLastComma));

    const pRaw = argsBody.substring(0, thirdLastComma);
    const p = pRaw.trim().replace(/^['"]|['"]$/g, '');

    return { p, a, c, k };
  } catch {
    return null;
  }
}

export function scrapeRubystmHtml(html: string, embedReferer: string): SourceResult | null {
  const $ = loadHtml(html);
  let unpacked: string | null = null;

  for (const el of $('script').toArray()) {
    const text = $(el).html() ?? '';
    if (!text.startsWith('eval(function(p,a,c,k,e,d)')) continue;
    const args = extractPackedArgs(text);
    if (args) {
      unpacked = unpack(args.p, args.a, args.c, args.k);
      break;
    }
  }

  if (!unpacked) return null;

  const hlsMatch = unpacked.match(/file\s*:\s*(['"])(https?:\/\/[^"']+\.m3u8[^"']*)\1/);
  if (!hlsMatch) return null;

  const subtitles: SourceResult['subtitles'] = [];
  const objectRegex = /\{([^{}]*?)\}/g;
  let objMatch: RegExpExecArray | null;
  while ((objMatch = objectRegex.exec(unpacked)) !== null) {
    const content = objMatch[1];
    const kindMatch = content.match(/kind\s*:\s*(['"])([^"']+)\1/);
    const fileMatch = content.match(/file\s*:\s*(['"])([^"']+)\1/);
    const labelMatch = content.match(/label\s*:\s*(['"])([^"']+)\1/);
    if (kindMatch?.[2] === 'captions' && fileMatch?.[2]) {
      const label = labelMatch?.[2] ?? 'English';
      subtitles.push({
        url: fileMatch[2],
        label,
        language: label.toLowerCase().includes('eng') ? 'en' : label.slice(0, 2).toLowerCase(),
      });
    }
  }

  return {
    source: 'toonstream',
    url: hlsMatch[2],
    quality: normalizeQuality('720p'),
    headers: {
      Origin: RUBYSTM_ORIGIN,
      Referer: `${RUBYSTM_ORIGIN}/`,
      'User-Agent': UA,
    },
    subtitles,
    audioLanguage: 'en',
    language: 'English',
    sourceType: 'hls',
  };
}

export async function resolveRubystmSource(
  embedUrl: string,
  toonstreamReferer: string,
): Promise<SourceResult | null> {
  const segments = embedUrl.replace('.html', '').split('/');
  const fileCode = segments.pop() || segments.pop();
  if (!fileCode) return null;

  try {
    const res = await fetchResponse(`${RUBYSTM_ORIGIN}/dl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: embedUrl,
        'User-Agent': UA,
      },
      body: `op=embed&file_code=${fileCode}&auto=1&referer=${encodeURIComponent(toonstreamReferer)}`,
      timeoutMs: 5000,
    });
    if (!res.ok) return null;
    const html = await res.text();
    return scrapeRubystmHtml(html, embedUrl);
  } catch {
    return null;
  }
}
