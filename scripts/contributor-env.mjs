import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const origins = ['VITE_BACKEND_ORIGIN', 'VITE_API_ORIGIN', 'VITE_API_V3_ORIGIN'];
const bases = ['VITE_API_BASE_URL', 'VITE_TATAKAI_API_URL'];
const disabled = ['VITE_CAPTCHA_ENABLED', 'VITE_OPERATIONS_AUTH_ENABLED', 'VITE_LOG_FRONTEND_ERRORS_TO_DB',
  'VITE_FORCE_NATIVE_APP', 'VITE_TV_MODE'];
const allowed = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', ...origins, ...bases, ...disabled,
  'VITE_APP_MODE', 'VITE_APP_PLATFORM', 'VITE_DISABLE_NATIVE_FEATURES']);

export function validateContributorEnvironment(values) {
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) throw Error(`Unsupported contributor browser setting: ${key}. Keep private and production settings outside this profile.`);
  }
  if (values.VITE_SUPABASE_URL !== 'https://dev.tatakai.app') throw Error('Contributor mode requires VITE_SUPABASE_URL=https://dev.tatakai.app.');
  let key;
  try { key = JSON.parse(Buffer.from(values.VITE_SUPABASE_ANON_KEY.split('.')[1], 'base64url').toString()); }
  catch { throw Error('Set the public development anon key in config/contributor/.env.local.'); }
  if (key.role !== 'anon' || key.ref !== 'tatakai-development' || key.environment !== 'development'
    || key.iss !== 'supabase' || !Number.isFinite(Number(key.exp)) || Number(key.exp) <= Date.now() / 1000) {
    throw Error('The frontend must use the development anon key. Service-role and production keys are rejected.');
  }
  let api;
  try { api = new URL(values.VITE_API_V3_ORIGIN); } catch { throw Error('Configure a local development API origin.'); }
  if (api.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname)
      || api.username || api.password || api.pathname !== '/' || api.search || api.hash) {
    throw Error('The contributor API must use an HTTP loopback origin on this device.');
  }
  for (const key of origins) if (values[key] !== api.origin) throw Error(`${key} must match VITE_API_V3_ORIGIN.`);
  for (const key of bases) if (values[key] !== api.origin + '/api/v3') throw Error(`${key} must use the local API /api/v3 base.`);
  for (const key of disabled) if (values[key] !== 'false') throw Error(`${key} must be false in the contributor profile.`);
  if (values.VITE_APP_MODE !== 'web' || values.VITE_APP_PLATFORM !== 'web' || values.VITE_DISABLE_NATIVE_FEATURES !== 'true') {
    throw Error('The contributor browser profile must use web mode.');
  }
  return values;
}

export function contributorEnvironment(root, loaded = {}) {
  const template = path.join(root, 'config/contributor/.env.example');
  const values = { ...dotenv.parse(fs.readFileSync(template)), ...loaded };
  return validateContributorEnvironment(values);
}
