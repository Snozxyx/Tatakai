import { isExplicitExtensionContent } from '../src/lib/contentSafety';
import { afterEach, describe, expect, test } from "bun:test";
import {
  ADULT_CATEGORIES,
  classifyAdultContent,
  matchesContentMode,
  normalizeAdultCategories,
  selectedAdultCategories,
} from "../src/lib/adultContentPolicy";
import {
  confirmAdultMode,
  requestAdultMode,
  dismissAdultMode,
  disableAdultMode,
  getAdultMode,
  isAdultConfirmationPending,
  contentModePath,
} from "../src/lib/adultMode";
afterEach(disableAdultMode);
describe("session Adult Mode", () => {
  test("confirmation is mandatory and cancellation leaves SFW", () => {
    confirmAdultMode();
    expect(getAdultMode()).toBe("sfw");
    requestAdultMode();
    expect(isAdultConfirmationPending()).toBe(true);
    expect(getAdultMode()).toBe("sfw");
    dismissAdultMode();
    confirmAdultMode();
    expect(getAdultMode()).toBe("sfw");
  });
  test("explicit confirmation changes navigation and disabling restores it", () => {
    requestAdultMode();
    confirmAdultMode();
    expect(getAdultMode()).toBe("adult");
    expect(contentModePath("/manga")).toBe("/adult/manga");
    expect(contentModePath("/search?q=test#results")).toBe("/adult/search?q=test#results");
    expect(contentModePath("/watch/42")).toBe("/adult/watch/42");
    disableAdultMode();
    expect(contentModePath("/adult/novel", "sfw")).toBe("/novel");
  });
});
describe("source-based categories", () => {
  test("explicit beats ecchi and mature ratings", () => {
    expect(
      classifyAdultContent({
        isAdult: true,
        genres: ["Ecchi"],
        rating: "R - 17+",
      })
    ).toBe("explicit");
    expect(
      classifyAdultContent({
        isAdult: false,
        genres: ["Ecchi"],
        rating: "R - 17+",
      })
    ).toBe("ecchi");
    expect(
      classifyAdultContent({ isAdult: false, rating: "R - 17+ (violence)" })
    ).toBe("mature");
  });
  test("ratings classify sexual content without title/relationship guesses", () => {
    expect(classifyAdultContent({ content_rating: "erotica" })).toBe(
      "explicit"
    );
    expect(classifyAdultContent({ content_rating: "suggestive" })).toBe(
      "ecchi"
    );
    expect(
      classifyAdultContent({
        title: "Love and Sex",
        genres: ["Yuri"],
        isAdult: false,
      })
    ).toBe(null);
  });
  test("SFW always excludes restricted categories even if their adult filters are disabled", () => {
    const hidden = selectedAdultCategories(
      normalizeAdultCategories({ explicit: false, ecchi: false, mature: false })
    );
    expect(hidden).toEqual([]);
    for (const c of ADULT_CATEGORIES) {
      expect(matchesContentMode({ adultCategory: c }, "sfw", hidden)).toBe(
        false
      );
      expect(matchesContentMode({ adultCategory: c }, "adult", hidden)).toBe(
        false
      );
    }
    expect(matchesContentMode({ isAdult: false }, "adult")).toBe(false);
  });
});

test('extension cards use ratings and flags instead of relationship labels',()=>{expect(isExplicitExtensionContent({name:'Yuri story',genres:['Yuri'],isAdult:false})).toBe(false);expect(isExplicitExtensionContent({name:'Provider',nsfw:true})).toBe(true);});
