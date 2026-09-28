/**
 * Query and install hooks for the extension store (docs/Plans.md §3).
 *
 * The store renders two sources as one catalogue: the extension service, and
 * whatever the user has sideloaded on this machine. Rather than teach the UI about
 * both shapes, everything is projected onto `StoreExtension` here — the service's
 * shape, since it is the richer of the two — and the pages only ever see that.
 *
 * There is deliberately no third source. A curated array of "official" extensions
 * used to be merged in ahead of the service's rows, which meant the one extension
 * published to the service was displayed from the hardcoded copy instead: a frozen
 * description, no versions, no readme, no counts, and an install URL pinned to a
 * branch tip. The service is the only place any of that is current.
 *
 * Install state lives in `localStorage` because it is a property of *this*
 * install of the desktop app, not of the account: the same user on two machines
 * has two different sets of loaded extensions. The keys are the ones the runtime
 * and `useExtensions` already read, so nothing here is a second source of truth.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { downloadExtensionKai } from '@/core/extensions/marketplace-client';
import {
  extensionAliases,
  fetchStoreExtension,
  fetchStoreExtensions,
  fetchStoreTags,
  isExtensionStoreConfigured,
  resolveInstallUrl,
  searchStoreExtensions,
  type StoreExtension,
  type StoreExtensionType,
  type StoreVersion,
} from '@/core/extensions/store-api';
import type { ExtensionManifest } from '@/pages/base/ExtensionHubPage';

const INSTALLED_KEY = 'tatakai_installed_extensions';
const SIDELOADED_KEY = 'tatakai_sideloaded_extensions';

/**
 * Alias groups: `[[serviceUuid, publisherId, manifestId], ...]`, lowercased.
 *
 * One extension has three ids (see `extensionAliases`), and only the install
 * flow ever sees all three at once — the runtime reports the `.kai` manifest id,
 * which nothing in the service payload contains. Persisting the grouping is what
 * lets the catalogue collapse the sideloaded copy into the published row on the
 * next load, instead of rendering the same extension twice with one of the two
 * rows stuck on "Get".
 */
const ALIASES_KEY = 'tatakai_extension_aliases';

/** Fired by the sideload modal and by `install` below; `useExtensions` listens. */
const SIDELOAD_EVENT = 'tatakai:extension-sideloaded';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode — install still succeeded in the runtime */
  }
}

/**
 * A sideloaded manifest as a store row. The counts the service tracks do not
 * exist locally, so they stay at zero rather than being invented; `downloads` is
 * the one figure a manifest does carry.
 */
export function manifestToStoreExtension(manifest: ExtensionManifest): StoreExtension {
  const version = manifest.version || '1.0.0';
  return {
    id: manifest.id,
    slug: manifest.id,
    name: manifest.name,
    description: manifest.description ?? '',
    author: manifest.author || 'Unknown',
    type: (manifest.type ?? 'custom') as StoreExtensionType,
    status: manifest.status ?? (manifest.isApproved ? 'approved' : 'pending'),
    icon: manifest.icon,
    banner: manifest.banner,
    categories: manifest.categories ?? [],
    capabilities: [],
    permissions: manifest.permissions ?? [],
    tags: [],
    githubRepoUrl: undefined,
    healthScore: undefined,
    isFeatured: Boolean(manifest.categories?.includes('official')),
    views: 0,
    downloads: manifest.downloads ?? 0,
    installs: 0,
    updatedAt: manifest.updatedAt,
    readme: '',
    versions: [],
    latestVersion: undefined,
    version,
  };
}

/** The inverse, for the sideload list the runtime and `useExtensions` read. */
function storeToManifest(extension: StoreExtension): ExtensionManifest {
  return {
    id: extension.slug || extension.id,
    name: extension.name,
    description: extension.description,
    version: extension.version,
    author: extension.author,
    icon: extension.icon,
    banner: extension.banner,
    categories: extension.categories,
    permissions: extension.permissions,
    isApproved: extension.status === 'approved',
    downloads: extension.downloads,
    updatedAt: extension.updatedAt,
    type: extension.type,
    status: extension.status as ExtensionManifest['status'],
  };
}

function localExtensions(): StoreExtension[] {
  const sideloaded = readJson<ExtensionManifest[]>(SIDELOADED_KEY, []);
  const byId = new Map<string, StoreExtension>();
  sideloaded.forEach((item) => {
    if (item?.id) byId.set(item.id, manifestToStoreExtension(item));
  });
  return Array.from(byId.values());
}

/** Persisted alias groups, normalised and with empties dropped. */
function readAliasGroups(): string[][] {
  return readJson<string[][]>(ALIASES_KEY, [])
    .filter(Array.isArray)
    .map((group) =>
      Array.from(
        new Set(group.map((id) => String(id ?? '').trim().toLowerCase()).filter(Boolean)),
      ),
    )
    .filter((group) => group.length > 1);
}

/**
 * Record that these ids name the same extension, folding the new ids into any
 * group they already overlap rather than appending a competing one.
 */
function rememberAliases(ids: string[]): string[] {
  const incoming = Array.from(
    new Set(ids.map((id) => String(id ?? '').trim().toLowerCase()).filter(Boolean)),
  );
  if (incoming.length < 2) return incoming;

  const groups = readAliasGroups();
  const merged = new Set(incoming);
  const rest: string[][] = [];

  groups.forEach((group) => {
    if (group.some((id) => merged.has(id))) group.forEach((id) => merged.add(id));
    else rest.push(group);
  });

  writeJson(ALIASES_KEY, [...rest, Array.from(merged)]);
  return Array.from(merged);
}

/** Drop every group that mentions any of `ids` — used when uninstalling. */
function forgetAliases(ids: string[]) {
  const lowered = new Set(ids.map((id) => String(id ?? '').trim().toLowerCase()).filter(Boolean));
  writeJson(
    ALIASES_KEY,
    readAliasGroups().filter((group) => !group.some((id) => lowered.has(id))),
  );
}

/**
 * Resolves any of an extension's ids to one stable key, so the same extension
 * reaching the store from two sources collapses to a single row.
 */
function makeAliasResolver() {
  const canonical = new Map<string, string>();
  readAliasGroups().forEach((group) => {
    const [head] = group;
    group.forEach((id) => canonical.set(id, head));
  });

  return (extension: StoreExtension): string => {
    const aliases = extensionAliases(extension);
    for (const alias of aliases) {
      const known = canonical.get(alias);
      if (known) return known;
    }
    // Unknown extension: adopt its first alias as the key, and register the rest
    // so its other ids land on the same row within this pass.
    const [head] = aliases;
    aliases.forEach((alias) => canonical.set(alias, head));
    return head;
  };
}

export interface StoreCatalogueOptions {
  /** Free text; routed to `/extension/search/:search` when non-empty. */
  search?: string;
  type?: StoreExtensionType | 'all';
  limit?: number;
}

export interface StoreCatalogue {
  items: StoreExtension[];
  featured: StoreExtension[];
  isLoading: boolean;
  isFetching: boolean;
  /** The service failed or is unconfigured — the list is local-only. */
  serviceError: Error | null;
  isServiceConfigured: boolean;
}

/**
 * The store's main list. Sideloaded extensions go in first and the service's rows
 * overwrite them: an extension that is both published and sideloaded is one entry,
 * and the service's copy wins because it is the one carrying counts, tags,
 * versions and a readme.
 *
 * The key is the alias group rather than the slug. Installing writes the `.kai`
 * manifest id into the sideload list, which is frequently neither the service
 * uuid nor the publisher id, so a slug-keyed merge left the local copy and the
 * published row side by side — the duplicate the store was rendering.
 */
export function useStoreCatalogue({
  search = '',
  type = 'all',
  limit = 48,
}: StoreCatalogueOptions = {}): StoreCatalogue {
  const needle = search.trim();

  const query = useQuery({
    queryKey: ['extension-store', 'catalogue', needle, type, limit],
    queryFn: ({ signal }) =>
      needle
        ? searchStoreExtensions(needle, signal)
        : fetchStoreExtensions({ type, limit }, signal),
    enabled: isExtensionStoreConfigured,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const items = useMemo(() => {
    const merged = new Map<string, StoreExtension>();
    const keyFor = makeAliasResolver();

    localExtensions().forEach((item) => merged.set(keyFor(item), item));
    (query.data?.items ?? []).forEach((item) => merged.set(keyFor(item), item));

    let list = Array.from(merged.values());

    if (type !== 'all') list = list.filter((item) => item.type === type);
    if (needle) {
      const lowered = needle.toLowerCase();
      list = list.filter((item) =>
        `${item.name} ${item.description} ${item.author} ${item.categories.join(' ')} ${item.tags.join(' ')}`
          .toLowerCase()
          .includes(lowered),
      );
    }

    // Featured first, then the most-installed — the store's own ordering.
    return list.sort((left, right) => {
      if (left.isFeatured !== right.isFeatured) return left.isFeatured ? -1 : 1;
      return right.installs + right.downloads - (left.installs + left.downloads);
    });
  }, [query.data, needle, type]);

  const featured = useMemo(
    () => items.filter((item) => item.isFeatured || item.categories.includes('official')),
    [items],
  );

  return {
    items,
    featured: featured.length > 0 ? featured : items.slice(0, 3),
    isLoading: query.isLoading && isExtensionStoreConfigured,
    isFetching: query.isFetching,
    serviceError: (query.error as Error) ?? null,
    isServiceConfigured: isExtensionStoreConfigured,
  };
}

/** `GET /api/extension/tags`, for the store's tag rail. */
export function useStoreTags() {
  return useQuery({
    queryKey: ['extension-store', 'tags'],
    queryFn: ({ signal }) => fetchStoreTags(signal),
    enabled: isExtensionStoreConfigured,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * One extension's full record. The service bumps `view_count` on every hit, so
 * this never retries and never refetches on focus — a detail page left open
 * should not inflate the number it is displaying.
 */
export function useStoreExtensionDetail(idOrSlug?: string) {
  const query = useQuery({
    queryKey: ['extension-store', 'detail', idOrSlug],
    queryFn: ({ signal }) => fetchStoreExtension(idOrSlug!, signal),
    enabled: Boolean(idOrSlug) && isExtensionStoreConfigured,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  /** A sideloaded bundle is not in the service at all. */
  const local = useMemo(() => {
    if (!idOrSlug) return undefined;
    const lowered = idOrSlug.trim().toLowerCase();
    // The route carries the slug, the sideload list is keyed by the manifest id,
    // so the alias group is what connects the two.
    const group = readAliasGroups().find((ids) => ids.includes(lowered)) ?? [lowered];
    return localExtensions().find((item) =>
      extensionAliases(item).some((alias) => group.includes(alias)),
    );
  }, [idOrSlug]);

  return {
    extension: query.data ?? local ?? null,
    /** True while the service is the only place the id could resolve. */
    isLoading: query.isLoading && !local,
    error: local ? null : ((query.error as Error) ?? null),
    isFromService: Boolean(query.data),
  };
}

export type InstallState = 'idle' | 'installing' | 'installed' | 'not_loaded';

/**
 * Install / uninstall, shared by the store grid and the detail page so both
 * report the same state for the same extension.
 *
 * The runtime load is best-effort by design: the download and the bookkeeping
 * succeed in a browser, and `not_loaded` is the honest outcome there — the
 * bundle is on disk but no sandbox picked it up. That is why the health poll
 * ends in a distinct state rather than in a failure.
 */
export function useExtensionInstaller() {
  const queryClient = useQueryClient();
  const [installedIds, setInstalledIds] = useState<string[]>(() =>
    readJson<string[]>(INSTALLED_KEY, []),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notLoadedIds, setNotLoadedIds] = useState<string[]>([]);
  /** Bumped after every install/uninstall so the alias groups are re-read. */
  const [aliasEpoch, setAliasEpoch] = useState(0);

  useEffect(() => {
    const sync = () => {
      setInstalledIds(readJson<string[]>(INSTALLED_KEY, []));
      setAliasEpoch((value) => value + 1);
    };
    window.addEventListener('storage', sync);
    window.addEventListener(SIDELOAD_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(SIDELOAD_EVENT, sync);
    };
  }, []);

  /**
   * Every id this extension is known by, including the ones only the install
   * flow ever saw. Without the persisted group, the service row (uuid + slug)
   * and the installed id (the `.kai` manifest id) never intersect, which is why
   * a freshly installed extension kept reading "Get".
   */
  const aliasesOf = useCallback(
    (extension: Pick<StoreExtension, 'id' | 'slug'>): string[] => {
      void aliasEpoch;
      const own = extensionAliases(extension);
      const expanded = new Set(own);
      readAliasGroups().forEach((group) => {
        if (group.some((id) => expanded.has(id))) group.forEach((id) => expanded.add(id));
      });
      return Array.from(expanded);
    },
    [aliasEpoch],
  );

  const isInstalled = useCallback(
    (extension: Pick<StoreExtension, 'id' | 'slug'>) => {
      const aliases = aliasesOf(extension);
      return installedIds.some((id) => aliases.includes(String(id ?? '').toLowerCase()));
    },
    [aliasesOf, installedIds],
  );

  const stateFor = useCallback(
    (extension: Pick<StoreExtension, 'id' | 'slug'>): InstallState => {
      const aliases = aliasesOf(extension);
      if (pendingId && aliases.includes(pendingId.toLowerCase())) return 'installing';
      if (notLoadedIds.some((id) => aliases.includes(String(id ?? '').toLowerCase()))) {
        return 'not_loaded';
      }
      return isInstalled(extension) ? 'installed' : 'idle';
    },
    [aliasesOf, isInstalled, notLoadedIds, pendingId],
  );

  /**
   * Waits for the sandbox to report the bundle. Resolves false after 5s rather
   * than rejecting: a timeout here means "installed but not loaded", not
   * "install failed".
   *
   * Takes every id the extension answers to, because the registry keys on the
   * `.kai` manifest id — polling for the store's slug matched nothing and every
   * install ended in `not_loaded`.
   */
  const waitForRuntime = useCallback(async (ids: string[]) => {
    const runtime = (window as any).tatakaiRuntime;
    if (!runtime?.health) return false;

    const needles = ids.map((id) => String(id ?? '').trim().toLowerCase()).filter(Boolean);
    if (needles.length === 0) return false;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const health = await runtime.health();
        const loaded: string[] = Array.isArray(health?.loadedExtensions)
          ? health.loadedExtensions
          : [];
        if (loaded.some((id) => needles.includes(String(id ?? '').trim().toLowerCase()))) {
          return true;
        }
      } catch {
        /* runtime not up yet */
      }
    }
    return false;
  }, []);

  const install = useMutation({
    mutationFn: async ({
      extension,
      version,
    }: {
      extension: StoreExtension;
      version?: StoreVersion;
    }) => {
      const targetId = extension.slug || extension.id;
      setPendingId(targetId);
      const known = aliasesOf(extension);
      setNotLoadedIds((prev) =>
        prev.filter((id) => !known.includes(String(id ?? '').toLowerCase())),
      );

      const url = resolveInstallUrl(extension, version);
      const buffer = await downloadExtensionKai(url);

      const runtime = (window as any).tatakaiRuntime;
      // The runtime is authoritative about the id: it registers the extension
      // under the manifest's own id, and that is the only id `runtime:health`
      // and `unloadExtension` recognise.
      let canonicalId = targetId;
      if (runtime?.loadKaiExtension) {
        const result = await runtime.loadKaiExtension(buffer, true);
        if (!result?.success) throw new Error(result?.error ?? 'Runtime rejected the bundle');
        canonicalId = String(result.extensionId ?? '').trim() || targetId;
      }

      // Tie all three ids together before anything reads them back, so the
      // catalogue merge and `isInstalled` can see past whichever one they hold.
      const aliases = rememberAliases([extension.id, extension.slug, canonicalId]);

      const sideloaded = readJson<ExtensionManifest[]>(SIDELOADED_KEY, []).filter(
        (item) => !aliases.includes(String(item?.id ?? '').toLowerCase()),
      );
      writeJson(SIDELOADED_KEY, [
        storeToManifest({ ...extension, id: canonicalId, slug: canonicalId }),
        ...sideloaded,
      ]);

      const installed = readJson<string[]>(INSTALLED_KEY, []).filter(
        (id) => !aliases.includes(String(id ?? '').toLowerCase()),
      );
      const nextInstalled = [...installed, canonicalId];
      writeJson(INSTALLED_KEY, nextInstalled);
      setInstalledIds(nextInstalled);
      setAliasEpoch((value) => value + 1);

      const loaded = await waitForRuntime(aliases.length > 0 ? aliases : [canonicalId]);
      return { targetId: canonicalId, loaded };
    },
    onSuccess: ({ targetId, loaded }) => {
      if (!loaded) setNotLoadedIds((prev) => Array.from(new Set([...prev, targetId])));
      window.dispatchEvent(new CustomEvent(SIDELOAD_EVENT, { detail: targetId }));
      queryClient.invalidateQueries({ queryKey: ['extensions'] });
      // The catalogue merges on alias groups that only just gained the manifest
      // id, so it has to be rebuilt or the duplicate row stays on screen.
      queryClient.invalidateQueries({ queryKey: ['extension-store'] });
      toast.success(loaded ? 'Extension installed' : 'Installed — waiting for the runtime to load it');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Install failed';
      toast.error(message);
    },
    onSettled: () => setPendingId(null),
  });

  const uninstall = useMutation({
    mutationFn: async (extension: StoreExtension) => {
      const targetId = extension.slug || extension.id;
      setPendingId(targetId);

      // Remove by alias, not by one field: the installed id is the manifest id,
      // which the store row does not carry.
      const aliases = aliasesOf(extension);
      const matches = (value: unknown) => aliases.includes(String(value ?? '').toLowerCase());

      const installed = readJson<string[]>(INSTALLED_KEY, []).filter((id) => !matches(id));
      writeJson(INSTALLED_KEY, installed);
      setInstalledIds(installed);

      const sideloaded = readJson<ExtensionManifest[]>(SIDELOADED_KEY, []).filter(
        (item) => !matches(item?.id),
      );
      writeJson(SIDELOADED_KEY, sideloaded);

      setNotLoadedIds((prev) => prev.filter((id) => !matches(id)));

      // Unload every id the runtime might have registered it under, then drop
      // the grouping so a reinstall re-derives it from the runtime.
      const unload = (window as any).tatakaiRuntime?.unloadExtension;
      if (unload) {
        await Promise.all(
          aliases.map((id) => Promise.resolve(unload(id)).catch(() => undefined)),
        );
      }
      forgetAliases(aliases);
      setAliasEpoch((value) => value + 1);
      return targetId;
    },
    onSuccess: () => {
      window.dispatchEvent(new CustomEvent(SIDELOAD_EVENT));
      queryClient.invalidateQueries({ queryKey: ['extensions'] });
      queryClient.invalidateQueries({ queryKey: ['extension-store'] });
      toast.success('Extension removed');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Could not remove the extension';
      toast.error(message);
    },
    onSettled: () => setPendingId(null),
  });

  const toggle = useCallback(
    (extension: StoreExtension, version?: StoreVersion) => {
      if (isInstalled(extension)) uninstall.mutate(extension);
      else install.mutate({ extension, version });
    },
    [install, isInstalled, uninstall],
  );

  return { installedIds, isInstalled, stateFor, install, uninstall, toggle };
}
