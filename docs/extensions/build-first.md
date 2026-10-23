# Build Your First Extension

Step-by-step guide to creating a Tatakai extension using the reference `aurora` extension as a scaffold.

---

## Prerequisites

- Node.js 20+
- pnpm 9+
- Tatakai repo cloned and `pnpm install` done

---

## 1. Scaffold from Aurora

```bash
# Copy the reference extension
cp -r extensions/aurora extensions/my-extension
cd extensions/my-extension

# Update package.json name
# "name": "@tatakai/extension-my-extension"
```

---

## 2. Configure Manifest

Edit `manifest.json`:

```json
{
  "id": "tatakai.extension.my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "type": "onlinestream",
  "description": "My custom anime/manga source",
  "icon": "data:image/png;base64,...",
  "permissions": [
    "network:domain:example.com"
  ],
  "capabilities": ["manga", "preview"],
  "priority": 100,
  "apiServer": {
    "namespace": "myext",
    "contract": "streaming-sources-v3",
    "routes": ["sources", "stream", "manga/chapters", "manga/pages"],
    "healthPath": "/health"
  },
  "contributes": {
    "rendererEntry": "renderer.js",
    "themes": [
      { "id": "my-theme", "name": "My Theme", "colors": { "--primary": "200 80% 50%" } }
    ]
  }
}
```

**Key decisions:**
- `type`: `onlinestream` (streaming), `torrent` (torrents), `custom` (custom sources)
- `capabilities`: Declare what you support
- `priority`: 100 = default, lower = higher priority
- `apiServer.namespace`: Unique, lowercase, hyphens only

---

## 3. Implement Bundle (Node)

**File:** `src/bundle.ts` → builds to `dist/bundle.js`

```ts
// extensions/my-extension/src/bundle.ts
import type { SourceOptions, SourceResult, SourceChunk } from '@tatakai/extensions-sdk';

class MyExtensionBundle {
  // Required: progressive source resolution
  async sourcesAll(opts: SourceOptions, onChunk: (chunk: SourceChunk) => void) {
    const providers = ['provider-a', 'provider-b'];
    
    for (const provider of providers) {
      try {
        const results = await this.fetchFromProvider(provider, opts);
        onChunk({
          provider,
          results: results.map(r => this.normalize(r)),
          diagnostic: { provider, status: 'ok', resultCount: results.length, durationMs: 100, attempts: 1 }
        });
      } catch (error) {
        onChunk({
          provider,
          results: [],
          diagnostic: { provider, status: 'error', error: error.message, durationMs: 0, attempts: 1 }
        });
      }
    }
  }

  // Optional: stream-only
  async streamAll(opts: SourceOptions, onChunk: (chunk: SourceChunk) => void) {
    // Same as sourcesAll but only HLS/MP4
  }

  // Optional: torrent-only
  async torrentAll(opts: SourceOptions, onChunk: (chunk: SourceChunk) => void) {
    // Only torrent results
  }

  // Fallback: single-shot (if sourcesAll absent)
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const all: SourceResult[] = [];
    for (const provider of ['provider-a', 'provider-b']) {
      const results = await this.fetchFromProvider(provider, opts);
      all.push(...results.map(r => this.normalize(r)));
    }
    return all;
  }

  // Per-provider debugging
  async runProvider(providerName: string, opts: SourceOptions) {
    const results = await this.fetchFromProvider(providerName, opts);
    return {
      provider: providerName,
      results: results.map(r => this.normalize(r)),
      diagnostic: { provider: providerName, status: 'ok', resultCount: results.length, durationMs: 100, attempts: 1 }
    };
  }

  // Provider inventory
  listProviders() {
    return [
      { name: 'provider-a', kind: 'stream', enabled: true },
      { name: 'provider-b', kind: 'torrent', enabled: true },
    ];
  }

  // Manga support
  async getMangaChapters(params: any) {
    // Return MangaChapterEntry[]
    return [{
      number: 1,
      title: 'Chapter 1',
      sources: [{
        provider: 'mangadex',
        chapterKey: 'md:ch-1',
        providerChapterId: 'ch-1',
        language: 'en',
      }]
    }];
  }

  async getMangaPages(params: any) {
    // Return pages with headers for proxy
    return {
      pages: [{
        pageNumber: 1,
        imageUrl: 'https://example.com/page1.jpg',
        headers: { Referer: 'https://example.com/' }
      }]
    };
  }

  private async fetchFromProvider(provider: string, opts: SourceOptions) {
    // Your scraping logic here
    // Use fetch with opts.titles, opts.anilistId, etc.
    return [];
  }

  private normalize(raw: any): SourceResult {
    return {
      source: raw.label,
      url: raw.url,
      quality: raw.quality,
      headers: raw.headers || {},
      subtitles: raw.subtitles || [],
      audioLanguage: raw.lang,
      sourceType: raw.type,
      server: raw.server,
      providerPriority: raw.priority,
    };
  }
}

export default new MyExtensionBundle();
```

---

## 4. Implement Renderer (Optional)

**File:** `src/renderer.ts` → builds to `dist/renderer.js`

```ts
// extensions/my-extension/src/renderer.ts
import type { ExtensionContext } from '@tatakai/extensions-sdk';

export async function activate(ctx: ExtensionContext) {
  const { registry, React, navigate, storage, log } = ctx;

  // Register a page
  registry.registerPage({
    id: `${ctx.extensionId}:dashboard`,
    path: '/my-extension',
    component: React.memo(() => <Dashboard navigate={navigate} />),
    label: 'My Extension',
    icon: 'sparkles',
  });

  // Register a header slot
  registry.registerSlot({
    id: `${ctx.extensionId}:header-link`,
    slotId: 'header:actions',
    component: React.memo(() => <HeaderLink navigate={navigate} />),
  });

  // Register a service
  registry.registerService({
    id: `${ctx.extensionId}:api`,
    name: 'My Extension API',
    api: {
      async doSomething() { return 'done'; },
    },
  });

  // Register a module (background task)
  registry.registerModule({
    id: `${ctx.extensionId}:sync`,
    init: async (ctx) => {
      log('Starting background sync');
      // Set up periodic sync, WebSocket, etc.
    },
    dispose: () => {
      log('Cleaning up');
    },
  });

  // Optional: return dispose for cleanup
  return () => {
    log('Extension unloading');
  };
}

// Components using ctx.React
function Dashboard({ navigate }: { navigate: (p: string) => void }) {
  const React = (window as any).React; // Or passed via props
  return React.createElement('div', { className: 'p-4' }, 'My Extension Dashboard');
}

function HeaderLink({ navigate }: { navigate: (p: string) => void }) {
  return React.createElement('button', { 
    className: 'btn-ghost', 
    onClick: () => navigate('/my-extension') 
  }, 'MyExt');
}
```

---

## 5. Build Configuration

**File:** `vite.config.ts`

```ts
// extensions/my-extension/vite.config.ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    // Bundle for Node (main process)
    lib: {
      entry: resolve(__dirname, 'src/bundle.ts'),
      name: 'MyExtensionBundle',
      fileName: 'bundle',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['node:http', 'node:https', 'node:url', 'node:path', 'node:fs'],
      output: { globals: {} },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});

// Separate config for renderer (or use build.rollupOptions with multiple entries)
```

**Renderer config** (separate file or second build):

```ts
// vite.renderer.config.ts
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/renderer.ts'),
      name: 'MyExtensionRenderer',
      fileName: 'renderer',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', '@tanstack/react-query', 'zustand', 'framer-motion'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM' },
      },
    },
    outDir: 'dist',
  },
});
```

**package.json scripts:**
```json
{
  "scripts": {
    "build": "vite build && vite build --config vite.renderer.config.ts",
    "dev": "vite build --watch --mode development"
  }
}
```

---

## 6. Build & Test

```bash
# From repo root
pnpm ext:build --filter=my-extension

# Or from extension directory
pnpm build

# Output: extensions/my-extension/dist/bundle.js + renderer.js
```

### Test in Development

1. **Auto-load:** Restart desktop app — bundled extensions auto-load
2. **Extension Hub:** Open Settings → Extensions → should appear
3. **Debug:** Open DevTools (`Ctrl+Shift+I`) → Console for `[ext:myext]` logs

---

## 7. Package as .kai

```bash
# From repo root
pnpm ext:pack --filter=my-extension

# Output: extensions/my-extension/dist/my-extension-1.0.0.kai
```

### .kai Structure

```
my-extension-1.0.0.kai
├── manifest.json
├── bundle.js
├── renderer.js       (if contributes.rendererEntry)
├── README.md
└── icon.png
```

---

## 8. Distribute

Share `.kai` file directly, or submit to marketplace (future).

**Users install via:** Settings → Extensions → "Install from file" → select `.kai`

---

## Complete Example: Minimal Streaming Extension

### manifest.json
```json
{
  "id": "tatakai.extension.minimal",
  "name": "Minimal Stream",
  "version": "1.0.0",
  "type": "onlinestream",
  "description": "Minimal streaming source",
  "permissions": ["network:domain:stream.example.com"],
  "capabilities": ["preview"],
  "apiServer": {
    "namespace": "minimal",
    "contract": "streaming-sources-v3",
    "routes": ["stream"],
    "healthPath": "/health"
  }
}
```

### src/bundle.ts
```ts
class MinimalBundle {
  async streamAll(opts, onChunk) {
    const url = `https://stream.example.com/api?title=${encodeURIComponent(opts.titles[0])}&ep=${opts.episode}`;
    const res = await fetch(url);
    const data = await res.json();
    
    onChunk({
      provider: 'minimal',
      results: data.sources.map((s: any) => ({
        source: 'Minimal',
        url: s.url,
        quality: s.quality,
        headers: { Referer: 'https://stream.example.com/' },
        subtitles: [],
        sourceType: 'hls',
      })),
      diagnostic: { provider: 'minimal', status: 'ok', resultCount: data.sources.length, durationMs: 50, attempts: 1 }
    });
  }
}
export default new MinimalBundle();
```

**No renderer needed** — pure data-driven.

---

## Debugging Tips

| Issue | Solution |
|-------|----------|
| Extension not loading | Check `pnpm ext:build` output, verify `dist/bundle.js` exists |
| Sources not appearing | Check `electron.listInstalledExtensions` in DevTools Console |
| Manga not working | Verify `capabilities: ["manga"]` and `routes: ["manga/chapters", "manga/pages"]` |
| Renderer not loading | Check trust status in Extension Hub, verify `rendererEntry` path |
| Styles broken | Use Tailwind classes, app's Tailwind config applies |
| Hooks errors | Ensure using `ctx.React`, not bundled React |

---

## Next Steps

- [Capabilities Reference](extensions/capabilities/) — Deep dive each capability
- [Renderer Loader](extensions/renderer-loader.md) — Full context API
- [Security](extensions/security.md) — Permissions, trust model
- [Migration](extensions/migration.md) — Upgrading old extensions

---

## Reference Extension

**`extensions/aurora/`** — Exercises **every capability** in one package:
- Anime streaming source
- Manga source
- Custom source (watch + read)
- Theme
- Analytics
- Renderer page + slot + service + module

Copy and modify for your own extension.