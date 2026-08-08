/**
 * src/core/extensions/sdk/index.ts
 * Public API of the Tatakai Extension SDK.
 *
 * Extension authors import from this barrel. Tatakai application code that
 * needs extension types also imports from here.
 *
 * Requirements: 8.6 — The SDK must not import any Tatakai application code
 * outside of src/core/extensions/.
 */

// ── AbstractSource base class ─────────────────────────────────────────────────
export { AbstractSource } from './abstract-source';

// ── Core interfaces ───────────────────────────────────────────────────────────
export type {
  SourceOptions,
  SourceResult,
  SubtitleTrack,
  LanguageCapability,
  ExtensionManifest,
  VersionEntry,
  ExtensionInvokeResult,
} from './types';
