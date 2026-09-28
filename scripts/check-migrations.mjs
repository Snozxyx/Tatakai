// Static validation for supabase/migrations, in two passes.
//
// There is no local Postgres in this environment (no docker, no psql), so a
// migration's first real syntax check would otherwise be `supabase db push`
// against the deployed database. These two parsers are the actual Postgres
// grammar compiled to WASM, so they catch the same class of error offline.
//
//   pass 1  pgsql-parser  -> the outer statements
//   pass 2  libpg-query   -> the plpgsql inside $$ ... $$
//
// Both passes are needed. pgsql-parser sees a function body as an opaque string
// literal, so `LANGUAGE plpgsql AS $$ ... nonsense ... $$` parses clean; pass 2
// is what found `END WHILE` (plpgsql has no such construct) in two migrations
// that would abort at CREATE FUNCTION.
//
// Files without a version prefix — main.sql, DATABASE_SETUP.sql — are pg_dump
// snapshots rather than migrations. The CLI ignores them, so pass 1 reports them
// but they do not fail the run.
//
// Usage: node scripts/check-migrations.mjs [file.sql ...]
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'pgsql-parser';
import { parsePlPgSQLSync, loadModule } from 'libpg-query';

const DIR = 'supabase/migrations';
const VERSIONED = /^\d{14}_/;

const argv = process.argv.slice(2);
const files = argv.length
  ? argv
  : readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort().map((f) => `${DIR}/${f}`);

const isMigration = (f) => VERSIONED.test(f.split(/[\\/]/).pop());

// Each CREATE OR REPLACE FUNCTION through the close of its dollar-quoted body.
const FN = /CREATE OR REPLACE FUNCTION[\s\S]*?\$\$[\s\S]*?\$\$/g;

await loadModule();

let failures = 0;
let skipped = 0;

for (const file of files) {
  const sql = readFileSync(file, 'utf8');
  const optional = !isMigration(file);
  const notes = [];
  let ok = true;

  try {
    const parsed = await parse(sql);
    notes.push(`${parsed.stmts?.length ?? parsed.length} statements`);
  } catch (e) {
    ok = false;
    notes.push(`statements: ${String(e.message ?? e).split('\n')[0]}`);
  }

  const bodies = sql.match(FN) ?? [];
  if (bodies.length) {
    const errors = [];
    for (const body of bodies) {
      const name = (body.match(/FUNCTION\s+([\w.]+)/) ?? [, '?'])[1];
      try {
        parsePlPgSQLSync(`${body};`);
      } catch (e) {
        errors.push(`${name}: ${String(e.message ?? e).split('\n')[0]}`);
      }
    }
    notes.push(`${bodies.length - errors.length}/${bodies.length} plpgsql bodies`);
    if (errors.length) {
      ok = false;
      notes.push(...errors);
    }
  }

  if (ok) {
    console.log(`ok    ${file}  (${notes.join(', ')})`);
  } else if (optional) {
    skipped++;
    console.log(`skip  ${file}  (not a versioned migration)`);
    for (const n of notes.slice(1)) console.log(`        ${n}`);
  } else {
    failures++;
    console.log(`FAIL  ${file}`);
    for (const n of notes) console.log(`        ${n}`);
  }
}

const checked = files.length - skipped;
console.log(`\n${checked - failures}/${checked} migrations valid${skipped ? `, ${skipped} snapshot(s) skipped` : ''}`);
process.exit(failures ? 1 : 0);
