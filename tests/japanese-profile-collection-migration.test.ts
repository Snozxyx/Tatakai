import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("Komorebi and public cosmetics enforce access and preserve public equipment on revocation", async () => {
  const db = new PGlite();
  const owner = "00000000-0000-4000-8000-000000000001";
  const preferences = {
    version: 1,
    selected: "komorebi",
    configurations: { komorebi: { version: 1 } },
    presets: [],
  };

  try {
    await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA auth TO PUBLIC;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE profiles(user_id uuid PRIMARY KEY,is_admin boolean DEFAULT false,role text,app_settings jsonb DEFAULT '{}'::jsonb);
      CREATE TABLE user_badges(user_id uuid,badge_key text);
      ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_profile ON profiles USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
      GRANT SELECT ON profiles TO authenticated; GRANT UPDATE(app_settings) ON profiles TO authenticated;
      INSERT INTO profiles(user_id,app_settings) VALUES ('${owner}','{"player":{"quality":"best"}}');
      INSERT INTO user_badges VALUES ('${owner}','booster');`);

    for (const file of [
      "20261024000002_profile_themes.sql",
      "20261025000001_sekai_experience.sql",
      "20261025000002_uchiha_profile_theme.sql",
      "20261025000003_gothic_empress_profile_theme.sql",
      "20261026000002_midnight_lofi_profile_theme.sql",
      "20261026000003_komorebi_and_public_cosmetics.sql",
    ]) {
      await db.exec(
        readFileSync(
          new URL(`../supabase/migrations/${file}`, import.meta.url),
          "utf8"
        )
      );
    }

    await db.exec(
      `SELECT set_config('request.jwt.claim.sub','${owner}',false); SET ROLE authenticated;`
    );
    const save = (p: unknown) =>
      db.query("SELECT save_profile_themes($1::jsonb)", [JSON.stringify(p)]);

    await save(preferences);
    await expect(
      save({ ...preferences, configurations: { komorebi: { version: 2 } } })
    ).rejects.toThrow("Invalid Komorebi");
    await expect(save({ ...preferences, configurations: {} })).rejects.toThrow(
      "Missing theme"
    );
    await save({
      ...preferences,
      selected: "midnight-lofi",
      configurations: {
        "midnight-lofi": {
          version: 1,
          music: {
            url: "https://example.com/music.mp3",
            title: "Evening",
            volume: 0.3,
          },
        },
      },
    });
    await expect(
      save({
        ...preferences,
        selected: "midnight-lofi",
        configurations: {
          "midnight-lofi": {
            version: 1,
            music: { url: "javascript:alert(1)" },
          },
        },
      })
    ).rejects.toThrow("audio settings");
    await expect(
      save({
        ...preferences,
        selected: "midnight-lofi",
        configurations: {
          "midnight-lofi": { version: 1, music: { volume: 2 } },
        },
      })
    ).rejects.toThrow("volume");
    await save(preferences);
    const equip = (profile: unknown) =>
      db.query(
        "UPDATE profiles SET app_settings=jsonb_set(app_settings,'{profile}',$1::jsonb)",
        [JSON.stringify(profile)]
      );
    await equip({ avatarDecoration: "enso", nameplate: "matcha" });
    await expect(equip({ avatarDecoration: "kintsugi" })).rejects.toThrow(
      "require"
    );
    await expect(equip({ nameplate: "yoru" })).rejects.toThrow("require");
    await expect(equip({ avatarDecoration: "invented" })).rejects.toThrow(
      "Unknown"
    );
    await db.exec(
      `RESET ROLE; DELETE FROM user_badges WHERE user_id='${owner}';`
    );
    expect(
      (
        await db.query<{ selected: string }>(
          "SELECT app_settings#>>'{profileThemes,selected}' selected FROM profiles"
        )
      ).rows[0].selected
    ).toBe("default");
    expect(
      (
        await db.query<{ profile: unknown }>(
          "SELECT app_settings->'profile' profile FROM profiles"
        )
      ).rows[0].profile
    ).toEqual({ avatarDecoration: "enso", nameplate: "matcha" });
    await db.exec("SET ROLE authenticated");
    await equip({ avatarDecoration: "kumihimo", nameplate: "sakura-letter" });
    await expect(save(preferences)).rejects.toThrow("require");
    await db.exec(
      `RESET ROLE; INSERT INTO user_badges VALUES ('${owner}','premium-go'); SET ROLE authenticated;`
    );
    await equip({ avatarDecoration: "mizuhiki", nameplate: "honey-silk" });
    await db.exec(
      `RESET ROLE; DELETE FROM user_badges WHERE user_id='${owner}';`
    );
    expect(
      (
        await db.query<{ profile: unknown }>(
          "SELECT app_settings->'profile' profile FROM profiles"
        )
      ).rows[0].profile
    ).toEqual({});
    await db.exec(`UPDATE profiles SET is_admin=true; SET ROLE authenticated;`);
    await equip({ avatarDecoration: "enso", nameplate: "sumi" });
    await save(preferences);
    await db.exec("RESET ROLE; UPDATE profiles SET is_admin=false");
    expect(
      (
        await db.query<{ profile: unknown }>(
          "SELECT app_settings->'profile' profile FROM profiles"
        )
      ).rows[0].profile
    ).toEqual({ avatarDecoration: "enso", nameplate: "sumi" });
  } finally {
    await db.close();
  }
}, 30000);
