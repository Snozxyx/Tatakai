import {expect,test} from 'bun:test';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
test('internal RLS replaces permissive legacy policies and preserves public reads and admin controls',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO PUBLIC;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  CREATE TABLE profiles(user_id uuid,is_admin boolean,is_moderator boolean,role text);
  INSERT INTO profiles VALUES ('00000000-0000-0000-0000-000000000001',true,false,'admin'),('00000000-0000-0000-0000-000000000002',false,false,'user');
  CREATE FUNCTION public.is_admin_user(p_user_id uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
  CREATE TABLE app_config(id text);CREATE TABLE redirects(id text);CREATE TABLE admin_popups(id text);CREATE TABLE analytics_events(id text);CREATE TABLE anime_trending_scores(id text);CREATE TABLE api_job_runs(id text);
  INSERT INTO app_config VALUES ('original');INSERT INTO analytics_events VALUES ('private');
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
  ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;CREATE POLICY unsafe_old_policy ON app_config FOR ALL USING(true) WITH CHECK(true);
  ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;CREATE POLICY unsafe_old_read ON analytics_events FOR SELECT USING(true);`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261026000007_rls_hardening_internal_tables.sql',import.meta.url),'utf8'));
  await db.exec('SET ROLE anon');
  expect((await db.query('SELECT * FROM app_config')).rows).toHaveLength(1);
  await expect(db.exec("INSERT INTO app_config VALUES ('bad')")).rejects.toThrow();
  expect((await db.query('SELECT * FROM analytics_events')).rows).toHaveLength(0);
  await expect(db.query('SELECT * FROM api_job_runs')).rejects.toThrow();
  await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);SET ROLE authenticated;");
  await expect(db.exec("INSERT INTO app_config VALUES ('bad')")).rejects.toThrow();
  await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);SET ROLE authenticated;");
  await db.exec("INSERT INTO app_config VALUES ('admin')");expect((await db.query('SELECT * FROM analytics_events')).rows).toHaveLength(1);
 }finally{await db.close();}
});
