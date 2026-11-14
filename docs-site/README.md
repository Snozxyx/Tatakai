# Tatakai documentation

The documentation is a static VitePress site served from the production server at
https://docs.tatakai.app. Its 38 initial pages were exported from the published
GitBook site on 9 November 2026. GitBook is not required to build or serve it.

Edit Markdown under `content/`. `pages.json` records the page titles and paths;
update it when adding a page. Navigation and local search are built from those
pages, and the original public URLs are preserved. The build also publishes raw
Markdown, `llms.txt`, `llms-full.txt`, and a sitemap.

```sh
npm ci
npm run dev
npm run build
```

Upload the contents of `dist/` as a verified documentation release. Production
uses the `docs-current` symlink under `/srv/tatakai/releases` and serves the
release through the existing Nginx ingress and Cloudflare tunnel. Keep rollback
releases and validate all page routes before replacing that pointer.

The GitBook export remains in the private migration archive as a recovery copy.
Only public documentation belongs in this package.
