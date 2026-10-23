import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import type {
  CustomSourceEntry,
  CustomInfoData,
} from "@/core/content/custom-source-runtime";
import {
  catalogKind,
  readCustomCatalog,
  saveCustomCatalog,
  usableCatalogLink,
  verifyCustomCatalogId,
  automaticallyMatchCustomCatalog,
  type CustomTitleIdentity,
  type CustomCatalogLink,
  type CatalogMedia,
} from "@/core/content/custom-catalog";

export function useCustomCatalog(
  source: CustomSourceEntry | undefined,
  id: string | undefined,
  info?: CustomInfoData | null
) {
  const { user } = useAuth(),
    profile = user?.id || "guest",
    client = useQueryClient();
  const identity: CustomTitleIdentity = {
    namespace: source?.namespace || "",
    sourceId: source?.id || "",
    id: id || "",
  };
  const kind = catalogKind(source);
  const key = [
    "custom-catalog",
    profile,
    identity.namespace,
    identity.sourceId,
    id,
    kind,
    JSON.stringify(info?.catalogIds || {}),
    info?.title,
    JSON.stringify(info?.meta || {}),
  ];
  useEffect(() => {
    const refresh = () =>
      void client.invalidateQueries({ queryKey: ["custom-catalog", profile] });
    window.addEventListener("tatakai-custom-catalog-changed", refresh);
    return () =>
      window.removeEventListener("tatakai-custom-catalog-changed", refresh);
  }, [client, profile]);
  const result = useQuery({
    queryKey: key,
    enabled: !!(source && id && kind),
    retry: false,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const stored = await readCustomCatalog(profile, identity);
      // A deliberate unlink is a persisted tombstone so source metadata cannot relink it.
      if (stored) return usableCatalogLink(source, identity, stored.link);
      if (!info || !kind) return null;
      const explicit = !!(info.catalogIds?.anilist || info.catalogIds?.mal);
      const media = explicit
        ? await verifyCustomCatalogId(kind, info.catalogIds!, signal)
        : await automaticallyMatchCustomCatalog(kind, info, signal);
      if (!media) return null;
      const link: CustomCatalogLink = {
        version: 1,
        identity,
        media,
        verifiedBy: explicit ? "source-id" : "title-match",
        verifiedAt: new Date().toISOString(),
        syncEnabled: false,
      };
      // Another view may have confirmed/unlinked while the network call was in flight.
      const concurrent = await readCustomCatalog(profile, identity);
      if (concurrent)
        return usableCatalogLink(source, identity, concurrent.link);
      await saveCustomCatalog(profile, identity, link);
      return link;
    },
  });
  const link = usableCatalogLink(source, identity, result.data);
  async function confirm(candidate: CatalogMedia) {
    if (!kind) throw Error("This provider has no supported catalogue adapter");
    // Recheck the selected identity; never trust a title-search label or source token.
    const media = candidate.anilistId
      ? await verifyCustomCatalogId(kind, { anilist: candidate.anilistId })
      : candidate.tatakaiId
      ? (await import("@/core/content/custom-catalog"))
          .searchCustomCatalog(kind, `tatakai:${candidate.tatakaiId}`)
          .then((items) => items[0])
      : undefined;
    const verified = await media;
    if (
      !verified ||
      verified.kind !== kind ||
      (!verified.anilistId && !verified.tatakaiId)
    )
      throw Error("Unsupported catalogue mapping");
    const updated: CustomCatalogLink = {
      version: 1,
      identity,
      media: verified,
      verifiedBy: "confirmed",
      verifiedAt: new Date().toISOString(),
      syncEnabled: false,
    };
    await saveCustomCatalog(profile, identity, updated);
    client.setQueryData(key, updated);
  }
  async function unlink() {
    await saveCustomCatalog(profile, identity, null);
    client.setQueryData(key, null);
  }
  async function setSync(enabled: boolean) {
    if (!link?.media.anilistId) return;
    const updated = { ...link, syncEnabled: enabled };
    await saveCustomCatalog(profile, identity, updated);
    client.setQueryData(key, updated);
  }
  return { ...result, link, kind, identity, profile, confirm, unlink, setSync };
}
