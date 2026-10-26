import { expect, test } from "bun:test";
import {
  readAvatarDecoration,
  readProfileNameplate,
  isFreeCosmetic,
} from "../src/lib/profileCosmetics";
import {
  defaultMidnightLofiConfig,
  readMidnightLofiConfig,
} from "../src/components/profile/themes/midnight-lofi/config";
import { resolveProfileTheme } from "../src/components/profile/themes/registry";
test("public cosmetic allowlists preserve free selections and reject restricted ones", () => {
  for (const key of ["enso", "kumihimo"])
    expect(readAvatarDecoration(key, false)).toBe(key);
  for (const key of ["sumi", "matcha", "sakura-letter"])
    expect(readProfileNameplate(key, false)).toBe(key);
  expect(readAvatarDecoration("kintsugi", false)).toBe("none");
  expect(readProfileNameplate("yoru", false)).toBe("none");
  expect(isFreeCosmetic("nameplate", "enso")).toBe(false);
  expect(isFreeCosmetic("profileEffect", "matcha")).toBe(false);
  expect(readAvatarDecoration("unknown", true)).toBe("none");
});
test("lofi audio sanitizes URLs and clamps volume while legacy configs keep the built-in soundtrack", () => {
  expect(readMidnightLofiConfig({ version: 1 })?.music).toEqual(
    defaultMidnightLofiConfig().music
  );
  expect(
    readMidnightLofiConfig({
      version: 1,
      music: { url: "javascript:alert(1)", volume: 2 },
    })?.music
  ).toEqual({ url: "", title: "After the last train", volume: 1 });
  expect(
    readMidnightLofiConfig({
      version: 1,
      music: { url: "https://user:pass@example.com/a.mp3" },
    })?.music.url
  ).toBe("");
});
test("Komorebi resolves only for a verified entitled owner with valid settings", () => {
  const p = {
    version: 1 as const,
    selected: "komorebi",
    configurations: { komorebi: { version: 1 } },
    presets: [],
  };
  expect(resolveProfileTheme(p, {}, [{ key: "booster" }], true).id).toBe(
    "komorebi"
  );
  expect(resolveProfileTheme(p, {}, [], true).id).toBe("default");
  expect(resolveProfileTheme(p, { is_admin: true }, [], false).id).toBe(
    "default"
  );
  expect(
    resolveProfileTheme(
      { ...p, configurations: {} },
      { is_admin: true },
      [],
      true
    ).id
  ).toBe("default");
});

test('a launch grant unlocks only the owned theme for a verified owner', () => {
 const p={version:1 as const,selected:'komorebi',configurations:{komorebi:{version:1}},presets:[]};
 expect(resolveProfileTheme(p,{},[],true,['komorebi']).id).toBe('komorebi');
 expect(resolveProfileTheme(p,{},[],true,['midnight-lofi']).id).toBe('default');
 expect(resolveProfileTheme(p,{},[],false,['komorebi']).id).toBe('default');
});
