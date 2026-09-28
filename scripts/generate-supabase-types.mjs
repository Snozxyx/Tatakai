#!/usr/bin/env node
/**
 * Generates src/integrations/supabase/types.ts from supabase/migrations/main.sql.
 *
 * `supabase gen types` is the tool that should do this, but it needs either a
 * live connection or a local Postgres, and this environment has neither. main.sql
 * is a dashboard-exported snapshot of the deployed schema, so it is the only
 * authoritative description of the live tables available offline.
 *
 * What it can and cannot know, stated plainly because the output looks
 * authoritative either way:
 *
 *   - Tables, columns, nullability, defaults and foreign keys: from the file.
 *   - Views, enum members, function signatures: absent from the snapshot. Enums
 *     degrade to `string`, functions are declared permissively by name only.
 *   - `ARRAY` columns carry no element type in the snapshot; it is recovered from
 *     the column default (`'{}'::text[]`) and falls back to string[] otherwise.
 *     Every fallback is reported on stderr rather than silently guessed.
 *
 * Re-run after replacing main.sql:  node scripts/generate-supabase-types.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = resolve(ROOT, 'supabase/migrations/main.sql');
const OUTPUT = resolve(ROOT, 'src/integrations/supabase/types.ts');

/** RPCs called from src/. Signatures are not in the snapshot, so these are
 *  declared by name with permissive args so the name itself type-checks. */
const RPC_NAMES = [
  'ban_user',
  'unban_user',
  'set_staff_role',
  'has_role',
  'record_anime_view',
  'increment_tier_list_views',
  'increment_tier_list_comment_likes',
  'decrement_tier_list_comment_likes',
  'increment_forum_post_views',
  'get_trending_scores',
  'get_trending_anime',
  'get_recommendations_for_user',
  'get_leaderboard_active',
  'get_anime_metrics',
  'update_user_watch_time',
  'expire_bans',
];

const warnings = [];

/**
 * Columns that exist in a written migration but not yet in main.sql.
 *
 * main.sql is exported from the dashboard, so it describes the database as it is
 * *now* — before the pending migrations in supabase/migrations are hand-applied.
 * Two columns are added by 20260902000003_profiles_column_level_update.sql and
 * are already written by the client (SettingsPage:354 and
 * appSettingsPersistence.ts), so omitting them here would make type-check fail on
 * code that is correct for the schema it is being deployed against.
 *
 * Delete an entry once a refreshed main.sql contains the column.
 */
const PENDING_COLUMNS = {
  profiles: [
    // 20260902000003 §1: text DEFAULT 'romaji', CHECK romaji|english|native
    { name: 'preferred_title_language', ts: 'string', notNull: false, hasDefault: true },
    // 20260902000003 §1b: jsonb DEFAULT '{}'
    { name: 'app_settings', ts: 'Json', notNull: false, hasDefault: true },
  ],
};

/**
 * Whole tables in the same position: written, not yet in main.sql.
 *
 * admin_logs is created by 20260902000004_admin_logs.sql. Eleven client sites
 * insert into it and the Admin log panel reads it, so leaving it out would type
 * the app's audit trail as `never` and report the schema as the broken party.
 */
const PENDING_TABLES = [
  {
    name: 'admin_logs',
    columns: [
      { name: 'id', ts: 'string', notNull: true, hasDefault: true },
      { name: 'user_id', ts: 'string', notNull: false, hasDefault: false },
      { name: 'action', ts: 'string', notNull: true, hasDefault: false },
      { name: 'entity_type', ts: 'string', notNull: true, hasDefault: false },
      { name: 'entity_id', ts: 'string', notNull: false, hasDefault: false },
      { name: 'details', ts: 'Json', notNull: false, hasDefault: false },
      { name: 'ip_address', ts: 'string', notNull: false, hasDefault: false },
      { name: 'created_at', ts: 'string', notNull: false, hasDefault: true },
    ],
    foreignKeys: [
      {
        constraint: 'admin_logs_user_id_fkey',
        columns: ['user_id'],
        isOneToOne: false,
        referencedRelation: 'users',
        referencedColumns: ['id'],
      },
    ],
  },
];

// -----------------------------------------------------------------------------
// Scanning
//
// Regex cannot find the end of a CREATE TABLE body: CHECK constraints and
// DEFAULT expressions nest parentheses, and at least one default in main.sql
// (content_scores.weighted_score) spans lines. Both scanners below track paren
// depth and copy quoted literals verbatim so a ')' or ',' inside a string is
// never mistaken for structure.
// -----------------------------------------------------------------------------

/** @returns {{name: string, body: string}[]} */
function extractTables(sql) {
  const tables = [];
  const header = /CREATE TABLE\s+public\.([a-z0-9_]+)\s*\(/gi;
  let match;

  while ((match = header.exec(sql))) {
    let i = header.lastIndex;
    const start = i;
    let depth = 1;

    while (i < sql.length && depth > 0) {
      const ch = sql[i];
      if (ch === "'") {
        i++;
        while (i < sql.length && sql[i] !== "'") i++;
      } else if (ch === '(') depth++;
      else if (ch === ')') depth--;
      i++;
    }

    tables.push({ name: match[1], body: sql.slice(start, i - 1) });
    header.lastIndex = i;
  }

  return tables;
}

/** Splits a table body on commas at paren depth 0. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let cur = '';

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'") {
      cur += ch;
      i++;
      while (i < body.length && body[i] !== "'") cur += body[i++];
      cur += "'";
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }

  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// -----------------------------------------------------------------------------
// Types
//
// Longest-first: 'character varying' must be tested before 'character', and
// 'timestamp with time zone' before 'time'.
// -----------------------------------------------------------------------------
const SCALARS = [
  ['timestamp with time zone', 'string'],
  ['timestamp without time zone', 'string'],
  ['character varying', 'string'],
  ['double precision', 'number'],
  ['USER-DEFINED', 'string'],
  ['character', 'string'],
  ['smallint', 'number'],
  ['integer', 'number'],
  ['bigint', 'number'],
  ['numeric', 'number'],
  ['real', 'number'],
  ['boolean', 'boolean'],
  ['jsonb', 'Json'],
  ['json', 'Json'],
  ['uuid', 'string'],
  ['tsvector', 'string'],
  ['interval', 'string'],
  ['inet', 'string'],
  ['date', 'string'],
  ['time', 'string'],
  ['text', 'string'],
];

function mapScalar(decl, where) {
  const head = decl.trim();
  for (const [sqlType, tsType] of SCALARS) {
    const pattern = new RegExp(`^${sqlType.replace(/-/g, '\\-')}\\b`, 'i');
    if (pattern.test(head)) return tsType;
  }
  warnings.push(`${where}: unrecognised type "${head.split(/\s+/)[0]}", emitted as string`);
  return 'string';
}

const CONSTRAINT_LINE = /^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY|EXCLUDE)\b/i;

function parseColumn(part, table) {
  const match = /^([a-z0-9_]+)\s+([\s\S]+)$/i.exec(part);
  if (!match) return null;

  const [, name, decl] = match;
  const where = `${table}.${name}`;
  let ts;

  if (/^ARRAY\b/i.test(decl)) {
    // The snapshot prints every array column as bare `ARRAY`. The element type
    // survives only in the default's cast, e.g. DEFAULT '{}'::text[].
    const cast = /::\s*([a-z ]+?)\s*\[\]/i.exec(decl);
    if (cast) {
      ts = `${mapScalar(cast[1], where)}[]`;
    } else {
      warnings.push(`${where}: ARRAY with no default to infer element type from, emitted as string[]`);
      ts = 'string[]';
    }
  } else {
    ts = mapScalar(decl, where);
  }

  return {
    name,
    ts,
    notNull: /\bNOT NULL\b/i.test(decl),
    hasDefault: /\bDEFAULT\b/i.test(decl),
    unique: /\bUNIQUE\b/i.test(decl),
  };
}

const FOREIGN_KEY =
  /^CONSTRAINT\s+([a-z0-9_]+)\s+FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:[a-z0-9_]+\.)?([a-z0-9_]+)\s*\(([^)]+)\)/i;

const csv = (s) => s.split(',').map((v) => v.trim().replace(/"/g, ''));

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------
const sql = readFileSync(INPUT, 'utf8');
const model = [];

for (const { name, body } of extractTables(sql)) {
  const columns = [];
  const foreignKeys = [];

  for (const part of splitTopLevel(body)) {
    if (CONSTRAINT_LINE.test(part)) {
      const fk = FOREIGN_KEY.exec(part);
      if (fk) {
        foreignKeys.push({
          constraint: fk[1],
          columns: csv(fk[2]),
          referencedRelation: fk[3],
          referencedColumns: csv(fk[4]),
        });
      }
      continue;
    }
    const column = parseColumn(part, name);
    if (column) columns.push(column);
  }

  if (!columns.length) {
    warnings.push(`${name}: no columns parsed, table skipped`);
    continue;
  }

  const uniques = new Set(columns.filter((c) => c.unique).map((c) => c.name));
  for (const fk of foreignKeys) {
    fk.isOneToOne = fk.columns.length === 1 && uniques.has(fk.columns[0]);
  }

  for (const pending of PENDING_COLUMNS[name] ?? []) {
    if (columns.some((c) => c.name === pending.name)) {
      warnings.push(`${name}.${pending.name}: now in main.sql, drop it from PENDING_COLUMNS`);
      continue;
    }
    columns.push({ ...pending, unique: false, pending: true });
  }

  model.push({ name, columns, foreignKeys });
}

for (const table of PENDING_TABLES) {
  if (model.some((t) => t.name === table.name)) {
    warnings.push(`${table.name}: now in main.sql, drop it from PENDING_TABLES`);
    continue;
  }
  model.push({
    name: table.name,
    columns: table.columns.map((c) => ({ ...c, unique: false, pending: true })),
    foreignKeys: table.foreignKeys,
  });
}

model.sort((a, b) => a.name.localeCompare(b.name));
// -----------------------------------------------------------------------------
// Emit
// -----------------------------------------------------------------------------
const out = [];

const push = (line = '') => out.push(line);

push('/* eslint-disable @typescript-eslint/no-explicit-any */');
push('// Generated by scripts/generate-supabase-types.mjs from');
push('// supabase/migrations/main.sql. Do not edit by hand — re-run the script.');
push('//');
push('// Derived from a schema snapshot rather than a live introspection, so:');
push('// enum columns are `string`, views are absent, and function signatures are');
push('// declared by name with permissive args. Replace with `supabase gen types`');
push('// output when a connection is available.');
push();
push('export type Json =');
push('  | string');
push('  | number');
push('  | boolean');
push('  | null');
push('  | { [key: string]: Json | undefined }');
push('  | Json[];');
push();
push('export type Database = {');
push('  public: {');
push('    Tables: {');

for (const table of model) {
  push(`      ${table.name}: {`);

  push('        Row: {');
  for (const c of table.columns) {
    const note = c.pending ? ' // added by a pending migration, not yet in main.sql' : '';
    push(`          ${c.name}: ${c.notNull ? c.ts : `${c.ts} | null`};${note}`);
  }
  push('        };');

  push('        Insert: {');
  for (const c of table.columns) {
    // Required only when the database can supply nothing: NOT NULL, no default.
    const required = c.notNull && !c.hasDefault;
    const type = c.notNull ? c.ts : `${c.ts} | null`;
    push(`          ${c.name}${required ? '' : '?'}: ${type};`);
  }
  push('        };');

  push('        Update: {');
  for (const c of table.columns) {
    push(`          ${c.name}?: ${c.notNull ? c.ts : `${c.ts} | null`};`);
  }
  push('        };');

  if (!table.foreignKeys.length) {
    push('        Relationships: [];');
  } else {
    push('        Relationships: [');
    for (const fk of table.foreignKeys) {
      push('          {');
      push(`            foreignKeyName: "${fk.constraint}";`);
      push(`            columns: [${fk.columns.map((c) => `"${c}"`).join(', ')}];`);
      push(`            isOneToOne: ${fk.isOneToOne};`);
      push(`            referencedRelation: "${fk.referencedRelation}";`);
      push(`            referencedColumns: [${fk.referencedColumns.map((c) => `"${c}"`).join(', ')}];`);
      push('          },');
    }
    push('        ];');
  }

  push('      };');
}

push('    };');
push('    Views: {');
push('      [_ in never]: never;');
push('    };');
push('    Functions: {');
for (const name of [...RPC_NAMES].sort()) {
  push(`      ${name}: {`);
  push('        Args: Record<string, unknown>;');
  push('        Returns: any;');
  push('      };');
}
push('    };');
push('    Enums: {');
push('      [_ in never]: never;');
push('    };');
push('    CompositeTypes: {');
push('      [_ in never]: never;');
push('    };');
push('  };');
push('};');
push();
push('type PublicSchema = Database["public"];');
push();
push('export type Tables<T extends keyof PublicSchema["Tables"]> =');
push('  PublicSchema["Tables"][T]["Row"];');
push();
push('export type TablesInsert<T extends keyof PublicSchema["Tables"]> =');
push('  PublicSchema["Tables"][T]["Insert"];');
push();
push('export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =');
push('  PublicSchema["Tables"][T]["Update"];');
push();
push('export type Enums<T extends keyof PublicSchema["Enums"]> =');
push('  PublicSchema["Enums"][T];');
push();
push('export type CompositeTypes<T extends keyof PublicSchema["CompositeTypes"]> =');
push('  PublicSchema["CompositeTypes"][T];');
push();

writeFileSync(OUTPUT, out.join('\n'), 'utf8');

const columnCount = model.reduce((n, t) => n + t.columns.length, 0);
const fkCount = model.reduce((n, t) => n + t.foreignKeys.length, 0);

console.log(`${OUTPUT}`);
console.log(`  ${model.length} tables, ${columnCount} columns, ${fkCount} foreign keys`);
console.log(`  ${RPC_NAMES.length} functions declared by name`);

if (warnings.length) {
  console.error(`\n${warnings.length} inference fallback(s):`);
  for (const w of warnings) console.error(`  - ${w}`);
}
