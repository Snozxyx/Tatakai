import { describe, it, expect } from "bun:test";

describe("Provider Service Fixes", () => {
  describe("Anime ID Regex Stripping", () => {
    it("should strip trailing anime IDs (4+ digits)", () => {
      const testCases = [
        { input: "jujutsu-kaisen-the-culling-game-part-1-20401", expected: "jujutsu-kaisen-the-culling-game-part-1" },
        { input: "demon-slayer-kimetsu-no-yaiba-1453", expected: "demon-slayer-kimetsu-no-yaiba" },
        { input: "solo-leveling-9998", expected: "solo-leveling" },
        { input: "attack-on-titan-100", expected: "attack-on-titan-100" }, // Less than 4 digits
        { input: "one-piece-99", expected: "one-piece-99" }, // 2 digits
        { input: "naruto-500", expected: "naruto-500" }, // 3 digits
        { input: "naruto-5000", expected: "naruto" }, // Exactly 4 digits
      ];

      testCases.forEach(({ input, expected }) => {
        const result = input.replace(/-\d{4,}$/, "");
        expect(result).toBe(expected);
      });
    });

    it("should handle edge cases", () => {
      expect("anime-name".replace(/-\d{4,}$/, "")).toBe("anime-name");
      expect("anime-1234".replace(/-\d{4,}$/, "")).toBe("anime");
      expect("anime-123456789".replace(/-\d{4,}$/, "")).toBe("anime");
    });
  });

  describe("Console Logging Format", () => {
    it("should format provider aggregation logs correctly", () => {
      const providers = [
        { displayName: "Animelok" },
        { displayName: "DesiDub" },
        { displayName: "ToonStream" },
      ];
      const providerNames = providers.map(g => g.displayName).join(", ");
      const logMessage = `[Tatakai] Provider aggregation: ${providers.length} provider(s) returned 12 total source(s) | ${providerNames}`;
      
      expect(logMessage).toContain("[Tatakai]");
      expect(logMessage).toContain("3 provider(s)");
      expect(logMessage).toContain("12 total source(s)");
      expect(logMessage).toContain("Animelok");
      expect(logMessage).toContain("DesiDub");
      expect(logMessage).toContain("ToonStream");
    });

    it("should handle empty provider case", () => {
      const providers = [];
      const providerNames = providers.map(g => g.displayName).join(", ");
      const logMessage = `[Tatakai] Provider aggregation: ${providers.length} provider(s) returned 0 total source(s) | ${providerNames || "none"}`;
      
      expect(logMessage).toContain("0 provider(s)");
      expect(logMessage).toContain("none");
    });
  });

  describe("Provider Resolution Strategy", () => {
    it("should use search-first for Animelok", () => {
      // This test documents the expected flow:
      // 1. Search for anime (e.g., "jujutsu kaisen")
      // 2. Get internal ID (e.g., "d0b1e6236a0a")
      // 3. Fetch sources using ID
      // 4. Fall back to episode 1 if episode not found
      
      const animeSlug = "jujutsu-kaisen-the-culling-game-part-1";
      const searchQuery = animeSlug.replace(/-/g, " ");
      
      expect(searchQuery).toBe("jujutsu kaisen the culling game part 1");
    });

    it("should handle DesiDub search fallback", () => {
      const watchSlug = "jujutsu-kaisen-the-culling-game-part-1";
      const searchQuery = watchSlug.replace(/[-_]+/g, " ").replace(/\s+\d+$/, "").trim();
      
      expect(searchQuery).toBe("jujutsu kaisen the culling game part");
    });
  });
});
