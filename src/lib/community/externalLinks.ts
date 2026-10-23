export interface ExternalEmbed {
  url: string;
  provider: string;
  src?: string;
  height?: number;
  inviteCode?: string;
}

/** Only construct frames on known providers; never frame a user-supplied URL. */
export function externalEmbed(raw: string): ExternalEmbed | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname;
  const result: ExternalEmbed = { url: url.href, provider: host };
  if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) {
    const id = host === 'youtu.be' ? path.split('/')[1] : url.searchParams.get('v') || path.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
    if (id && /^[\w-]{11}$/.test(id)) {
      const src = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
      const time = url.searchParams.get('t') || url.searchParams.get('start') || '';
      const seconds = /^\d+$/.test(time) ? Number(time) : /^(?:\d+h)?(?:\d+m)?(?:\d+s)?$/.test(time)
        ? Number(time.match(/(\d+)h/)?.[1] || 0) * 3600 + Number(time.match(/(\d+)m/)?.[1] || 0) * 60 + Number(time.match(/(\d+)s/)?.[1] || 0) : 0;
      if (seconds > 0 && Number.isSafeInteger(seconds)) src.searchParams.set('start', String(seconds));
      return { ...result, provider: 'YouTube', src: src.href };
    }
  }
  if (['reddit.com', 'old.reddit.com', 'np.reddit.com', 'new.reddit.com'].includes(host) && /^\/r\/[\w]+\/comments\/[a-z0-9]+(?:\/[^/]*)?(?:\/[a-z0-9]+)?\/?$/i.test(path)) {
    return { ...result, provider: 'Reddit', src: `https://www.redditmedia.com${path}?ref_source=embed&ref=share&embed=true&theme=dark`, height: 400 };
  }
  if (host === 'vimeo.com' && /^\/\d+\/?$/.test(path)) {
    return { ...result, provider: 'Vimeo', src: `https://player.vimeo.com/video/${path.split('/')[1]}` };
  }
  const spotify = path.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode|show|artist)\/([a-zA-Z0-9]+)\/?$/);
  if (host === 'open.spotify.com' && spotify) {
    return { ...result, provider: 'Spotify', src: `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}`, height: spotify[1] === 'track' || spotify[1] === 'episode' ? 152 : 352 };
  }
  const invite = host === 'discord.gg' ? path.match(/^\/([\w-]+)\/?$/) : ['discord.com', 'discordapp.com'].includes(host) ? path.match(/^\/invite\/([\w-]+)\/?$/) : null;
  if (invite) return { ...result, provider: 'Discord', inviteCode: invite[1] };
  if (['discord.com', 'discordapp.com'].includes(host)) result.provider = 'Discord';
  if (['reddit.com', 'redd.it'].includes(host)) result.provider = 'Reddit';
  return result;
}

/** Ignore code, quotes and hidden spoilers so previews cannot reveal them. */
export function extractExternalEmbeds(content: string, html = false): ExternalEmbed[] {
  let text = content;
  const urls: string[] = [];
  if (html) {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    doc.querySelectorAll('code, pre, blockquote, [data-spoiler], script, style').forEach(node => node.remove());
    doc.querySelectorAll('a[href]').forEach(node => urls.push(node.getAttribute('href') || ''));
    const walker = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */);
    const parts: string[] = [];
    while (walker.nextNode()) parts.push(walker.currentNode.textContent || '');
    text = parts.join('\n');
  } else {
    text = text.replace(/```[\s\S]*?```|`[^`]*`|\|\|[\s\S]*?\|\||^>.*$/gm, '');
  }
  urls.push(...(text.match(/https?:\/\/[^\s<>"'`|]+/gi) || []).map(url => url.replace(/[.,!?;:)\]}*~]+$/, '')));
  const seen = new Set<string>();
  return urls.flatMap(raw => {
    const embed = externalEmbed(raw);
    if (!embed || seen.has(embed.src || embed.url)) return [];
    seen.add(embed.src || embed.url);
    return [embed];
  }).slice(0, 3);
}
