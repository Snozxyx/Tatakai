import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Gothic Empress saves through the owner RPC, validates settings, and falls back after access revocation', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  const preferences = { version: 1, selected: 'gothic-empress', configurations: { 'gothic-empress': { version: 1 } }, presets: [] };
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
    for (const file of ['20261024000002_profile_themes.sql', '20261025000001_sekai_experience.sql', '20261025000002_uchiha_profile_theme.sql', '20261025000003_gothic_empress_profile_theme.sql']) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${owner}',false); SET ROLE authenticated;`);
    const save = (p: unknown) => db.query('SELECT save_profile_themes($1::jsonb)', [JSON.stringify(p)]);
    await save(preferences);
    await expect(save({ ...preferences, configurations: { 'gothic-empress': { version: 2 } } })).rejects.toThrow('Invalid Gothic Empress');
    await expect(save({ ...preferences, configurations: { 'gothic-empress': { version: '1' } } })).rejects.toThrow('Invalid Gothic Empress');
    await expect(save({ ...preferences, configurations: {} })).rejects.toThrow('Missing theme');
    await expect(save({ ...preferences, configurations: { 'gothic-empress': { version: 1, embers: 1.1 } } })).rejects.toThrow('intensity');
    await expect(save({ ...preferences, configurations: { 'gothic-empress': { version: 1, embers: '1' } } })).rejects.toThrow('Invalid Gothic Empress');
    await expect(save({ ...preferences, configurations: { 'gothic-empress': { version: 1, motion: 'false' } } })).rejects.toThrow('Invalid Gothic Empress');
    await save({ ...preferences, configurations: { 'gothic-empress': { version: 1, motion: false, embers: 0 } } });
    await save(preferences);
    const state = await db.query<{ app_settings: { player: unknown; profileThemes: unknown } }>('SELECT app_settings FROM profiles');
    expect(state.rows[0].app_settings.player).toEqual({ quality: 'best' });
    expect(state.rows[0].app_settings.profileThemes).toEqual(preferences);
    await db.exec(`RESET ROLE; DELETE FROM user_badges WHERE user_id='${owner}';`);
    const revoked = await db.query<{ p: { selected: string; configurations: unknown } }>("SELECT app_settings->'profileThemes' p FROM profiles");
    expect(revoked.rows[0].p.selected).toBe('default');
    expect(revoked.rows[0].p.configurations).toEqual(preferences.configurations);
    await db.exec('SET ROLE authenticated');
    await expect(save(preferences)).rejects.toThrow('require');
    await db.exec(`RESET ROLE; UPDATE profiles SET is_admin=true; SET ROLE authenticated;`);
    await save(preferences);
    await db.exec('RESET ROLE; UPDATE profiles SET is_admin=false');
    const adminRevoked = await db.query<{ selected: string }>("SELECT app_settings#>>'{profileThemes,selected}' selected FROM profiles");
    expect(adminRevoked.rows[0].selected).toBe('default');
  } finally { await db.close(); }
}, 30000);

