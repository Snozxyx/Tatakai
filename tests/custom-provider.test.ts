import "fake-indexeddb/auto";
import { afterAll, afterEach, describe, expect, it } from "bun:test";
import Dexie from "dexie";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import {
  groupCustomSources,
  customSourceBase,
  orderedCustomEntries,
} from "../src/core/content/custom-source-model";
import type { CustomCatalogLink } from "../src/core/content/custom-catalog";
import type { CustomSourceEntry } from "../src/core/content/custom-source-runtime";

const originalFetch = globalThis.fetch,
  originalWindow = globalThis.window;
Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
const { db } = await import("../src/core/db/tatakai-db");
const {
  catalogCommentTarget,
  usableCatalogLink,
  verifyCustomCatalogId,
  searchCustomCatalog,
  positiveCatalogId,
  catalogLinkKey,
  readCustomCatalog,
  saveCustomCatalog,
  trackedCustomEntry,
  automaticallyMatchCustomCatalog,
  confidentCustomCatalogMatch,
} = await import("../src/core/content/custom-catalog");
const { extensionContinueEntry, extensionTitleRoute } = await import(
  "../src/core/extensions/compatibility/library"
);
if (!originalWindow)
  Object.defineProperty(globalThis, "window", {
    value: new EventTarget(),
    configurable: true,
  });
afterEach(() => {
  globalThis.fetch = originalFetch;
});
afterAll(async () => {
  await db.kv.delete(catalogLinkKey("alice", identity));
  if (!originalWindow) delete (globalThis as any).window;
});
const source: CustomSourceEntry = {
  namespace: "compat-aniyomi",
  id: "original-en",
  extensionId: "pkg",
  name: "Provider",
  kind: "watch",
  providerGroup: "repo/pkg/provider",
  language: "en",
  catalogMediaType: "anime",
};
const identity = {
  namespace: source.namespace,
  sourceId: source.id,
  id: "opaque-source-token",
};
const link: CustomCatalogLink = {
  version: 1,
  identity,
  media: {
    kind: "anime",
    anilistId: 20,
    malId: 20,
    title: "Naruto",
    format: "TV",
    episodes: 220,
  },
  verifiedBy: "confirmed",
  verifiedAt: "2026-10-21T00:00:00Z",
  syncEnabled: false,
};
const media = {
  id: 20,
  idMal: 20,
  type: "ANIME",
  format: "TV",
  title: { romaji: "Naruto" },
  episodes: 220,
};

describe("custom providers and verified catalogue ownership", () => {
  it("automatically matches one exact alias and refuses ambiguous remakes, seasons and wrong kinds", () => {
    const candidate = {
      ...link.media,
      aliases: ["NARUTO", "ナルト"],
      year: 2002,
    };
    expect(
      confidentCustomCatalogMatch("anime", "  ナルト  ", [candidate])?.anilistId
    ).toBe(20);
    expect(
      confidentCustomCatalogMatch("anime", "Naruto", [
        candidate,
        { ...candidate, anilistId: 21, year: 2026 },
      ])
    ).toBeNull();
    expect(
      confidentCustomCatalogMatch(
        "anime",
        "Naruto",
        [candidate, { ...candidate, anilistId: 21, year: 2026 }],
        2002
      )?.anilistId
    ).toBe(20);
    expect(
      confidentCustomCatalogMatch("anime", "Naruto Season 2", [candidate])
    ).toBeNull();
    expect(
      confidentCustomCatalogMatch("manga", "Naruto", [candidate])
    ).toBeNull();
  });
  it("uses source numeric titles as search text and honours returned media types without invented IDs", async () => {
    let variables: any;
    globalThis.fetch = (async (_url, init) => {
      variables = JSON.parse(String(init?.body)).variables;
      return Response.json({
        data: {
          Page: { media: [{ ...media, id: 116589, title: { romaji: "86" } }] },
        },
      });
    }) as typeof fetch;
    expect(
      (
        await automaticallyMatchCustomCatalog("anime", {
          title: "86",
          meta: {},
        })
      )?.anilistId
    ).toBe(116589);
    expect(variables).toEqual({ search: "86", type: "ANIME" });
    expect(
      await automaticallyMatchCustomCatalog("manga", { title: "86", meta: {} })
    ).toBeNull();
  });
  it("groups languages within an owner and keeps unrelated repositories/kinds independent", () => {
    const groups = groupCustomSources([
      source,
      { ...source, id: "original-fr", language: "fr" },
      { ...source, id: "other-repo", providerGroup: "other-repo/pkg/provider" },
      { ...source, id: "read-source", kind: "read" },
      { ...source, id: "legacy-1", providerGroup: undefined },
      { ...source, id: "legacy-2", providerGroup: undefined },
    ]);
    expect(groups).toHaveLength(5);
    expect(
      groups
        .find((group) => group.id === source.id)
        ?.variants.map((item) => item.id)
    ).toEqual(["original-en", "original-fr"]);
    expect(customSourceBase({ namespace: "a/b", id: "c/d" })).toBe(
      "/x/a%2Fb/c%2Fd"
    );
  });
  it("never connects an unverified, unsupported, wrong-source or wrong-kind comment thread", () => {
    expect(catalogCommentTarget(source, identity, null)).toBeNull();
    expect(
      catalogCommentTarget(
        { ...source, catalogMediaType: undefined },
        identity,
        link
      )
    ).toBeNull();
    expect(
      catalogCommentTarget({ ...source, id: "other" }, identity, link)
    ).toBeNull();
    expect(
      catalogCommentTarget(source, { ...identity, id: "another-title" }, link)
    ).toBeNull();
    expect(
      catalogCommentTarget(source, identity, {
        ...link,
        media: { ...link.media, kind: "manga" },
      })
    ).toBeNull();
    expect(
      catalogCommentTarget(source, identity, {
        ...link,
        media: {
          ...link.media,
          anilistId: undefined,
          tatakaiId: "verified-local",
        },
      })
    ).toBeNull();
    expect(catalogCommentTarget(source, identity, link)).toEqual({
      entityType: "anime",
      entityId: "20",
      entityName: "Naruto",
    });
    expect(
      usableCatalogLink(
        source,
        {
          id: identity.id,
          sourceId: identity.sourceId,
          namespace: identity.namespace,
        },
        link
      )
    ).toEqual(link);
  });
  it("keeps novels separate from manga while sharing the existing AniList-backed reading thread", () => {
    const novel = {
      ...source,
      kind: "read" as const,
      catalogMediaType: "novel" as const,
    };
    const novelLink = {
      ...link,
      media: { ...link.media, kind: "novel" as const, format: "NOVEL" },
    };
    expect(catalogCommentTarget(novel, identity, novelLink)?.entityType).toBe(
      "manga"
    );
    expect(
      catalogCommentTarget(
        { ...novel, catalogMediaType: "manga" },
        identity,
        novelLink
      )
    ).toBeNull();
  });
  it("rejects source/negative/synthetic/malformed IDs and validates exact catalogue IDs and MAL crossrefs", async () => {
    for (const value of [
      -1,
      0,
      "opaque-source-token",
      "tt20",
      "20.0",
      "2e1",
      " 20",
      true,
    ])
      expect(positiveCatalogId(value)).toBeUndefined();
    const calls: any[] = [];
    globalThis.fetch = (async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return Response.json({ data: { Media: media } });
    }) as typeof fetch;
    expect(
      (await verifyCustomCatalogId("anime", { anilist: "20", mal: 20 }))
        .anilistId
    ).toBe(20);
    expect(calls[0].variables).toEqual({ id: 20, type: "ANIME" });
    await expect(
      verifyCustomCatalogId("anime", { anilist: 21 })
    ).rejects.toThrow("does not match");
    await expect(
      verifyCustomCatalogId("manga", { anilist: 20 })
    ).rejects.toThrow("does not match");
    await expect(
      verifyCustomCatalogId("anime", { anilist: 20, mal: 21 })
    ).rejects.toThrow("does not match");
  });
  it("treats numeric-looking titles as search text and never saves title-search guesses", async () => {
    const calls: any[] = [];
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return Response.json({ data: { Page: { media: [media] } } });
    }) as typeof fetch;
    expect(await searchCustomCatalog("anime", "12monkeys")).toHaveLength(1);
    expect(calls[0].variables.search).toBe("12monkeys");
    expect(await readCustomCatalog("search-only", identity)).toBeUndefined();
    await expect(
      searchCustomCatalog("anime", "https://anilist.co/manga/20/Title")
    ).rejects.toThrow("different media type");
  });
  it("persists a verified link per profile/source/title and remembers deliberate disconnects", async () => {
    await saveCustomCatalog("alice", identity, link);
    await db.close();
    await db.open();
    expect((await readCustomCatalog("alice", identity))?.link).toEqual(link);
    expect(await readCustomCatalog("bob", identity)).toBeUndefined();
    expect(catalogLinkKey("alice", identity)).not.toBe(
      catalogLinkKey("alice", { ...identity, sourceId: "original-fr" })
    );
    await saveCustomCatalog("alice", identity, null);
    expect(await readCustomCatalog("alice", identity)).toEqual({
      version: 1,
      link: null,
    });
  });
  it("requires numbering confirmation and rejects duplicated/fractional/out-of-range tracker units", () => {
    const entries = [
      { id: "ep1", number: 1 },
      { id: "ep2", number: 2 },
    ];
    expect(trackedCustomEntry(link, entries, "ep1")).toBeUndefined();
    expect(
      trackedCustomEntry({ ...link, syncEnabled: true }, entries, "ep1")
    ).toBe(1);
    for (const list of [
      [
        { id: "ep1", number: 1 },
        { id: "season2", number: 1 },
      ],
      [{ id: "ep1", number: 1.5 }],
      [{ id: "ep1", number: 221 }],
    ])
      expect(
        trackedCustomEntry({ ...link, syncEnabled: true }, list, "ep1")
      ).toBeUndefined();
  });
  it("resumes the exact source entry or the next unfinished entry, preserving repeated season numbers", () => {
    const entries = [
      { id: "c2", label: "Chapter 2", number: 2 },
      { id: "c1", label: "Chapter 1", number: 1 },
    ];
    const item: any = {
      ...identity,
      sourceId: identity.sourceId,
      kind: "read",
      title: "Example",
      saved: true,
      latest: "c1",
      catalog: entries,
      entries: {
        c1: {
          id: "c1",
          label: "Chapter 1",
          completed: false,
          position: 8,
          duration: 20,
        },
      },
    };
    expect(extensionContinueEntry(item)?.id).toBe("c1");
    item.entries.c1.completed = true;
    expect(extensionContinueEntry(item)?.id).toBe("c2");
    expect(extensionTitleRoute({ ...item, latest: "c2" })).toContain(
      "/read/opaque-source-token/c2"
    );
    item.entries.c2 = { id: "c2", completed: true };
    item.latest = "c2";
    expect(extensionContinueEntry(item)).toBeNull();
    const seasons = [{ number: 1 }, { number: 2 }, { number: 1 }];
    expect(orderedCustomEntries(seasons)).toEqual(seasons);
  });
});
