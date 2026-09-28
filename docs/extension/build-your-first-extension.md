# Build Your First Extension

This walkthrough builds a custom-source extension that also contributes a theme,
analytics, and a renderer bundle — mirroring `extension/aurora/`, which you can
copy as a scaffold. By the end you'll have an installable `.kai` that auto-loads
in development.

## Layout

```
extension/myext/
  manifest.json        # identity + capabilities + apiServer + customSources + contributes
  build.ts             # esbuild → dist/bundle.js + dist/renderer.js, then zip → dist/myext.kai
  package.json         # tsx + esbuild + jszip
  icon.png             # any valid PNG
  README.md
  src/
    catalog.ts         # your data (or scraping helpers)
    index.ts           # Node bundle — the data contract (e.g. custom-source-v1)
    renderer.tsx       # optional: activate(ctx) — pages/slots/providers/modules
```

## 1. `manifest.json`

Declare what you ship. See [manifest-reference.md](manifest-reference.md) for
every field.

```jsonc
{
  "id": "tatakai.extension.myext",
  "name": "My Extension",
  "type": "custom",
  "version": "1.0.0",
  "priority": 50,
  "capabilities": ["custom-source", "theme", "analytics", "ui", "module"],
  "apiServer": {
    "namespace": "myext",
    "contract": "custom-source-v1",
    "routes": ["custom/home", "custom/search", "custom/info", "custom/watch"]
  },
  "customSources": [
    { "id": "myext-main", "kind": "watch", "name": "My Source", "icon": "film" }
  ],
  "contributes": {
    "rendererEntry": "renderer.js",
    "themes": [ /* see themes.md */ ],
    "analytics": [ { "ingestUrl": "https://…/ingest", "events": [] } ]
  },
  "sideloaded": true,
  "permissions": ["network:domain:example.com"]
}
```

> `sideloaded: true` makes the extension **trusted**, so its namespace mounts and
> its renderer bundle loads. Without it (and without a signature) the extension
> stays data-only.

## 2. `src/index.ts` — the Node bundle

Implement your data contract. For a custom watch source
(see [custom-source.md](capabilities/custom-source.md)):

```ts
export class MyBundle {
  async customHome(_sourceId: string)             { return { sections: [/* CustomMediaCard[] */] }; }
  async customSearch(_sourceId, query, _page = 1)  { return { results: [/* … */], hasNextPage: false }; }
  async customInfo(_sourceId, id)                  { return { id, title, image, description, meta, entries }; }
  async customWatch(_sourceId, id, _episodeId)     { return { sources: [/* SourceResult[] */] }; }
}
export default MyBundle;
```

The bundle loads when it exposes `customHome` + one of `customWatch`/`customRead`
(the host checks this in `createBundleLoader`).

## 3. `src/renderer.tsx` — the renderer bundle (optional)

Only if you set `contributes.rendererEntry`. Assign `React` from `ctx.React`
before rendering, then register your contributions. See
[renderer-loader.md](renderer-loader.md) and
[ui-slots-pages.md](capabilities/ui-slots-pages.md).

```tsx
let React: any;
const EXT_ID = 'tatakai.extension.myext';

function MyPage() {
  const [n, setN] = React.useState(0);
  return <button onClick={() => setN(n + 1)}>Clicked {n}</button>;
}

export default function activate(ctx: any) {
  React = ctx.React;
  ctx.registry.registerPage({ id: `${EXT_ID}:page`, path: '/myext', label: 'My Ext', component: MyPage });
  ctx.registry.registerSlot({ id: `${EXT_ID}:banner`, slotId: 'home-top', component: () => <div>hi</div> });
  return () => { /* dispose */ };
}
```

## 4. `build.ts` — dual esbuild + `.kai`

The build produces **both** bundles and zips the archive. The critical detail is
the renderer build: **React external, JSX → `React.createElement`**.

```ts
import * as esbuild from 'esbuild';
import JSZip from 'jszip';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = __dirname, DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });

// Node worker bundle (CJS, node built-ins external)
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/index.ts')], bundle: true,
  platform: 'node', format: 'cjs', outfile: path.join(DIST, 'bundle.js'),
  external: ['node:*', 'fs', 'path', 'os', 'crypto', 'url', 'util', 'http', 'https'],
});

// Renderer bundle (browser ESM, React NOT bundled)
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/renderer.tsx')], bundle: true,
  platform: 'browser', format: 'esm', outfile: path.join(DIST, 'renderer.js'),
  jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
  external: ['react', 'react-dom'],
});

// Zip → dist/myext.kai (manifest.json + bundle.js + renderer.js + README.md + icon.png)
const zip = new JSZip();
for (const [name, src] of [
  ['manifest.json', 'manifest.json'], ['bundle.js', 'dist/bundle.js'],
  ['renderer.js', 'dist/renderer.js'], ['README.md', 'README.md'], ['icon.png', 'icon.png'],
]) zip.file(name, fs.readFileSync(path.join(ROOT, src)));
fs.writeFileSync(path.join(DIST, 'myext.kai'),
  await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
```

`package.json`:

```jsonc
{ "type": "module", "scripts": { "build": "tsx build.ts" },
  "devDependencies": { "esbuild": "^0.25.0", "jszip": "^3.10.1", "tsx": "^4.19.4", "typescript": "^5.8.3", "@types/node": "^26.2.0" } }
```

## 5. Build & run

```bash
cd extension/myext
npm install
npm run build
```

This writes `dist/bundle.js`, `dist/renderer.js`, and `dist/myext.kai`.

- **Auto-load (dev):** the host scans `extension/*/dist/bundle.js`, so your
  extension appears next to the other bundled extensions on the next app launch
  — no install.
- **Sideload:** install `dist/myext.kai`. `kai-format.cjs` validates it.

## 6. Verify

- Sidebar **"+"** lists your custom source → home grid → info → watch/read works.
- Your theme appears in the switcher and applies.
- Your `/myext` page routes; your slot renders at its mount point.
- Your module `init` and analytics provider fire (check the console — logs are
  prefixed `[ext:tatakai.extension.myext]`).
- Confirm a **non**-sideloaded, unsigned build's renderer bundle and apiServer
  namespace are **refused** (the trust gate).

## The `.kai` format

A `.kai` is a ZIP of `manifest.json` + `bundle.js` + (optional) `renderer.js` +
`README.md` + `icon.png`, validated by
`desktop/runtime/extension/kai-format.cjs`. The install path is unchanged by the
overhaul.

## Reference

`extension/aurora/` is a complete, building example of everything above. Copy it
and edit.

