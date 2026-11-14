import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = JSON.parse(await fs.readFile(path.join(root, 'pages.json'), 'utf8'));
const publicDir = path.join(root, 'content', 'public');
const base = 'https://docs.tatakai.app';
await fs.mkdir(publicDir, { recursive: true });
let full = '# Tatakai Docs\n\n';
let index = '# Tatakai Docs\n\n';
for (const page of pages) {
  const source = await fs.readFile(path.join(root, 'content', page.path), 'utf8');
  const output = path.join(publicDir, page.path);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, source, 'utf8');
  index += `- [${page.title}](${base}/${page.path})\n`;
  full += `## ${page.title}\n\nSource: ${base}/${page.path}\n\n${source}\n\n---\n\n`;
}
await fs.copyFile(path.join(publicDir, 'welcome-to-tatakai.md'), path.join(publicDir, 'index.md'));
await fs.writeFile(path.join(publicDir, 'llms.txt'), index, 'utf8');
await fs.writeFile(path.join(publicDir, 'llms-full.txt'), full, 'utf8');
const urls = pages.map((page) => {
  const route = page.path === 'welcome-to-tatakai.md' ? '/' : `/${page.path.replace(/\.md$/, '')}`;
  return `<url><loc>${base}${route}</loc></url>`;
}).join('\n');
await fs.writeFile(path.join(publicDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
await fs.writeFile(path.join(publicDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
console.log(`Prepared Markdown exports for ${pages.length} pages.`);
