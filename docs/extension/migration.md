# Migration Notes

What changed in the Extension Overhaul, and what existing extensions need to do.
Existing sources keep working; the changes below are about **generalization** —
nothing is hardcoded to a single named extension anymore. Any extension
participates purely by what it **declares** in its manifest.

## 1. Ordering is now `priority`, not a hardcoded leader

**Before:** the runtime special-cased one bundled source extension to lead
ordering (a hardcoded splice that always put it first).

**Now:** extensions are ordered by **`manifest.priority`** — a number,
**ascending**, default `100` (lower wins). The former behavior is reproduced by
**data, not code**: an extension that should lead simply ships `priority: 0`.

**Action for authors:** set `priority` if ordering matters to you. Omit it to get
the default `100`.

## 2. `preview` / `websiteIndex` are capability-gated

**Before:** `getPreviewSource` and `getWebsiteEpisodeIndex` were looked up on one
hardcoded extension id.

**Now:** the runtime uses a generic `listCapabilityEntries(cap)` and consults
**every** extension declaring the relevant capability, in `priority` order,
taking the first non-null result:

- `getPreviewSource` → extensions whose `capabilities` include `preview`.
- `getWebsiteEpisodeIndex` → extensions whose `capabilities` include `websiteIndex`.

If no capable extension is installed, the error is `no_capable_extension`.

**Action for authors:** if your extension provided preview/website functionality
by being the special-cased one, it must now **declare the capability**
(`"preview"` and/or `"websiteIndex"`) in `capabilities[]`.

## 3. New optional manifest fields

None are required; all are validated only if present
([manifest-reference.md](manifest-reference.md)):

| Field | Purpose |
| --- | --- |
| `apiServer` | HTTP contract; namespace mounted only if trusted |
| `customSources[]` | Isolated read/watch verticals (required when `capabilities` includes `custom-source`) |
| `contributes.rendererEntry` | Code-driven renderer bundle (trusted only) |
| `contributes.themes` | Data-driven themes |
| `contributes.analytics` | Data-driven analytics sinks |
| `priority` | Ordering (see above) |
| `capabilities[]` | Explicit capability declarations |

Manifest validation retains the required package fields. Existing packages and cached bundles remain usable; signing metadata is ignored. Local installation records migrate to neutral keys without changing enabled state. The old install-manifest bridge alias remains available for one release.

## 4. Ecosystem adapters

Stremio uses hosted manifests and HTTP resources. Seanime JS/TS providers compile into the existing worker/mobile bundle format. Preferences and title matches are local and retained across updates. See [ecosystems.md](ecosystems.md).

## 5. Nothing touches the watchlist/readlist

Custom sources are a **new, isolated** vertical. They never integrate with the
anime watchlist or manga readlist. If you're porting a source, keep its state
under the `['custom', …]` query keys and scoped storage — do not call media-list
mutations. See [custom-source.md](capabilities/custom-source.md).

## See also

- [`docs/Plans.md`](../Plans.md) §1 "Extension Overhaul" — the roadmap item this
  work implements.
- [overview.md](overview.md) — the full architecture and trust model.
- [security.md](security.md) — the security model and execution privileges.
