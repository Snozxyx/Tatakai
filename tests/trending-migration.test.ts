import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {test,expect} from 'bun:test';
test('trending migration returns the declared numeric score without a 42804 error',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE anime_view_counts(anime_id text,views_today integer,views_week integer,views_month integer,total_views integer);
 CREATE TABLE watchlist(anime_id text,status text);
 CREATE TABLE anime_views(anime_id text,watch_duration double precision,completed boolean,viewed_at timestamptz);
 INSERT INTO anime_view_counts VALUES('one',1,5,12,30),('two',2,8,20,50);
 INSERT INTO watchlist VALUES('one','plan_to_watch');
 INSERT INTO anime_views VALUES('one',120.5,true,now()),('two',60,false,now());`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261015000001_fix_trending_score_type.sql',import.meta.url),'utf8'));
 const {rows}=await db.query<{kind:string}>('SELECT pg_typeof(trending_score)::text kind FROM get_trending_anime()');
 expect(rows).toHaveLength(2);expect(rows.every(row=>row.kind==='numeric')).toBe(true);
 }finally{await db.close();}
});
