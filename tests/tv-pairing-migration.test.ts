import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {test,expect} from 'bun:test';

test('TV pairing state is service-only, expiring, and lookup attempts are bounded atomically',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261016000001_tv_pairing.sql',import.meta.url),'utf8'));
    const {rows:[privileges]}=await db.query<{anon:boolean,member:boolean,api:boolean}>(`SELECT
      has_table_privilege('anon','tv_pairing_requests','SELECT') OR has_function_privilege('anon','tv_pairing_lookup(text)','EXECUTE') anon,
      has_table_privilege('authenticated','tv_pairing_requests','SELECT') OR has_function_privilege('authenticated','tv_pairing_lookup(text)','EXECUTE') member,
      has_table_privilege('service_role','tv_pairing_requests','INSERT') AND has_function_privilege('service_role','tv_pairing_lookup(text)','EXECUTE') api`);
    expect(privileges).toEqual({anon:false,member:false,api:true});
    await db.exec(`INSERT INTO tv_pairing_requests(id,pin_hash,poll_hash,public_key,phrase,expires_at) VALUES
      ('00000000-0000-4000-8000-000000000001','active','poll','{}','TEST',now()+interval '5 minutes'),
      ('00000000-0000-4000-8000-000000000002','expired','poll','{}','TEST',now()-interval '1 second');
      SET ROLE service_role;`);
    for(let n=0;n<10;n++) expect((await db.query("SELECT id FROM tv_pairing_lookup('active')")).rows).toHaveLength(1);
    expect((await db.query("SELECT id FROM tv_pairing_lookup('active')")).rows).toHaveLength(0);
    expect((await db.query("SELECT id FROM tv_pairing_lookup('expired')")).rows).toHaveLength(0);
    expect((await db.query("SELECT id FROM tv_pairing_lookup('unknown')")).rows).toHaveLength(0);
    await db.exec('RESET ROLE');
    expect((await db.query<{attempts:number}>("SELECT attempts FROM tv_pairing_requests WHERE pin_hash='active'")).rows[0].attempts).toBe(10);
  } finally {await db.close();}
},30000);

test('release metadata accepts Android TV without changing existing platform records',async()=>{
 const db=new PGlite();
 try{
  await db.exec("CREATE TABLE app_releases(platform text CONSTRAINT app_releases_platform_check CHECK(platform IN ('win','mac','linux','android'))); INSERT INTO app_releases VALUES('android'),('win');");
  await db.exec(readFileSync(new URL('../supabase/migrations/20261017000001_android_tv_releases.sql',import.meta.url),'utf8'));
  await db.exec("INSERT INTO app_releases VALUES('android-tv')");
  expect((await db.query<{platform:string}>('SELECT platform FROM app_releases ORDER BY platform')).rows.map(r=>r.platform)).toEqual(['android','android-tv','win']);
 }finally{await db.close();}
},30000);
