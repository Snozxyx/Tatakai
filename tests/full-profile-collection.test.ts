import { PROFILE_THEMES } from "../src/components/profile/themes/registry";
import { defaultSekaiConfig } from "../src/lib/profileThemes";
import {
  AVATAR_DECORATIONS,
  PROFILE_COSMETIC_EFFECTS,
  PROFILE_NAMEPLATES,
  isFreeCosmetic,
} from "../src/lib/profileCosmetics";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("Launch claims enforce a permanent full-collection grant, eligibility, idempotency and a hard 200-account cap", async () => {
  const db = new PGlite();
  const owner = "00000000-0000-4000-8000-000000000001";
  const preferences = {
    version: 1,
    selected: "komorebi",
    configurations: { komorebi: { version: 1 } },
    presets: [],
  };

  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
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
      "20261026000004_profile_theme_launch_claims.sql",
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

    const claim = () =>
      db.query<{ value: { remaining: number; claimed: boolean } }>(
        "SELECT claim_profile_theme_launch() AS value"
      );
    await expect(claim()).rejects.toThrow("without Premium"); // Booster already has access.
    await db.exec(
      `RESET ROLE; DELETE FROM user_badges WHERE user_id='${owner}'; SET ROLE authenticated;`
    );
    const first = await claim();
    expect(first.rows[0].value).toMatchObject({
      claimed: true,
      remaining: 199,
    });
    await claim();
    expect(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM profile_theme_grants"
        )
      ).rows[0].count
    ).toBe(2);
    // Apply the expansion after a real two-theme claim: backfill is automatic and uses no new slot.
    await db.exec("RESET ROLE");
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20261026000005_full_theme_collection.sql",
          import.meta.url
        ),
        "utf8"
      )
    );
    await db.exec("SET ROLE authenticated");
    expect(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM profile_theme_grants"
        )
      ).rows[0].count
    ).toBe(5);
    const configurations: Record<string, unknown> = {};
    for (const theme of PROFILE_THEMES.filter((t) => t.id !== "default")) {
      configurations[theme.id] = theme.defaults();
      await save({
        ...preferences,
        selected: theme.id,
        configurations: { ...configurations },
      });
    }
    // Ownership grants each theme including SekaiPop preset editing, without granting Premium.
    await save({
      ...preferences,
      selected: "sekaipop",
      configurations,
      presets: [
        {
          id: "favorite",
          name: "My world",
          theme: "sekaipop",
          configuration: defaultSekaiConfig(),
        },
      ],
    });
    await expect(
      db.exec(
        `INSERT INTO profile_theme_grants(user_id,theme_id) VALUES('${owner}','komorebi')`
      )
    ).rejects.toThrow("permission denied");
    await expect(
      db.exec("UPDATE profile_theme_launch_campaign SET claimed=0")
    ).rejects.toThrow("permission denied");
    await db.exec(
      `RESET ROLE; INSERT INTO user_badges VALUES('${owner}','premium-pro'); DELETE FROM user_badges WHERE user_id='${owner}';`
    );
    expect(
      (
        await db.query<{ selected: string }>(
          `SELECT app_settings#>>'{profileThemes,selected}' selected FROM profiles WHERE user_id='${owner}'`
        )
      ).rows[0].selected
    ).toBe("sekaipop");
    // Every new public cosmetic saves; premium-only cosmetics remain locked for claimants.
    const equip = (p: unknown) =>
      db.query(
        "UPDATE profiles SET app_settings=jsonb_set(app_settings,'{profile}',$1::jsonb) WHERE user_id=$2::uuid",
        [JSON.stringify(p), owner]
      );
    await db.exec("SET ROLE authenticated");
    for (const [kind, items] of [
      ["avatarDecoration", AVATAR_DECORATIONS],
      ["profileEffect", PROFILE_COSMETIC_EFFECTS],
      ["nameplate", PROFILE_NAMEPLATES],
    ] as const) {
      for (const item of items) {
        if (isFreeCosmetic(kind, item.key)) await equip({ [kind]: item.key });
        else
          await expect(equip({ [kind]: item.key })).rejects.toThrow("require");
      }
    }
    await equip({
      avatarDecoration: "bamboo",
      profileEffect: "firefly",
      nameplate: "seigaiha",
    });
    await db.exec(
      `RESET ROLE; INSERT INTO user_badges VALUES('${owner}','premium-go'); DELETE FROM user_badges WHERE user_id='${owner}';`
    );
    expect(
      (
        await db.query<{ p: unknown }>(
          `SELECT app_settings->'profile' p FROM profiles WHERE user_id='${owner}'`
        )
      ).rows[0].p
    ).toEqual({
      avatarDecoration: "bamboo",
      profileEffect: "firefly",
      nameplate: "seigaiha",
    });
    // Premium Go, Pro and Ultra never consume launch slots.
    for (const [i, badge] of [
      "premium-go",
      "premium-pro",
      "premium-ultra",
    ].entries()) {
      const uid = "00000000-0000-4000-8001-" + String(i + 1).padStart(12, "0");
      await db.exec(
        `INSERT INTO profiles(user_id) VALUES('${uid}'); INSERT INTO user_badges VALUES('${uid}','${badge}'); SELECT set_config('request.jwt.claim.sub','${uid}',false); SET ROLE authenticated;`
      );
      await expect(claim()).rejects.toThrow("without Premium");
      await db.exec("RESET ROLE");
    }
    // Fill every remaining slot; the 201st distinct eligible account is rejected.
    for (let i = 2; i <= 201; i++) {
      const uid = "00000000-0000-4000-8002-" + String(i).padStart(12, "0");
      await db.exec(
        `INSERT INTO profiles(user_id) VALUES('${uid}'); SELECT set_config('request.jwt.claim.sub','${uid}',false); SET ROLE authenticated;`
      );
      if (i <= 200) await claim();
      else await expect(claim()).rejects.toThrow("All 200");
      await db.exec("RESET ROLE");
    }
    expect(
      (
        await db.query<{ claimed: number }>(
          "SELECT claimed FROM profile_theme_launch_campaign"
        )
      ).rows[0].claimed
    ).toBe(200);
    expect(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM profile_theme_launch_claims"
        )
      ).rows[0].count
    ).toBe(200);
    expect(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM profile_theme_grants"
        )
      ).rows[0].count
    ).toBe(1000);
    // Existing claim remains idempotent even after sell-out or a later upgrade.
    await db.exec(
      `INSERT INTO user_badges VALUES('${owner}','premium-go'); SELECT set_config('request.jwt.claim.sub','${owner}',false); SET ROLE authenticated;`
    );
    expect((await claim()).rows[0].value).toMatchObject({
      claimed: true,
      remaining: 0,
    });
    await db.exec('RESET ROLE');
    // Reconcile a manually installed campaign without resetting sold-out slots.
    await db.exec(readFileSync(new URL('../supabase/migrations/20261026000004_profile_theme_launch_claims.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/20261026000005_full_theme_collection.sql', import.meta.url), 'utf8'));
    expect((await db.query<{claimed:number}>('SELECT claimed FROM profile_theme_launch_campaign')).rows[0].claimed).toBe(200);
    expect((await db.query<{count:number}>('SELECT count(*)::integer count FROM profile_theme_grants')).rows[0].count).toBe(1000);
    await db.exec("RESET ROLE; SET ROLE anon");
    await expect(claim()).rejects.toThrow("permission denied");
  } finally {
    await db.close();
  }
}, 30000);
