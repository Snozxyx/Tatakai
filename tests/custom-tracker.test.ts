import { describe, expect, it } from "bun:test";
import { syncExtensionProgress } from "../TatakaiAPI/src/services/extensionProgress";

const input = {
  type: "anime" as const,
  mediaKind: "anime" as const,
  anilistId: 20,
  malId: 30,
  progress: 3,
};
function fixture(
  options: {
    current?: number;
    failAni?: boolean;
    failMal?: boolean;
    badIdentity?: boolean;
  } = {}
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("graphql.anilist")) {
      const body = JSON.parse(String(init.body));
      if (body.query.startsWith("mutation"))
        return Response.json(
          options.failAni
            ? { errors: [{ message: "rejected" }] }
            : { data: { SaveMediaListEntry: { progress: 3 } } }
        );
      return Response.json({
        data: {
          Media: {
            id: options.badIdentity ? 21 : 20,
            idMal: 30,
            type: "ANIME",
            format: "TV",
            episodes: 12,
            mediaListEntry: { progress: options.current || 0 },
          },
        },
      });
    }
    if (init.method === "PUT")
      return options.failMal
        ? new Response("upstream failed", { status: 503 })
        : Response.json({ num_watched_episodes: 3 });
    return Response.json({
      id: 30,
      my_list_status: { num_watched_episodes: options.current || 0 },
    });
  }) as typeof fetch;
  return {
    calls,
    deps: {
      fetch: fetcher,
      beforeAniList: async () => {},
      malToken: async () => "private-test-token",
    },
  };
}
describe("verified extension tracker acknowledgements", () => {
  it("advances connected AniList/MAL only after checking the canonical identity and current progress", async () => {
    const { calls, deps } = fixture();
    expect(
      await syncExtensionProgress(
        input,
        { anilist_access_token: "private", mal_access_token: "private" },
        deps
      )
    ).toEqual({ anilist: { status: "updated" }, mal: { status: "updated" } });
    expect(calls.filter((call) => call.init.method === "PUT")).toHaveLength(1);
    expect(JSON.parse(String(calls[1].init.body)).variables).toMatchObject({
      id: 20,
      progress: 3,
    });
    expect(calls[3].init.body).toContain("num_watched_episodes=3");
  });
  it("never decreases a tracker during rewatch/reread", async () => {
    const { calls, deps } = fixture({ current: 10 });
    expect(
      await syncExtensionProgress(
        input,
        { anilist_access_token: "private", mal_access_token: "private" },
        deps
      )
    ).toEqual({
      anilist: { status: "unchanged" },
      mal: { status: "unchanged" },
    });
    expect(calls).toHaveLength(2);
    expect(calls.some((call) => call.init.method === "PUT")).toBe(false);
  });
  it("reports partial upstream failures instead of acknowledging a failed tracker", async () => {
    const { deps } = fixture({ failAni: true });
    const result = await syncExtensionProgress(
      input,
      { anilist_access_token: "private", mal_access_token: "private" },
      deps
    );
    expect(result.anilist.status).toBe("error");
    expect(result.mal.status).toBe("updated");
    expect(
      (
        await syncExtensionProgress(
          input,
          { mal_access_token: "private" },
          fixture({ failMal: true }).deps
        )
      ).mal.status
    ).toBe("error");
  });
  it("rejects wrong IDs, media types, totals and MAL crossrefs before writing", async () => {
    for (const change of [
      { malId: 999 },
      { type: "manga", mediaKind: "manga" },
      { progress: 20 },
      { progress: -1 },
    ]) {
      const { calls, deps } = fixture();
      await expect(
        syncExtensionProgress(
          { ...input, ...change } as any,
          { anilist_access_token: "private", mal_access_token: "private" },
          deps
        )
      ).rejects.toThrow();
      expect(
        calls.some(
          (call) =>
            call.init.method === "PUT" ||
            String(call.init.body).includes("mutation")
        )
      ).toBe(false);
    }
  });
  it("keeps disconnected trackers unavailable without making network requests", async () => {
    const { calls, deps } = fixture();
    expect(await syncExtensionProgress(input, {}, deps)).toEqual({
      anilist: { status: "unavailable" },
      mal: { status: "unavailable" },
    });
    expect(calls).toHaveLength(0);
  });
});
