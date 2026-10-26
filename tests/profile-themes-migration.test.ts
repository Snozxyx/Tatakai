import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { defaultSekaiConfig } from '../src/lib/profileThemes';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const preferences = () => ({ version: 1, selected: 'sekaipop', configurations: { sekaipop: defaultSekaiConfig() }, presets: [] });

test('profile theme migration validates direct updates, owner RPC, role access and revocation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA auth TO PUBLIC;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE profiles(user_id uuid PRIMARY KEY,is_admin boolean DEFAULT false,role text,app_settings jsonb DEFAULT '{}'::jsonb);
      CREATE TABLE user_badges(user_id uuid,badge_key text);
      ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_profile ON profiles USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
      GRANT SELECT ON profiles TO authenticated; GRANT UPDATE(app_settings) ON profiles TO authenticated;
      INSERT INTO profiles(user_id,app_settings) VALUES ${[1,2,3,4,5,6,7].map(n => `('${uid(n)}','{"profile":{"backgroundEffect":"rain"},"player":{"quality":"best"}}')`).join(',')};
      INSERT INTO user_badges VALUES ('${uid(1)}','booster'),('${uid(2)}','premium-pro'),('${uid(3)}','premium-ultra'),('${uid(4)}','premium-go');
      UPDATE profiles SET is_admin=true WHERE user_id='${uid(5)}';
      UPDATE profiles SET role='admin' WHERE user_id='${uid(6)}';
      UPDATE profiles SET role='moderator' WHERE user_id='${uid(7)}';`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261024000002_profile_themes.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/20261025000001_sekai_experience.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/20261025000002_uchiha_profile_theme.sql', import.meta.url), 'utf8'));
    const asUser = async (n: number) => { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uid(n)}',false); SET ROLE authenticated;`); };
    const save = (p: unknown) => db.query('SELECT save_profile_themes($1::jsonb)', [JSON.stringify(p)]);
    for (const n of [1,2,3,5,6]) { await asUser(n); await save(preferences()); }
    for (const n of [4,7]) { await asUser(n); await expect(save(preferences())).rejects.toThrow('require');
      await expect(db.query('UPDATE profiles SET app_settings=jsonb_set(app_settings,\'{profileThemes}\',$1::jsonb) WHERE user_id=auth.uid()', [JSON.stringify(preferences())])).rejects.toThrow('require'); }
    await asUser(1);
    const malformed = preferences(); malformed.configurations.sekaipop.widgets[0].x = 5000;
    await expect(save(malformed)).rejects.toThrow('bounds');
    const unsafe = preferences(); unsafe.configurations.sekaipop.wallpaper.url = 'javascript:alert(1)';
    await expect(save(unsafe)).rejects.toThrow('wallpaper');
    const missing = preferences(); missing.configurations.sekaipop.widgets = [];
    await expect(save(missing)).rejects.toThrow();
    const invalidVersion = { ...preferences(), version: 2 };
    await expect(save(invalidVersion)).rejects.toThrow('preferences');
    const state = await db.query<{ app_settings: { profile: unknown; player: unknown } }>('SELECT app_settings FROM profiles WHERE user_id=auth.uid()');
    expect(state.rows[0].app_settings.profile).toEqual({ backgroundEffect: 'rain' });
    expect(state.rows[0].app_settings.player).toEqual({ quality: 'best' });
    await db.query('UPDATE profiles SET app_settings=$1::jsonb WHERE user_id=$2', ['{}', uid(2)]);
    await db.exec('RESET ROLE');
    const other = await db.query<{ selected: string }>(`SELECT app_settings#>>'{profileThemes,selected}' selected FROM profiles WHERE user_id='${uid(2)}'`);
    expect(other.rows[0].selected).toBe('sekaipop');
    await db.exec(`DELETE FROM user_badges WHERE user_id='${uid(1)}'; UPDATE profiles SET is_admin=false WHERE user_id='${uid(5)}'; UPDATE profiles SET role='user' WHERE user_id='${uid(6)}';`);
    for (const n of [1,5,6]) {
      const result = await db.query<{ p: { selected: string; configurations: unknown } }>(`SELECT app_settings->'profileThemes' p FROM profiles WHERE user_id='${uid(n)}'`);
      expect(result.rows[0].p.selected).toBe('default'); expect(result.rows[0].p.configurations).toEqual(preferences().configurations);
    }
    await db.exec(`INSERT INTO user_badges VALUES ('${uid(1)}','booster')`); await asUser(1); await save(preferences());
    await db.exec(`RESET ROLE; INSERT INTO user_badges VALUES ('${uid(1)}','premium-pro'); DELETE FROM user_badges WHERE user_id='${uid(1)}' AND badge_key='booster';`);
    const remaining = await db.query<{ selected: string }>(`SELECT app_settings#>>'{profileThemes,selected}' selected FROM profiles WHERE user_id='${uid(1)}'`);
    expect(remaining.rows[0].selected).toBe('sekaipop');
    await db.exec(`SELECT set_config('request.jwt.claim.sub','',false); SET ROLE authenticated;`);
    await expect(save(preferences())).rejects.toThrow('Sign in');
  } finally { await db.close(); }
}, 30000);
