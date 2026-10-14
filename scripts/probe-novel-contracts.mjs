import { createRequire } from 'node:module';
const require = createRequire(new URL('../toko/,/package.json', import.meta.url));
const { load } = require('cheerio');
const urls = process.argv.slice(2);
await Promise.all(urls.map(async url => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const html = await response.text(); const $ = load(html);
    const links = new Map();
    $('a[href]').each((_, el) => { const a = $(el); const href = a.attr('href');
      if (/novel|book|chapter|translation|fiction/i.test(href) && a.text().trim()) links.set(href, { href, text:a.text().trim().replace(/\s+/g,' ').slice(0,120), class:a.attr('class'), parent:a.parent().attr('class') });
    });
    console.log(JSON.stringify({url,status:response.status,links:[...links.values()].slice(-22),data:$('#__NEXT_DATA__').text().slice(0,900),markers:html.match(/.{0,80}(?:manga_id|chapter-content|chapter-list|chapter-item|chapter-inner|ln-prose|_buildManifest).{0,150}/g)?.slice(0,6)}));
  } catch (e) { console.log(JSON.stringify({url,error:e.message})); }
}));
