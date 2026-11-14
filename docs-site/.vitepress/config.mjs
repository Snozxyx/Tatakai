import { defineConfig } from 'vitepress';
import pages from '../pages.json' with { type: 'json' };

const section = (path, text) => ({
  text,
  link: `/${path}`,
  collapsed: false,
  items: pages
    .filter((page) => page.path.startsWith(`${path}/`))
    .map((page) => ({ text: page.title, link: `/${page.path.replace(/\.md$/, '')}` })),
});

export default defineConfig({
  title: 'Tatakai Docs',
  description: 'Guides for Tatakai, its apps, architecture, and extension ecosystem.',
  srcDir: 'content',
  outDir: 'dist',
  cleanUrls: true,
  vite: { css: { postcss: { plugins: [] } } },
  rewrites: { 'welcome-to-tatakai.md': 'index.md' },
  lastUpdated: false,
  head: [
    ['link', { rel: 'icon', href: '/favicon.png' }],
    ['meta', { name: 'theme-color', content: '#f2765b' }],
  ],
  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'Tatakai Docs',
    nav: [
      { text: 'Website', link: 'https://tatakai.app' },
      { text: 'Extensions', link: 'https://extensions.tatakai.app' },
      { text: 'Discord', link: 'https://dsc.gg/tatakai' },
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Welcome to Tatakai', link: '/' },
          { text: 'Product overview', link: '/product-overview' },
          { text: 'Development setup', link: '/development-setup' },
          { text: 'Contributing', link: '/contributing' },
        ],
      },
      section('feature-guides', 'Feature guides'),
      section('architecture', 'Architecture'),
      section('extensions', 'Extensions'),
      section('technical-reference', 'Technical reference'),
    ],
    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'On this page' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/snozxyx/Tatakai' }],
    footer: { message: 'Tatakai documentation', copyright: 'Tatakai contributors' },
  },
  transformHead({ pageData }) {
    const route = ['index.md', 'welcome-to-tatakai.md'].includes(pageData.relativePath)
      ? '/'
      : `/${pageData.relativePath.replace(/\.md$/, '')}`;
    return [['link', { rel: 'canonical', href: `https://docs.tatakai.app${route}` }]];
  },
});
