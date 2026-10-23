import { afterEach, expect, it } from "bun:test";
import { AniListClient } from "../TatakaiAPI/src/providers/anilist/client";
const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});
it("reports an explicit AniList service outage as 503 and cools down repeated browse calls", async () => {
  let requests = 0;
  globalThis.fetch = (async () => {
    requests++;
    return Response.json(
      {
        errors: [
          {
            message:
              "The AniList API has been temporarily disabled due to severe stability issues.",
          },
        ],
      },
      { status: 403 }
    );
  }) as typeof fetch;
  const client = new AniListClient();
  for (let index = 0; index < 2; index++) {
    try {
      await client.query("query { Media(id:20){id} }");
      throw Error("Expected a service error");
    } catch (error: any) {
      expect(error.status).toBe(503);
      expect(error.message).toContain("temporarily disabled");
    }
  }
  expect(requests).toBe(1);
});
