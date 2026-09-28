#!/usr/bin/env node
/**
 * Generate a fresh, secure secret set for a SELF-HOSTED Supabase (Docker) stack,
 * replacing the insecure demo defaults. Crucially it re-signs ANON_KEY and
 * SERVICE_ROLE_KEY as HS256 JWTs against the NEW JWT_SECRET — random strings
 * alone are rejected by GoTrue/PostgREST; the keys must be signed by the secret.
 *
 * Pure Node, no dependencies. Run it anywhere Node exists (the output is just
 * text); apply the values on the machine that runs the containers.
 *
 * Usage:
 *   node scripts/generate-supabase-secrets.mjs                # print values to paste
 *   node scripts/generate-supabase-secrets.mjs --write <path> # rewrite a supabase .env in place (backs up to .env.bak)
 */
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";

const now = Math.floor(Date.now() / 1000);
const exp = now + 10 * 365 * 24 * 60 * 60; // 10 years

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** URL-safe alphanumeric — no escaping needed inside connection strings. */
function alnum(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = b64url(createHmac("sha256", secret).update(data).digest());
  return `${data}.${sig}`;
}

const JWT_SECRET = b64url(randomBytes(48)); // 64 chars, > 32 required
const ANON_KEY = signJwt({ role: "anon", iss: "supabase", iat: now, exp }, JWT_SECRET);
const SERVICE_ROLE_KEY = signJwt({ role: "service_role", iss: "supabase", iat: now, exp }, JWT_SECRET);

// Ordered so the block reads like the top of the supabase .env.
const secrets = {
  POSTGRES_PASSWORD: alnum(32),
  JWT_SECRET,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SECRET_KEY_BASE: b64url(randomBytes(48)),
  VAULT_ENC_KEY: alnum(32),          // must be exactly 32 chars
  PG_META_CRYPTO_KEY: alnum(32),     // 32 chars min
  LOGFLARE_PUBLIC_ACCESS_TOKEN: b64url(randomBytes(32)),
  LOGFLARE_PRIVATE_ACCESS_TOKEN: b64url(randomBytes(32)),
  DASHBOARD_PASSWORD: alnum(24),
  POOLER_TENANT_ID: alnum(12),
  S3_PROTOCOL_ACCESS_KEY_ID: randomBytes(16).toString("hex"),
  S3_PROTOCOL_ACCESS_KEY_SECRET: randomBytes(32).toString("hex"),
};

const writeIdx = process.argv.indexOf("--write");
if (writeIdx !== -1) {
  const path = process.argv[writeIdx + 1];
  if (!path || !existsSync(path)) {
    console.error(`--write needs a path to an EXISTING supabase .env (got: ${path || "nothing"})`);
    process.exit(1);
  }
  copyFileSync(path, `${path}.bak`);
  let text = readFileSync(path, "utf8");
  for (const [k, v] of Object.entries(secrets)) {
    const re = new RegExp(`^(${k})=.*$`, "m");
    text = re.test(text) ? text.replace(re, `$1=${v}`) : `${text}\n${k}=${v}`;
  }
  writeFileSync(path, text);
  console.error(`✓ Updated ${path} (backup at ${path}.bak)\n`);
}

// Always print — the app side must be synced to the same freshly-signed keys.
console.log("# ===== Supabase docker .env — replace these =====");
for (const [k, v] of Object.entries(secrets)) console.log(`${k}=${v}`);
console.log(`
# ===== Sync these into the app (SAME keys, or the app can't talk to Supabase) =====
# tatakaiapi/.env
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
# frontend .env (repo root)
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}

# Then restart the stack:  docker compose down && docker compose up -d
# NOTE: rotating JWT_SECRET invalidates all existing sessions — everyone re-logs-in.
# The asymmetric keys (JWT_KEYS/JWT_JWKS/*_ASYMMETRIC) stay empty = legacy HS256 mode, which is fine.`);
