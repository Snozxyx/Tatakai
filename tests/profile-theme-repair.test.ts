import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('missing grant table repair is atomic and reruns preserve claims',async()=>{
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
    ]) {
      await db.exec(
        readFileSync(
          new URL(`../supabase/migrations/${file}`, import.meta.url),
          "utf8"
        )
      );
    }

    const repair=readFileSync(new URL('../docs/profile-themes/repair-theme-collection.sql',import.meta.url),'utf8');
    expect((await db.query<{t:unknown}>("SELECT to_regclass('public.profile_theme_grants') t")).rows[0].t).toBeNull();
    await db.exec(repair);
    await db.exec(`DELETE FROM user_badges WHERE user_id='${owner}'; SELECT set_config('request.jwt.claim.sub','${owner}',false); SET ROLE authenticated; SELECT claim_profile_theme_launch(); RESET ROLE;`);
    await db.exec(repair);
    await db.exec(repair);
    expect((await db.query<{n:number}>('SELECT claimed n FROM profile_theme_launch_campaign')).rows[0].n).toBe(1);
    expect((await db.query<{n:number}>('SELECT count(*)::integer n FROM profile_theme_grants')).rows[0].n).toBe(5);
    expect((await db.query<{n:number}>('SELECT count(*)::integer n FROM profile_theme_launch_claims')).rows[0].n).toBe(1);
    await db.exec(`SET ROLE authenticated; SELECT claim_profile_theme_launch(); RESET ROLE;`);
    expect((await db.query<{n:number}>('SELECT claimed n FROM profile_theme_launch_campaign')).rows[0].n).toBe(1);
  } finally { await db.close(); }
},30000);
