# Tatakai Extension System

Tatakai's extension system turns most advanced app features into a **modular
ecosystem**. Extensions can add streaming/manga sources, whole isolated
read/watch verticals ("custom sources"), themes, analytics sinks, background
services, platform modules, and React UI (pages + slots). Multiple extensions
run at once.

This directory documents the whole ecosystem.

## Start here

- **[overview.md](overview.md)** — the two execution planes, the data-vs-code
  contribution boundary, and the trust model. **Read this first.**
- **[manifest-reference.md](manifest-reference.md)** — every `manifest.json`
  field, including `apiServer`, `capabilities`, `customSources`, `contributes`,
  and `priority`.
- **[build-your-first-extension.md](build-your-first-extension.md)** — a guided
  build using the `extension/aurora/` reference extension as the scaffold, and
  how `.kai` packaging works.

## Capabilities

| Doc | Capability | Plane |
| --- | --- | --- |
| [capabilities/sources.md](capabilities/sources.md) | Anime streaming sources | Node (data) |
| [capabilities/manga.md](capabilities/manga.md) | Manga chapters/pages | Node (data) |
| [capabilities/custom-source.md](capabilities/custom-source.md) | Isolated custom read/watch verticals (`custom-source-v1`) | Node (data) |
| [capabilities/themes.md](capabilities/themes.md) | Custom themes | Data or code |
| [capabilities/analytics.md](capabilities/analytics.md) | Injected analytics | Data or code |
| [capabilities/ui-slots-pages.md](capabilities/ui-slots-pages.md) | React pages + UI slots | Renderer (code) |
| [capabilities/services-modules.md](capabilities/services-modules.md) | Services + platform modules | Renderer (code) |

## Deep dives

- **[renderer-loader.md](renderer-loader.md)** — how code-driven contributions
  load into the app's React runtime, the `ExtensionContext` API, and the
  **security model** (renderer code runs with app privileges — trust-gated).
- **[security.md](security.md)** — the sideloading warning, the trust model, how
  the app defends against a malicious extension, and what you can and can't rely
  on. **Read before sideloading anything.**
- **[migration.md](migration.md)** — what changed for existing extensions:
  `priority` replacing the hardcoded leader ordering, and `preview`/`websiteIndex`
  now being capability-gated.

## Reference extension

- **`extension/aurora/`** — a complete example extension that exercises **every
  axis** in one small, self-contained package (custom watch source + theme +
  analytics + renderer page/slot/module/provider). Copy it as a scaffold for
  your own extension. Because it loads alongside the app's other bundled
  extensions, it also demonstrates that **multiple extensions run at once**.

## Roadmap

This system is roadmap item **§1 "Extension Overhaul"** in
[`docs/Plans.md`](../Plans.md).
