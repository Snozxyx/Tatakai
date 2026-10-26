import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Midnight Lo-Fi saves through the owner RPC, validates settings, and falls back after access revocation', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  const preferences = {
    version: 1,
    selected: 'midnight-lofi',
    configurations: { 'midnight-lofi': { version: 1, motion: true, glowIntensity: 0.7 } },
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
      '20261024000002_profile_themes.sql',
      '20261025000001_sekai_experience.sql',
      '20261025000002_uchiha_profile_theme.sql',
      '20261025000003_gothic_empress_profile_theme.sql',
      '20261026000002_midnight_lofi_profile_theme.sql',
    ]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }

    await db.exec(`SELECT set_config('request.jwt.claim.sub','${owner}',false); SET ROLE authenticated;`);
    const save = (p: unknown) => db.query('SELECT save_profile_themes($1::jsonb)', [JSON.stringify(p)]);

    // Valid save
    await save(preferences);

    // Invalid config version
    await expect(
      save({ ...preferences, configurations: { 'midnight-lofi': { version: 2 } } })
    ).rejects.toThrow('Invalid Midnight Lo-Fi');

    // Missing theme config
    await expect(save({ ...preferences, configurations: {} })).rejects.toThrow('Missing theme');

    // Invalid glowIntensity out of bounds
    await expect(
      save({ ...preferences, configurations: { 'midnight-lofi': { version: 1, glowIntensity: 1.5 } } })
    ).rejects.toThrow('glow intensity');

    // Revocation falls back to default
    await db.exec(`RESET ROLE; DELETE FROM user_badges WHERE user_id='${owner}';`);
    const revoked = await db.query<{ p: { selected: string; configurations: unknown } }>(
      "SELECT app_settings->'profileThemes' p FROM profiles"
    );
    expect(revoked.rows[0].p.selected).toBe('default');
    expect(revoked.rows[0].p.configurations).toEqual(preferences.configurations);
  } finally {
    await db.close();
  }
}, 30000);
