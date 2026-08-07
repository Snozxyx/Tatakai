---
name: marketplace-mapping-ui-fixes
overview: Implement a focused V6 batch to fix character/image search rendering bugs, strengthen magnet-to-anime mapping with robust fallback/manual flow, enforce username-based publish identity, add marketplace magnet/torrent metadata support with proper SQL migration, and align modal UI consistency with existing design language.
todos:
  - id: fix-character-rendering
    content: Patch character/image search normalization to prevent object rendering and ensure safe fallback text/image handling.
    status: completed
  - id: enforce-publish-username
    content: Finalize publish extension author source as username-first and ensure submit payload consistency.
    status: completed
  - id: upgrade-magnet-mapping
    content: Implement stronger release parsing, confidence scoring, and manual mapping fallback in magnet alignment flow.
    status: completed
  - id: extend-marketplace-model
    content: Add magnet/torrent/language/metadata fields to marketplace submit-display pipeline with backward-compatible normalization.
    status: completed
  - id: add-marketplace-sql-migration
    content: Create proper Supabase migration for marketplace schema/RLS/indexing and legacy backfill.
    status: completed
  - id: unify-modal-design
    content: Refactor targeted modals to consistent Dialog-based visual and interaction standards.
    status: completed
  - id: validate-end-to-end
    content: Run targeted sanity checks for UI flows, mapping behavior, and migration compatibility.
    status: completed
  - id: parser-fixture-regression-pack
    content: Build and run curated regression fixture pack from dev/name-parsing (rakun + atama) for mapping confidence.
    status: completed
  - id: phase0-security-carryover
    content: After immediate wave, close remaining Phase 0 desktop hardening and IPC boundary tasks before wider rollout.
    status: completed
isProject: false
---

# V6 Powerful Execution Plan: What Is Left + What We Implement Now

## What Is Left (from the four docs)
- **Phase 0 gaps still open:** desktop security hardening and strict IPC boundaries remain foundational blockers for broader runtime features.
- **Phase 1/2 incompletely closed:** full Content Graph coverage and resilient internal mapping confidence/fallback paths are still not fully completed.
- **Marketplace maturity gap:** current `marketplace_items` payload is too generic for robust magnet/torrent metadata workflows and moderation tooling.
- **UX consistency gap:** targeted modals are not fully aligned to the app’s standard dialog patterns.
- **Parser robustness gap:** current magnet alignment logic is weaker than the naming complexity represented in `dev/name-parsing` fixtures.

## Execution Strategy
- **Track A (Immediate wave, implement now):** user-facing fixes for character search, mapping quality, marketplace metadata + SQL, and consistent modal UX.
- **Track B (Critical backlog after Track A):** hardening and architecture milestones from Phase 0/1/2 to avoid regressions and unblock larger V6 phases.

## Track A: Immediate Implementation Wave

### A1) Character/Image Search Bug Fixes (`{object Object}`)
- Patch normalization and rendering in:
  - [E:/Code/TatakaiV5/src/core/content/character-client.ts](E:/Code/TatakaiV5/src/core/content/character-client.ts)
  - [E:/Code/TatakaiV5/src/hooks/user/useProfileFeatures.ts](E:/Code/TatakaiV5/src/hooks/user/useProfileFeatures.ts)
  - [E:/Code/TatakaiV5/src/components/profile/AvatarPicker.tsx](E:/Code/TatakaiV5/src/components/profile/AvatarPicker.tsx)
- Add strict safe extractors for nested values (`safeText`, `safeImageUrl`) and ensure no raw object can render.

### A2) Publish Extension Identity Uses Username
- Enforce username-first author derivation in:
  - [E:/Code/TatakaiV5/src/components/extensions/PublishExtensionModal.tsx](E:/Code/TatakaiV5/src/components/extensions/PublishExtensionModal.tsx)
- Keep UI read-only author field but guarantee submit payload uses account username source-of-truth.

### A3) Powerful Magnet Mapping and Manual Fallback
- Upgrade matching in:
  - [E:/Code/TatakaiV5/src/components/modals/MagnetAlignmentModal.tsx](E:/Code/TatakaiV5/src/components/modals/MagnetAlignmentModal.tsx)
  - [E:/Code/TatakaiV5/desktop/runtime/torrent/naming/release-parser.cjs](E:/Code/TatakaiV5/desktop/runtime/torrent/naming/release-parser.cjs)
  - [E:/Code/TatakaiV5/desktop/runtime/torrent/naming/episode-matcher.cjs](E:/Code/TatakaiV5/desktop/runtime/torrent/naming/episode-matcher.cjs)
- Implement confidence bands:
  - **High:** auto map.
  - **Medium:** require user confirmation.
  - **Low/ambiguous:** force manual anime selection + episode mapping.
- Add fallback UX when no match:
  - manual search, explicit anime pick, episode input, total-episodes check.

### A4) Use `dev/name-parsing` Fixtures as Ground Truth
- Seed parser regression coverage from:
  - [E:/Code/TatakaiV5/dev/name-parsing/rakun/tests/cases/all.js](E:/Code/TatakaiV5/dev/name-parsing/rakun/tests/cases/all.js)
  - [E:/Code/TatakaiV5/dev/name-parsing/atama/test/data/metadata-title.json](E:/Code/TatakaiV5/dev/name-parsing/atama/test/data/metadata-title.json)
- Define a curated must-pass pack (batch, `SxxExx`, decimal episodes, specials, remux/source tags, codec/language labels).

### A5) Marketplace Extension for Magnet/Torrent/Metadata
- Extend watch/marketplace pipeline in:
  - [E:/Code/TatakaiV5/src/components/ui/MarketplaceSubmitModal.tsx](E:/Code/TatakaiV5/src/components/ui/MarketplaceSubmitModal.tsx)
  - [E:/Code/TatakaiV5/src/components/ui/MarketplaceModal.tsx](E:/Code/TatakaiV5/src/components/ui/MarketplaceModal.tsx)
  - [E:/Code/TatakaiV5/src/pages/watch/WatchPage.tsx](E:/Code/TatakaiV5/src/pages/watch/WatchPage.tsx)
  - [E:/Code/TatakaiV5/src/lib/api/api-client.ts](E:/Code/TatakaiV5/src/lib/api/api-client.ts)
- Support typed fields:
  - `magnet_link`, `torrent_file_url`, `stream_url`, `external_url`
  - `language`, `quality`, `source`, `codec`, `audio`, `subtitleType`, `isBatch`, `episodeRange`, `releaseGroup`, `notes`
- Keep backward compatibility for legacy `data` JSON rows.

### A6) Proper SQL Migration (Requested)
- Add dedicated migration in [E:/Code/TatakaiV5/supabase/migrations](E:/Code/TatakaiV5/supabase/migrations) for `marketplace_items`:
  - schema extension for typed marketplace payloads
  - indexes on `anime_id`, `episode_number`, `type`, `status`, `created_at`, `language`
  - policy review/update for submitter/moderator/public approved reads
  - idempotent legacy backfill

### A7) Modal/UI Consistency
- Normalize target modal UX with shared dialog conventions:
  - [E:/Code/TatakaiV5/src/components/modals/MagnetAlignmentModal.tsx](E:/Code/TatakaiV5/src/components/modals/MagnetAlignmentModal.tsx)
  - [E:/Code/TatakaiV5/src/components/extensions/PublishExtensionModal.tsx](E:/Code/TatakaiV5/src/components/extensions/PublishExtensionModal.tsx)
  - [E:/Code/TatakaiV5/src/components/ui/MarketplaceSubmitModal.tsx](E:/Code/TatakaiV5/src/components/ui/MarketplaceSubmitModal.tsx)

## Track B: Remaining V6 Critical Backlog (after Track A)

### B1) Phase 0 Security Baseline Closure
- Close Electron hardening and IPC audit items in:
  - [E:/Code/TatakaiV5/desktop/main.cjs](E:/Code/TatakaiV5/desktop/main.cjs)
  - [E:/Code/TatakaiV5/desktop/preload.cjs](E:/Code/TatakaiV5/desktop/preload.cjs)
- Confirm no unsafe feature regressions before enabling broader local runtime features.

### B2) Phase 1/2 Reliability Closure
- Ensure Content Graph browsing surfaces and mapper confidence flows are complete and measurable.
- Keep mapper as ingestion pipeline, not runtime dependency, as documented in:
  - [E:/Code/TatakaiV5/docs/seanime-tatakai-anayls=is.md](E:/Code/TatakaiV5/docs/seanime-tatakai-anayls=is.md)

## Acceptance Criteria for This Implementation Batch
- Character search never displays object literals.
- Publish extension always uses username identity correctly.
- Magnet mapping handles complex real-world names with confidence + manual fallback.
- Marketplace supports magnet/torrent sharing with language and richer metadata.
- SQL migration exists, is idempotent, and keeps legacy rows functional.
- Target modals are visually and behaviorally consistent with app standards.

## Delivery Order
1. Character + publish identity fixes
2. Magnet parser + fallback UX + fixture integration
3. Marketplace frontend model updates
4. SQL migration + backward compatibility
5. Final modal consistency polish + verification
