/**
 * Custom-source bridge (renderer side).
 *
 * A custom source is an isolated read/watch vertical an extension ships — its
 * own home/info/watch/read UI, addressed by `(namespace, sourceId)` and NEVER
 * tied to the anime/manga watchlist or readlist. This module mirrors
 * `manga-extension-runtime.ts`: primary transport is the in-app extension-API
 * host over HTTP (works for ANY sideloaded extension whose manifest declares
 * `customSources[]`), with IPC (`invokeExtension`) as the fallback for the
 * early-launch race where the host has not come up yet.
 *
 * Bundle methods (contract `custom-source-v1`):
 *   customHome(sourceId)                    → { sections }
 *   customSearch(sourceId, query, page?)    → { results, hasNextPage? }
 *   customInfo(sourceId, id)                → { id, title, …, entries }
 *   customWatch(sourceId, id, episodeId)    → { sources }   (kind=watch)
 *   customRead(sourceId, id, chapterId)     → { pages }     (kind=read)
 */

import {
  resolveExtensionApiBase,
  type NamespaceInfo,
} from "@/hooks/media/useExtensionSourceStream";
import type {
  CustomSourceDescriptor,
  CustomHomeSection,
  CustomMediaCard,
  CustomInfoResult,
  SourceResult,
} from "@/core/extensions/sdk/types";

// ── runtime shims ────────────────────────────────────────────────────────────

type InstalledExtensionRow = {
  id: string;
  name?: string;
  capabilities?: string[];
  apiServer?: { namespace?: string } | null;
  customSources?: CustomSourceDescriptor[];
};

type ElectronRuntime = {
  electron?: {
    invokeExtension?: (extensionId: string, method: string, args: unknown) => Promise<unknown>;
    listInstalledExtensions?: () => Promise<InstalledExtensionRow[]>;
  };
  tatakaiRuntime?: {
    invokeExtension?: (extensionId: string, method: string, args: unknown) => Promise<unknown>;
  };
};

function getRuntime(): ElectronRuntime {
  return (typeof window !== "undefined" ? window : {}) as ElectronRuntime;
}

function hasExtensionRuntime(): boolean {
  const w = getRuntime();
  return Boolean(w.electron?.invokeExtension || w.tatakaiRuntime?.invokeExtension);
}

/** Invoke a bundle method on a specific extension. Returns the unwrapped result. */
async function invokeExt(extensionId: string, method: string, args: unknown[]): Promise<unknown> {
  const w = getRuntime();
  const fn = w.electron?.invokeExtension || w.tatakaiRuntime?.invokeExtension;
  if (!fn) throw new Error("Extension runtime unavailable");
  // The generic `extension:invoke` fallthrough wraps returns as
  // `{ success, result }`; unwrap so callers see the bundle's own shape.
  const raw = (await fn(extensionId, method, args)) as
    | { success?: boolean; result?: unknown; error?: string }
    | unknown;
  if (raw && typeof raw === "object" && "success" in (raw as object)) {
    const r = raw as { success?: boolean; result?: unknown; error?: string };
    if (r.success === false) throw new Error(r.error || `${method} failed`);
    return r.result ?? null;
  }
  return raw;
}

async function httpGetJson(url: string, timeoutMs = 20_000): Promise<any | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── discovery ──────────────────────────────────────────────────────────────

/** A custom source with its owning namespace + extension id resolved. */
export interface CustomSourceEntry extends CustomSourceDescriptor {
  namespace: string;
  extensionId?: string;
}

/** Namespaces whose manifest advertises custom sources (capability or descriptor). */
function customNamespaces(namespaces: NamespaceInfo[]): NamespaceInfo[] {
  return namespaces.filter((ns) => {
    const caps = ns.capabilities || [];
    const sources = ns.customSources || [];
    return caps.includes("custom-source") || sources.length > 0;
  });
}

/**
 * List every custom source across every installed extension.
 *
 * HTTP host first (its `listNamespaces()` surfaces `customSources` per
 * namespace); IPC `listInstalledExtensions` as the fallback. Powers the sidebar
 * "+" menu and the custom-source routes.
 */
export async function listAllCustomSources(): Promise<CustomSourceEntry[]> {
  const out: CustomSourceEntry[] = [];
  const seen = new Set<string>();

  const push = (namespace: string, extensionId: string | undefined, src: CustomSourceDescriptor) => {
    if (!src || !src.id || !src.name) return;
    const key = `${namespace}::${src.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...src, namespace, extensionId });
  };

  // Primary: the extension-API host namespaces.
  try {
    const base = await resolveExtensionApiBase();
    for (const ns of customNamespaces(base.namespaces || [])) {
      for (const src of ns.customSources || []) push(ns.namespace, ns.extensionId, src);
    }
  } catch {
    /* fall through to IPC */
  }

  // Fallback: IPC-listed extensions (covers the host-not-up race).
  const w = getRuntime();
  if (w.electron?.listInstalledExtensions) {
    try {
      const rows = await w.electron.listInstalledExtensions();
      for (const row of rows || []) {
        const namespace = row.apiServer?.namespace;
        if (!namespace) continue;
        for (const src of row.customSources || []) push(namespace, row.id, src);
      }
    } catch {
      /* ignore */
    }
  }

  return out;
}

/** Resolve the owning extension id for a namespace (IPC fallback targeting). */
async function resolveExtensionId(namespace: string): Promise<string | null> {
  const w = getRuntime();
  if (!w.electron?.listInstalledExtensions) return null;
  try {
    const rows = await w.electron.listInstalledExtensions();
    const match = (rows || []).find((r) => r.apiServer?.namespace === namespace);
    return match?.id ?? null;
  } catch {
    return null;
  }
}

// ── HTTP env ─────────────────────────────────────────────────────────────────

interface CustomHttpEnv {
  baseUrl: string;
}

async function resolveCustomHttpEnv(): Promise<CustomHttpEnv | null> {
  try {
    const base = await resolveExtensionApiBase();
    if (!base.baseUrl) return null;
    return { baseUrl: base.baseUrl };
  } catch {
    return null;
  }
}

function customUrl(baseUrl: string, namespace: string, route: string, params: Record<string, string | number | undefined>): string {
  const u = new URL(`${baseUrl}/api/v3/${namespace}/custom/${route}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  }
  return u.toString();
}

// ── content result shapes ──────────────────────────────────────────────────

export interface CustomHomeData {
  sections: CustomHomeSection[];
}
export interface CustomSearchData {
  results: CustomMediaCard[];
  hasNextPage: boolean;
}
export type CustomInfoData = CustomInfoResult;
export interface CustomWatchData {
  sources: SourceResult[];
}
export interface CustomReadPage {
  pageNumber: number;
  imageUrl: string;
  proxiedImageUrl?: string | null;
}
export interface CustomReadData {
  pages: CustomReadPage[];
}

// ── fetchers (HTTP primary, IPC fallback) ────────────────────────────────────

export async function fetchCustomHome(namespace: string, sourceId: string): Promise<CustomHomeData> {
  const env = await resolveCustomHttpEnv();
  if (env) {
    const body = await httpGetJson(customUrl(env.baseUrl, namespace, "home", { sourceId }));
    if (body && Array.isArray(body.sections)) return { sections: body.sections };
  }
  if (hasExtensionRuntime()) {
    const extId = await resolveExtensionId(namespace);
    if (extId) {
      const r = (await invokeExt(extId, "customHome", [sourceId])) as { sections?: CustomHomeSection[] } | null;
      if (r && Array.isArray(r.sections)) return { sections: r.sections };
    }
  }
  return { sections: [] };
}

export async function fetchCustomSearch(
  namespace: string,
  sourceId: string,
  query: string,
  page = 1,
): Promise<CustomSearchData> {
  const env = await resolveCustomHttpEnv();
  if (env) {
    const body = await httpGetJson(customUrl(env.baseUrl, namespace, "search", { sourceId, q: query, page }));
    if (body && Array.isArray(body.results)) return { results: body.results, hasNextPage: !!body.hasNextPage };
  }
  if (hasExtensionRuntime()) {
    const extId = await resolveExtensionId(namespace);
    if (extId) {
      const r = (await invokeExt(extId, "customSearch", [sourceId, query, page])) as
        | { results?: CustomMediaCard[]; hasNextPage?: boolean }
        | null;
      if (r && Array.isArray(r.results)) return { results: r.results, hasNextPage: !!r.hasNextPage };
    }
  }
  return { results: [], hasNextPage: false };
}

export async function fetchCustomInfo(namespace: string, sourceId: string, id: string): Promise<CustomInfoData | null> {
  const env = await resolveCustomHttpEnv();
  if (env) {
    const body = await httpGetJson(customUrl(env.baseUrl, namespace, "info", { sourceId, id }));
    if (body && body.id && Array.isArray(body.entries)) {
      return {
        id: body.id,
        title: body.title || "",
        image: body.image ?? undefined,
        description: body.description ?? undefined,
        meta: body.meta || {},
        entries: body.entries,
      };
    }
  }
  if (hasExtensionRuntime()) {
    const extId = await resolveExtensionId(namespace);
    if (extId) {
      const r = (await invokeExt(extId, "customInfo", [sourceId, id])) as CustomInfoResult | null;
      if (r && r.id && Array.isArray(r.entries)) return r;
    }
  }
  return null;
}

export async function fetchCustomWatch(
  namespace: string,
  sourceId: string,
  id: string,
  episodeId: string,
): Promise<CustomWatchData> {
  const env = await resolveCustomHttpEnv();
  if (env) {
    const body = await httpGetJson(customUrl(env.baseUrl, namespace, "watch", { sourceId, id, episodeId }));
    if (body && Array.isArray(body.sources)) return { sources: body.sources };
  }
  if (hasExtensionRuntime()) {
    const extId = await resolveExtensionId(namespace);
    if (extId) {
      const r = (await invokeExt(extId, "customWatch", [sourceId, id, episodeId])) as
        | { sources?: SourceResult[] }
        | null;
      if (r && Array.isArray(r.sources)) return { sources: r.sources };
    }
  }
  return { sources: [] };
}

export async function fetchCustomRead(
  namespace: string,
  sourceId: string,
  id: string,
  chapterId: string,
): Promise<CustomReadData> {
  const env = await resolveCustomHttpEnv();
  if (env) {
    const body = await httpGetJson(customUrl(env.baseUrl, namespace, "read", { sourceId, id, chapterId }));
    if (body && Array.isArray(body.pages)) return { pages: normalizeReadPages(body.pages) };
  }
  if (hasExtensionRuntime()) {
    const extId = await resolveExtensionId(namespace);
    if (extId) {
      const r = (await invokeExt(extId, "customRead", [sourceId, id, chapterId])) as
        | { pages?: Array<{ pageNumber?: number; imageUrl?: string; proxiedImageUrl?: string | null }> }
        | null;
      if (r && Array.isArray(r.pages)) return { pages: normalizeReadPages(r.pages) };
    }
  }
  return { pages: [] };
}

function normalizeReadPages(
  raw: Array<{ pageNumber?: number; imageUrl?: string; proxiedImageUrl?: string | null }>,
): CustomReadPage[] {
  return raw
    .map((p, idx) => ({
      pageNumber: Number.isFinite(p.pageNumber) ? (p.pageNumber as number) : idx + 1,
      imageUrl: String(p.imageUrl || ""),
      proxiedImageUrl: p.proxiedImageUrl ?? null,
    }))
    .filter((p) => p.imageUrl);
}
