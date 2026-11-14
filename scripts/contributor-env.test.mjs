import test from 'node:test';
import assert from 'node:assert/strict';
import { contributorEnvironment, validateContributorEnvironment } from './contributor-env.mjs';

const jwt = role => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role, ref: 'tatakai-development',
  environment: 'development', iss: 'supabase', exp: Date.now() / 1000 + 3600 })).toString('base64url') + '.test';
const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const good = () => contributorEnvironment(root, { VITE_SUPABASE_ANON_KEY: jwt('anon') });

test('the committed public template contains a valid development anon key', () => {
  const env = contributorEnvironment(root);
  assert.equal(env.VITE_SUPABASE_URL, 'https://dev.tatakai.app');
});

test('contributor environment resolves only development DB and local API', () => {
  const env = good();
  assert.equal(env.VITE_SUPABASE_URL, 'https://dev.tatakai.app');
  assert.equal(env.VITE_API_V3_ORIGIN, 'http://127.0.0.1:4001');
  assert.equal(env.VITE_CAPTCHA_ENABLED, 'false');
  assert.equal(Object.keys(env).some(key => /SERVICE_ROLE|SECRET|WEBHOOK|POSTHOG/.test(key)), false);
});
test('rejects production endpoints inherited from another environment', () => {
  assert.throws(() => validateContributorEnvironment({ ...good(), VITE_SUPABASE_URL: 'https://db.tatakai.app' }), /dev\.tatakai\.app/);
  assert.throws(() => validateContributorEnvironment({ ...good(), VITE_API_V3_ORIGIN: 'https://api.tatakai.app' }), /loopback/);
});
test('service role and other private settings cannot enter the browser profile', () => {
  assert.throws(() => validateContributorEnvironment({ ...good(), VITE_SUPABASE_ANON_KEY: jwt('service_role') }), /Service-role/);
  assert.throws(() => validateContributorEnvironment({ ...good(), VITE_SERVICE_ROLE_KEY: 'private' }), /Unsupported/);
  assert.throws(() => validateContributorEnvironment({ ...good(), VITE_POSTHOG_KEY: 'production' }), /Unsupported/);
});
test('rejects mixed API origins and accidental production integrations', () => {
  assert.throws(() => validateContributorEnvironment({ ...good(), VITE_BACKEND_ORIGIN: 'https://api.tatakai.app' }), /must match/);
  assert.throws(() => validateContributorEnvironment({ ...good(), VITE_OPERATIONS_AUTH_ENABLED: 'true' }), /must be false/);
});
