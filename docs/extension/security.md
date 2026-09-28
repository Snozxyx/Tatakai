# Extension Security & Sideloading

**Read this before you sideload anything.** Extensions are not a sandbox. A
trusted extension runs with the **same privileges as the app itself**. This
document explains the trust model, exactly what a trusted extension can do, how
the app defends against a malicious one, and what you can and cannot rely on.

## ⚠️ The sideloading warning

When you sideload a `.kai`, you are marking it **trusted**. A trusted extension
can:

- Run **arbitrary JavaScript in the app's own realm** — same window, same React
  runtime, same DOM, same privileges as the app (via the renderer loader).
- Be **`require()`d in the Node/main-side host** and run in-process there.
- Mount an HTTP **`apiServer` namespace** the app will route requests to.
- Read and write your app data reachable from those planes.

`import(blobURL)` and the in-process `require()` are **not** isolation
boundaries. There is no in-realm sandbox behind the trust gate. **Only sideload
extensions whose source you have read or whose author you trust.** Treat a `.kai`
from an unknown source exactly as you would treat running an unknown `.exe`.

## The trust model

Trust is binary and comes from one gate:

```ts
isTrusted(ext) = ext.sideloaded === true
              || (typeof ext.signature === 'string' && ext.signature.length > 0)
```

- **Sideloaded** (`sideloaded: true` in the manifest, or installed by the user
  from a `.kai`) → **trusted**.
- **Signed** (a valid signature string) → **trusted** (curated distribution).
- **Neither** → **untrusted**: the extension stays **data-only**. Its code is
  never `require()`d in-process, its renderer bundle is never loaded, and its
  `apiServer` namespace is never mounted. Its content is only ever served
  through the app's own vetted host router.

There is no partial trust. An extension is either data-only or fully privileged.

## What the app does to defend

The app cannot sandbox a trusted extension, so its defenses are about (1) keeping
untrusted extensions strictly data-only and (2) validating the bundle before it
is ever trusted.

- **`.kai` validation** (`desktop/runtime/extension/kai-format.cjs`): the archive
  is parsed and its `manifest.json` is checked against
  `REQUIRED_MANIFEST_FIELDS` before install. Malformed manifests are rejected.
- **Single trust gate, reused everywhere**: the same `isTrusted` /
  `sideloaded === true || signature` check gates all three privileged surfaces —
  the in-process `require()` (`findNamespaceEntry` in
  `desktop/runtime/extension-api-host/host-server.cjs`), the renderer bundle IPC
  (`runtime:get-renderer-bundle` in `desktop/ipc/ipc-runtime.cjs`), and the
  renderer loader's own re-check (`rendererLoader.ts`). An untrusted extension
  fails all three.
- **Main-side refusal**: `runtime:get-renderer-bundle` refuses to return bytes
  for an untrusted extension and rejects path traversal in `rendererEntry`, so an
  untrusted renderer bundle never even reaches the loader.
- **Data-only fallback**: untrusted store extensions are consumed purely as data
  over the host router, which the app controls — the extension never contributes
  executable code.

## What you can and can't rely on

**You can rely on:**

- An **untrusted** extension cannot execute code in either plane. It is data-only.
- The trust gate is enforced main-side, not just in the renderer, so a
  compromised renderer cannot talk a trusted-only IPC into serving an untrusted
  bundle.
- A malformed `.kai` is rejected at install time.

**You cannot rely on:**

- Any isolation **between the app and a trusted extension**. Once trusted, the
  extension has app privileges. The trust gate is the *only* boundary.
- The manifest `permissions` list as a hard sandbox. Treat declared permissions
  as **intent/documentation**, not a guaranteed cage — verify enforcement for
  your threat model before depending on it.
- Store/curated review catching every malicious pattern. Read the source of
  anything you sideload.

## Guidance

**For users:**

- Sideload only extensions you trust. Prefer signed/curated extensions.
- Read the `README.md` and, ideally, the bundle source before installing.
- Uninstall extensions you no longer use — each trusted extension is attack
  surface.

**For extension authors:**

- Keep `permissions` minimal and honest.
- Namespace every renderer contribution with your extension id so
  `unregisterAll(extensionId)` cleans up fully on unload.
- Never exfiltrate user data. Scope network calls to the domains you declare.
- Don't try to defeat the trust gate or reach across into another extension's
  registrations.

## See also

- [renderer-loader.md](renderer-loader.md) — the renderer loader, the
  `ExtensionContext` API, and the in-realm-privilege warning in depth.
- [overview.md](overview.md) — the two execution planes and the trust model in
  the wider architecture.
- [migration.md](migration.md) — the trust boundary is unchanged in spirit by the
  overhaul; the same gate now also governs the renderer loader and `apiServer`.
