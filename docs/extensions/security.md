# Security & Trust Model

The extension system enforces a layered security model balancing extensibility with user safety.

---

## Trust Tiers

| Tier | Extensions | Capabilities | Validation |
|------|------------|--------------|------------|
| **Bundled** | Shipped with app (`extensions/*/dist/`) | All (data + code) | Pre-audited, signed by build |
| **Trusted Sideloaded** | User-installed `.kai` with valid signature (legacy) | All (data + code) | Signature verified at install |
| **Untrusted Sideloaded** | User-installed `.kai` without signature | Data-driven only | Manifest validation only |

**Current state:** Legacy signing fields ignored. Trust = bundled OR explicitly marked trusted in registry.

---

## Execution Privileges

| Component | Process | Privileges |
|-----------|---------|------------|
| **Main bundle (`bundle.js`)** | Node (main process, in-process `require()`) | Full Node APIs, network (per manifest), file system (sandboxed dir) |
| **Renderer bundle (`renderer.js`)** | Browser (renderer process) | App React instance, DOM, network via `ctx.fetch` (proxied) |
| **Stremio addons** | HTTP/JSON only | No code execution |
| **Seanime/Mihon/Aniyomi** | Compatibility layer | Sandboxed per ecosystem |

---

## Permission System

### Manifest Permissions

```json
{
  "permissions": [
    "network:domain:nyaa.si",
    "network:domain:*.animepahe.ru",
    "torrent:search",
    "torrent:download",
    "parse:html",
    "parse:json",
    "storage:unlimited"
  ]
}
```

| Permission | Scope | Enforcement |
|------------|-------|-------------|
| `network:domain:<host>` | HTTP requests to domain | Main process proxy validates |
| `torrent:search` | Torrent engine search | TorrentCore checks |
| `torrent:download` | Torrent engine download | TorrentCore checks |
| `parse:<parser>` | Specific parser access | Bundle sandbox checks |
| `storage:unlimited` | Bypass extension storage quota | Registry enforces |

### Network Enforcement

All extension `fetch` calls route through **main process proxy**:

```
Extension fetch(url)
        │
        ▼
Main process: validate domain against manifest.permissions
        │
        ├── Allowed → Proxy request (with header replay, Cloudflare bypass)
        │
        └── Denied → Throw network error
```

**Code:** `desktop/runtime/extension-api-host/host-server.cjs` → `installInProcessFetchShim()`

---

## Payload & Timeout Guards

**File:** `desktop/runtime/security/`

| Guard | File | Limit |
|-------|------|-------|
| **Payload limit** | `payload-guard.cjs` | 10 MB on IPC responses |
| **Call timeout** | `timeout-guard.cjs` | Configurable (default 30s) |

```js
// payload-guard.cjs
function enforcePayloadLimit(data, limit = 10 * 1024 * 1024) {
  const size = Buffer.byteLength(JSON.stringify(data));
  if (size > limit) throw new Error(`Payload exceeds ${limit} bytes`);
}

// timeout-guard.cjs
function withCallTimeout(promise, ms = 30000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Call timeout')), ms)),
  ]);
}
```

---

## Kill Switches

**Server-side kill list** checked at runtime:

```ts
// desktop/ipc/ipc-runtime.cjs
ipcMain.handle('runtime:health', async () => {
  for (const id of registry.listLoaded()) {
    if (registry.isKillSwitched(id)) {
      workerPool.terminate(id);
      registry.unregister(id);
      logger.warn(`[Extension] Kill-switched extension unloaded: ${id}`);
    }
  }
  return { status: 'ok', loadedExtensions: registry.listLoaded() };
});
```

- Fetched from TatakaiAPI on boot
- Can disable specific extensions globally
- Immediate termination on detection

---

## Manifest Validation (kai-format.cjs)

**File:** `desktop/runtime/extension/kai-format.cjs`

### Structural Validation

1. **ZIP archive** — Valid `.kai` file
2. **Required files** — `manifest.json`, `bundle.js`
3. **Manifest schema** — All required fields, valid types
4. **ID safety** — `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`, no `..`
5. **Size limits** — `bundle.js` ≤ 10 MB, `icon.png` ≤ 512 KB
6. **Custom sources** — Validated if `custom-source` capability declared

### Stripped Fields (Legacy)

```js
// Legacy signing metadata ignored
delete manifest.signature;
delete manifest.signedBy;
delete manifest.sideloaded;
```

---

## Installation Security

### Path Traversal Prevention

```js
// kai-format.cjs
function installKaiExtension(parsed, extensionsDir, fs, path) {
  const extId = parsed.manifest.id;
  if (!isValidExtensionId(extId)) throw new Error('Unsafe id');
  
  const extDir = path.join(extensionsDir, extId);
  const resolvedDir = path.resolve(extDir);
  const resolvedBase = path.resolve(extensionsDir);
  
  // Defence in depth
  if (resolvedDir !== resolvedBase && !resolvedDir.startsWith(resolvedBase + path.sep)) {
    throw new Error('Refusing to install outside extensions directory');
  }
}
```

### Auto-load Safety

Bundled extensions auto-loaded from `extension/*/dist/` — only first-party code.

---

## Runtime Isolation

### Extension Worker Pool (Main Process)

**File:** `desktop/runtime/extension/extension-worker-pool.cjs`

- Each extension bundle runs in isolated worker thread
- Communication via message passing
- Suspend/resume based on activity
- Resource limits per worker

### Renderer Process

- Code-driven contributions run in **app's React runtime**
- No direct Node.js access
- Network via `ctx.fetch` (proxied)
- Storage via `ctx.storage` (namespaced localStorage)

---

## Data Isolation

| Data Type | Isolation |
|-----------|-----------|
| **Extension storage** | Namespaced: `ext:${id}:${key}` in localStorage |
| **Custom source progress** | Separate React Query keys: `['custom', namespace, sourceId, ...]` |
| **Download tracking** | `downloads` table with `source_id = "${namespace}::${sourceId}"` |
| **Analytics** | Per-provider, namespaced IDs |

---

## Compatibility Layer Security

| Ecosystem | Isolation |
|-----------|-----------|
| **Stremio** | HTTP/JSON only — no code execution |
| **Seanime** | JS/TS providers run in compatibility VM (Sora) |
| **Mihon/Aniyomi** | Source mapping only — no extension code |
| **CloudStream** | Source mapping only |
| **Sora** | Interpreter VM (isolated) |
| **MangaYomi** | VM-based execution |

---

## Best Practices for Extension Authors

### Do
- Declare minimal permissions
- Use `ctx.fetch` for network (auto-proxied)
- Use `ctx.storage` for persistence
- Handle errors gracefully
- Clean up in `dispose()`

### Don't
- Bundle Node.js polyfills in renderer
- Use `eval()` or `new Function()`
- Access `window.electron` directly (use `ctx` APIs)
- Store sensitive data in localStorage
- Make assumptions about app internals

---

## Audit Checklist

- [ ] Manifest validates against schema
- [ ] Permissions minimal and specific
- [ ] No `eval`/`Function` in bundles
- [ ] Network calls use `ctx.fetch`
- [ ] Storage uses `ctx.storage`
- [ ] Renderer uses `ctx.React`
- [ ] `dispose` cleans up all resources
- [ ] No hardcoded secrets in bundle
- [ ] Error handling doesn't leak internals
- [ ] Works without trusted status (data-driven only)

---

## Related

- [Extension Overview](extensions/overview.md)
- [Manifest Reference](extensions/manifest.md)
- [Renderer Loader](extensions/renderer-loader.md)
- [Build First Extension](extensions/build-first.md)