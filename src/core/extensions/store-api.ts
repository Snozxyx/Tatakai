/**
 * Client for the extension service (docs/Plans.md §3 — "Extension Service API").
 *
 * Six read-only endpoints under `VITE_EXTENSION_API_URL`, which is
 * `https://extension.tatakai.me/api` in production and a Supabase edge function
 * in staging. Nothing here sends credentials: every route is public, and
 * `/extension/:id` and `/download/...` deliberately have side effects on the
 * service (they bump `view_count` / `download_count`), which is why the detail
 * fetch is not retried on failure.
 *
 * The service speaks snake_case; the app speaks camelCase. The row types below
 * mirror the wire format exactly and `toStoreExtension` is the only place the
 * translation happens, so a field the service renames breaks in one file.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

/** A published build. `download_url` is the release asset itself. */
export interface StoreVersionRow {
  id: string;
  version: string;
  changelog?: string | null;
  is_stable?: boolean;
  asset_name?: string | null;
  size_bytes?: number | null;
  release_url?: string | null;
  download_url?: string | null;
  /** The service's own `/download/:extension/:version` redirect. */
  download_endpoint?: string | null;
  created_at?: string | null;
}

export interface StoreExtensionRow {
  id: string;
  /** The publisher's own id — `Toko`, not the service's uuid. */
  extension_id?: string | null;
  name: string;
  description?: string | null;
  author?: string | null;
  type?: string | null;
  status?: string | null;
  /** Storage-relative, e.g. `<owner>/<ext>/icon-<ts>.jpeg`. */
  icon_url?: string | null;
  banner_url?: string | null;
  categories?: string[] | null;
  capabilities?: string[] | null;
  permissions?: string[] | null;
  github_repo_url?: string | null;
  health_score?: number | null;
  is_featured?: boolean | null;
  view_count?: number | null;
  download_count?: number | null;
  install_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** Detail view only. */
  readme_text?: string | null;
  versions?: StoreVersionRow[] | null;
  latest_version?: StoreVersionRow | null;
  tags?: Array<StoreTagRow | string> | null;
  download_endpoint?: string | null;
}

export interface StoreTagRow {
  id?: string;
  name: string;
  slug?: string | null;
  count?: number | null;
}

interface StoreListEnvelope<T> {
  data?: T[] | null;
  count?: number;
  limit?: number;
  offset?: number;
}

export type StoreExtensionType = 'torrent' | 'onlinestream' | 'custom';

export interface StoreVersion {
  id: string;
  version: string;
  changelog: string;
  isStable: boolean;
  assetName?: string;
  sizeBytes?: number;
  releaseUrl?: string;
  /** Direct asset URL, preferred over the service's redirect. */
  downloadUrl?: string;
  /** The service's own redirect, as it reports it — no derivation needed. */
  downloadEndpoint?: string;
  publishedAt?: string;
}

/** The shape every store surface renders. */
export interface StoreExtension {
  /** Service uuid — what `/extension/:extension` and the routes key on. */
  id: string;
  /** Publisher id, used by the runtime's installed-extension bookkeeping. */
  slug: string;
  name: string;
  description: string;
  author: string;
  type: StoreExtensionType;
  status: string;
  /** Absolute, or undefined when the asset base is unset — never a bare path. */
  icon?: string;
  banner?: string;
  categories: string[];
  capabilities: string[];
  permissions: string[];
  tags: string[];
  githubRepoUrl?: string;
  /** 0–1 as served; the UI shows it as a percentage. */
  healthScore?: number;
  isFeatured: boolean;
  views: number;
  downloads: number;
  installs: number;
  createdAt?: string;
  updatedAt?: string;
  readme: string;
  versions: StoreVersion[];
  latestVersion?: StoreVersion;
  version: string;
  /** `download_endpoint` as sent by the detail route; absent on list rows. */
  downloadEndpoint?: string;
}

/** Trailing slashes break `${base}/extension` joins, so they come off once. */
function trimSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * `import.meta.env` is inlined at build time, so an unset variable is the empty
 * string rather than undefined — both mean "no service configured", and every
 * call short-circuits instead of fetching `/extension` off the app's own origin.
 */
export const EXTENSION_API_BASE = trimSlashes(String(import.meta.env.VITE_EXTENSION_API_URL ?? ''));

const ASSET_BASE = trimSlashes(String(import.meta.env.VITE_EXTENSION_ASSET_BASE ?? ''));

export const isExtensionStoreConfigured = Boolean(EXTENSION_API_BASE);

/**
 * Absolute URL for an `icon_url` / `banner_url`. The service now signs these
 * itself — the storage buckets are private, so what arrives is an absolute
 * `…/storage/v1/object/sign/extension-icons/…?token=…` URL with a finite TTL,
 * which the first branch passes straight through. The `ASSET_BASE` join below is
 * only for deployments that serve assets from a public bucket as relative paths;
 * with no base configured this returns undefined rather than a path the browser
 * would resolve against the app's own origin — a 404 `<img>` renders its alt text
 * as body copy, which is worse than the lettermark the cards fall back to.
 *
 * A signed URL that has expired 400s, which the surfaces treat the same as a
 * missing icon: `ExtensionIcon` layers the `<img>` over the lettermark and hides
 * it `onError`, and the banners in the hero card and detail header do the same
 * over their type gradient.
 */
export function resolveExtensionAsset(path?: string | null): string | undefined {
  const value = String(path ?? '').trim();
  if (!value) return undefined;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (!ASSET_BASE) return undefined;
  return `${ASSET_BASE}/${value.replace(/^\/+/, '')}`;
}

/**
 * `https://github.com/owner/repo` → the raw-content base for its default branch.
 * A readme refers to sibling files by relative path (`./icon.png`), and
 * raw.githubusercontent.com is the only place those resolve; `HEAD` avoids having
 * to guess between `main` and `master`. Returns undefined for anything that is not
 * a GitHub repo URL, which is what makes the renderer drop the image instead of
 * requesting it off the app's own origin.
 */
export function githubRawBase(repoUrl?: string | null): string | undefined {
  const match = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec(
    String(repoUrl ?? '').trim(),
  );
  if (!match) return undefined;
  return `https://raw.githubusercontent.com/${match[1]}/${match[2].replace(/\.git$/i, '')}/HEAD`;
}

/**
 * `/download/:extension/:version`. The redirect is mounted *under* the API base
 * (`<base>/download/...`), which is why this does not trim the `/api` segment:
 * the service's own `download_endpoint` for Toko is
 * `…/functions/v1/api/download/Toko/latest`, and the sibling `…/functions/v1/download/...`
 * 404s. Prefer `download_endpoint` when the service sends one; this is the
 * fallback for the list endpoint, which does not.
 */
export function extensionDownloadUrl(idOrSlug: string, version = 'latest'): string {
  return `${EXTENSION_API_BASE}/download/${encodeURIComponent(idOrSlug)}/${encodeURIComponent(version)}`;
}

/**
 * Where publishing happens. The app has no publish form of its own: the service
 * owns the review queue, the icon/banner uploads and the release wiring, so the
 * store's Publish button links out to this origin.
 */
export const EXTENSION_PORTAL_URL =
  trimSlashes(String(import.meta.env.VITE_EXTENSION_PORTAL_URL ?? '')) ||
  'https://extension.tatakai.me';

const TYPES: StoreExtensionType[] = ['torrent', 'onlinestream', 'custom'];

function normalizeType(value?: string | null): StoreExtensionType {
  const lowered = String(value ?? '').trim().toLowerCase();
  return (TYPES as string[]).includes(lowered) ? (lowered as StoreExtensionType) : 'custom';
}

function toVersion(row: StoreVersionRow): StoreVersion {
  return {
    id: row.id,
    version: String(row.version ?? '').trim() || '0.0.0',
    changelog: String(row.changelog ?? '').trim(),
    isStable: row.is_stable !== false,
    assetName: row.asset_name ?? undefined,
    sizeBytes: typeof row.size_bytes === 'number' ? row.size_bytes : undefined,
    releaseUrl: row.release_url ?? undefined,
    downloadUrl: row.download_url ?? undefined,
    downloadEndpoint: row.download_endpoint ?? undefined,
    publishedAt: row.created_at ?? undefined,
  };
}

function tagNames(tags?: Array<StoreTagRow | string> | null): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => (typeof tag === 'string' ? tag : String(tag?.name ?? '')))
    .map((name) => name.trim())
    .filter(Boolean);
}

export function toStoreExtension(row: StoreExtensionRow): StoreExtension {
  const versions = (Array.isArray(row.versions) ? row.versions : []).map(toVersion);
  const latest = row.latest_version ? toVersion(row.latest_version) : versions[0];

  return {
    id: row.id,
    slug: String(row.extension_id ?? row.id ?? '').trim() || row.id,
    name: String(row.name ?? '').trim() || 'Untitled extension',
    description: String(row.description ?? '').trim(),
    author: String(row.author ?? '').trim() || 'Unknown',
    type: normalizeType(row.type),
    status: String(row.status ?? '').trim() || 'approved',
    icon: resolveExtensionAsset(row.icon_url),
    banner: resolveExtensionAsset(row.banner_url),
    categories: Array.isArray(row.categories) ? row.categories.filter(Boolean) : [],
    capabilities: Array.isArray(row.capabilities) ? row.capabilities.filter(Boolean) : [],
    permissions: Array.isArray(row.permissions) ? row.permissions.filter(Boolean) : [],
    tags: tagNames(row.tags),
    githubRepoUrl: row.github_repo_url ?? undefined,
    healthScore: typeof row.health_score === 'number' ? row.health_score : undefined,
    isFeatured: Boolean(row.is_featured),
    views: Number(row.view_count ?? 0) || 0,
    downloads: Number(row.download_count ?? 0) || 0,
    installs: Number(row.install_count ?? 0) || 0,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    readme: String(row.readme_text ?? '').trim(),
    versions,
    latestVersion: latest,
    version: latest?.version ?? '0.0.0',
    downloadEndpoint: row.download_endpoint ?? undefined,
  };
}

/**
 * The `.kai` bundle to hand to the runtime, in descending order of how much the
 * service has told us: the release asset on the version, the redirect the service
 * reports for that version or extension, then a URL derived from the API base.
 * Only the detail route sends `download_endpoint`, so the derived form is what a
 * "Get" click on a list row actually uses.
 */
export function resolveInstallUrl(extension: StoreExtension, version?: StoreVersion): string {
  const target = version ?? extension.latestVersion;
  if (target?.downloadUrl) return target.downloadUrl;
  if (target?.downloadEndpoint) return target.downloadEndpoint;
  if (!version && extension.downloadEndpoint) return extension.downloadEndpoint;
  return extensionDownloadUrl(extension.slug || extension.id, target?.version ?? 'latest');
}

/** Carries the status so callers can branch on 404 without parsing a message. */
export class StoreHttpError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`Extension service responded ${status} for ${path}`);
    this.name = 'StoreHttpError';
    this.status = status;
  }
}

async function requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (!EXTENSION_API_BASE) {
    throw new Error('Extension service is not configured (VITE_EXTENSION_API_URL is empty)');
  }

  const url = `${EXTENSION_API_BASE}${path}`;
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url,
      headers: { accept: 'application/json' },
      connectTimeout: 7000,
      readTimeout: 7000,
      responseType: 'json',
    });
    if (response.status < 200 || response.status >= 300) {
      throw new StoreHttpError(response.status, path);
    }
    return response.data as T;
  }

  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new StoreHttpError(response.status, path);
  }

  return (await response.json()) as T;
}

/**
 * Every identifier one extension answers to, lowercased and deduplicated.
 *
 * An extension has three ids and they are not interchangeable: the service's
 * uuid (`id`), the publisher's own id (`slug`, the service's `extension_id`),
 * and the id inside the `.kai` manifest, which is what the desktop runtime
 * registers under. Only the uuid works on `/extension/:extension`, only the
 * manifest id appears in `runtime:health`, and the store's links and install
 * bookkeeping used `slug` for everything — so one extension could show up as
 * two rows, one of them permanently reading "Get".
 *
 * Anything comparing two extensions, or asking "is this one installed", has to
 * compare alias sets rather than a single field.
 */
export function extensionAliases(extension: Pick<StoreExtension, 'id' | 'slug'>): string[] {
  return Array.from(
    new Set(
      [extension.id, extension.slug]
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export interface StoreListParams {
  limit?: number;
  offset?: number;
  type?: StoreExtensionType | 'all';
}

export interface StoreListResult {
  items: StoreExtension[];
  /** Rows in this page, as reported by the service. */
  count: number;
  limit: number;
  offset: number;
}

function toListResult(
  envelope: StoreListEnvelope<StoreExtensionRow>,
  params: StoreListParams,
): StoreListResult {
  const rows = Array.isArray(envelope?.data) ? envelope.data : [];
  return {
    items: rows.map(toStoreExtension),
    count: Number(envelope?.count ?? rows.length) || rows.length,
    limit: Number(envelope?.limit ?? params.limit ?? rows.length) || rows.length,
    offset: Number(envelope?.offset ?? params.offset ?? 0) || 0,
  };
}

/** `GET /api/extension` — approved extensions only, as the service filters. */
export async function fetchStoreExtensions(
  params: StoreListParams = {},
  signal?: AbortSignal,
): Promise<StoreListResult> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  if (params.type && params.type !== 'all') query.set('type', params.type);

  const suffix = query.toString();
  const envelope = await requestJson<StoreListEnvelope<StoreExtensionRow>>(
    `/extension${suffix ? `?${suffix}` : ''}`,
    signal,
  );
  return toListResult(envelope, params);
}

/** `GET /api/extension/search/:search` — matches name, description or slug. */
export async function searchStoreExtensions(
  search: string,
  signal?: AbortSignal,
): Promise<StoreListResult> {
  const needle = search.trim();
  if (!needle) return { items: [], count: 0, limit: 0, offset: 0 };

  const envelope = await requestJson<StoreListEnvelope<StoreExtensionRow>>(
    `/extension/search/${encodeURIComponent(needle)}`,
    signal,
  );
  return toListResult(envelope, {});
}

/** `GET /api/extension/tags` */
export async function fetchStoreTags(signal?: AbortSignal): Promise<StoreTagRow[]> {
  const envelope = await requestJson<StoreListEnvelope<StoreTagRow | string>>(
    '/extension/tags',
    signal,
  );
  const rows = Array.isArray(envelope?.data) ? envelope.data : [];
  return rows
    .map((row) => (typeof row === 'string' ? { name: row } : row))
    .filter((row) => Boolean(row?.name));
}

/** `GET /api/extension/tags/:tag` — accepts a tag id or name. */
export async function fetchStoreExtensionsByTag(
  tag: string,
  signal?: AbortSignal,
): Promise<StoreListResult> {
  const needle = tag.trim();
  if (!needle) return { items: [], count: 0, limit: 0, offset: 0 };

  const envelope = await requestJson<StoreListEnvelope<StoreExtensionRow>>(
    `/extension/tags/${encodeURIComponent(needle)}`,
    signal,
  );
  return toListResult(envelope, {});
}

/**
 * `GET /api/extension/:extension` — the full record, including `readme_text`,
 * every version's changelog and the tag list. Increments `view_count` on the
 * service, so callers should not retry it or poll it.
 *
 * The route keys on the service's uuid. The store links by `slug`, so a
 * publisher id that is not also the uuid 404s here — which is what put the
 * detail page on the local sideloaded copy (zeroed counts, no readme) instead
 * of the published record. A 404 therefore falls back to the search route,
 * which does match on slug, rather than surfacing as an error.
 */
export async function fetchStoreExtension(
  idOrSlug: string,
  signal?: AbortSignal,
): Promise<StoreExtension | null> {
  const needle = idOrSlug.trim();
  if (!needle) return null;

  try {
    const envelope = await requestJson<{ data?: StoreExtensionRow | null }>(
      `/extension/${encodeURIComponent(needle)}`,
      signal,
    );
    if (envelope?.data) return toStoreExtension(envelope.data);
  } catch (error) {
    if (!(error instanceof StoreHttpError) || error.status !== 404) throw error;
  }

  // Search matches slug, so this resolves the publisher id the links carry.
  const lowered = needle.toLowerCase();
  const { items } = await searchStoreExtensions(needle, signal);
  const match = items.find((item) => extensionAliases(item).includes(lowered));
  if (!match) return null;

  // Search rows carry no readme or version list; re-read by uuid for the full
  // record, but only when that is actually a different key than the one that
  // just 404'd.
  if (match.id.toLowerCase() !== lowered) {
    try {
      const envelope = await requestJson<{ data?: StoreExtensionRow | null }>(
        `/extension/${encodeURIComponent(match.id)}`,
        signal,
      );
      if (envelope?.data) return toStoreExtension(envelope.data);
    } catch (error) {
      if (!(error instanceof StoreHttpError) || error.status !== 404) throw error;
    }
  }

  return match;
}
