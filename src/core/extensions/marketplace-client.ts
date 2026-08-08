/**
 * marketplace-client.ts
 * Renderer-side HTTP client for the Tatakai Marketplace API.
 *
 * Base URL: ${import.meta.env.VITE_BACKEND_ORIGIN}/api/v3
 *
 * Requirements: 16.1, 16.2, 16.3
 */

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

const BASE_URL = `${import.meta.env.VITE_BACKEND_ORIGIN}/api/v3`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A marketplace extension entry returned by GET /api/v3/extensions/manifests.
 * Field names are camelCase; they are mapped from the snake_case API response.
 */
export interface MarketplaceExtension {
  /** Unique, URL-safe extension identifier (e.g. "nyaasearch"). */
  id: string;

  /** Human-readable display name. */
  name: string;

  /** Semantic version string (e.g. "1.2.0"). */
  version: string;

  /** Extension category: "torrent" | "onlinestream" | "custom". */
  type: string;

  /** Short description shown in the Extension Hub grid. */
  description: string | null;

  /** Declared permission strings. */
  permissions: string[];

  /** URL to the hosted .kai bundle. Mapped from `main` in the API response. */
  mainUrl: string;

  /** URL to the update manifest. Mapped from `update` in the API response. */
  updateUrl: string | null;

  /** Ed25519 signature of the extension bundle (curated extensions only). */
  signature: string | null;

  /** Identity of the signing authority (e.g. "tatakai-marketplace"). */
  signedBy: string | null;

  /** Relative speed rating for the extension (e.g. "fast", "slow"). */
  speed: string | null;

  /** Relative accuracy rating for the extension. */
  accuracy: string | null;

  /** ISO 3166-1 alpha-2 region codes where the extension is available. */
  regions: string[] | null;

  /** Whether the extension serves NSFW content. */
  nsfw: boolean;
}

/**
 * Optional filter parameters for `fetchMarketplaceExtensions`.
 */
export interface MarketplaceFilter {
  /** Filter by extension type (e.g. "torrent", "onlinestream", "custom"). */
  type?: string;
}

// ---------------------------------------------------------------------------
// Internal: raw API response shape from GET /api/v3/extensions/manifests
// ---------------------------------------------------------------------------

interface RawManifestEntry {
  id: string;
  name: string;
  version: string;
  type: string;
  main: string;
  update?: string | null;
  description?: string | null;
  speed?: string | null;
  accuracy?: string | null;
  regions?: string[] | null;
  nsfw?: boolean;
  permissions?: string[];
  signature?: string | null;
  signedBy?: string | null;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Mapping helper
// ---------------------------------------------------------------------------

function mapRawToMarketplaceExtension(raw: RawManifestEntry): MarketplaceExtension {
  return {
    id: raw.id,
    name: raw.name,
    version: raw.version,
    type: raw.type,
    description: raw.description ?? null,
    permissions: raw.permissions ?? [],
    mainUrl: raw.main,
    updateUrl: raw.update ?? null,
    signature: raw.signature ?? null,
    signedBy: raw.signedBy ?? null,
    speed: raw.speed ?? null,
    accuracy: raw.accuracy ?? null,
    regions: raw.regions ?? null,
    nsfw: raw.nsfw ?? false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches the list of approved marketplace extensions.
 *
 * When `filter.type` is provided it is passed as the `type` query parameter
 * so the server can return only extensions matching that type.
 *
 * Requirements: 16.1, 16.2
 */
export async function fetchMarketplaceExtensions(
  filter?: MarketplaceFilter,
): Promise<MarketplaceExtension[]> {
  const url = new URL(`${BASE_URL}/extensions/manifests`);

  if (filter?.type) {
    url.searchParams.set("type", filter.type);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `fetchMarketplaceExtensions: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const envelope: ApiEnvelope<RawManifestEntry[]> = await response.json();

  if (!envelope.success || !Array.isArray(envelope.data)) {
    throw new Error(
      `fetchMarketplaceExtensions: unexpected response shape — ${envelope.error ?? "unknown error"}`,
    );
  }

  return envelope.data.map(mapRawToMarketplaceExtension);
}

/**
 * Downloads a `.kai` extension bundle from the given URL and returns it as
 * an `ArrayBuffer` ready to be passed to `extension:load-kai`.
 *
 * Routes through the existing `/api/proxy/raw` backend endpoint to avoid
 * browser CORS restrictions on external CDNs (e.g. raw.githubusercontent.com).
 *
 * Requirements: 16.3
 */
export async function downloadExtensionKai(mainUrl: string): Promise<ArrayBuffer> {
  const isHttpUrl = /^https?:\/\//i.test(mainUrl);

  if (isHttpUrl) {
    try {
      const proxyUrl = `/api/proxy/raw?url=${encodeURIComponent(mainUrl)}`;
      const proxyResponse = await fetch(proxyUrl);
      if (proxyResponse.ok) {
        return await proxyResponse.arrayBuffer();
      }
    } catch {
      // Proxy request failed or unavailable, fallback to direct fetch below
    }
  }

  const response = await fetch(mainUrl);

  if (!response.ok) {
    throw new Error(
      `downloadExtensionKai: HTTP ${response.status} ${response.statusText} — ${mainUrl}`,
    );
  }

  return response.arrayBuffer();
}
