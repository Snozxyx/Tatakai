import { test } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import {
  clientBuildEnv,
  serializeClientEnv,
} from "../scripts/write-client-env.mjs";
const source = `VITE_SUPABASE_URL=https://old.example.org
VITE_SUPABASE_ANON_KEY=public-anon-fixture
VITE_MAL_CLIENT_ID=123
VITE_ANILIST_CLIENT_ID=456
VITE_MANGABAKA_CLIENT_ID=789
VITE_ANILIST_CLIENT_SECRET=private-fixture
VITE_ADMIN_API_SECRET=private-fixture
SUPABASE_SERVICE_ROLE_KEY=private-fixture
VITE_EXTENSION_API_URL=https://extensions.tatakai.me/functions/v1/api
VITE_BACKEND_ORIGIN=http://localhost:4001
VITE_ANILIST_REDIRECT_URI=http://localhost/callback,https://tatakai.me/integration/anilist/redirect
VITE_FORCE_NATIVE_APP=true`;
test("includes all provider IDs and extension settings without private credentials", () => {
  const values = clientBuildEnv(source, "web");
  for (const key of [
    "VITE_MAL_CLIENT_ID",
    "VITE_ANILIST_CLIENT_ID",
    "VITE_MANGABAKA_CLIENT_ID",
    "VITE_EXTENSION_API_URL",
  ])
    assert.ok(values[key]);
  assert.equal(
    Object.keys(values).some((key) => /SECRET|ADMIN|SERVICE_ROLE/.test(key)),
    false
  );
  assert.equal(serializeClientEnv(values).includes("private-fixture"), false);
  assert.equal(values.VITE_FORCE_NATIVE_APP, "false");
  assert.equal(values.VITE_BACKEND_ORIGIN, "https://api.tatakai.me");
  assert.equal(
    values.VITE_ANILIST_REDIRECT_URI,
    "https://tatakai.me/integration/anilist/redirect"
  );
  assert.deepEqual(dotenv.parse(serializeClientEnv(values)), values);
});
test("desktop configuration does not inherit website-only mode switches", () => {
  const values = clientBuildEnv(source, "desktop");
  assert.equal(values.VITE_APP_MODE, undefined);
  assert.equal(values.VITE_FORCE_NATIVE_APP, undefined);
});
test("missing OAuth IDs and invalid production callbacks stop the build", () => {
  assert.throws(
    () =>
      clientBuildEnv(
        source.replace("VITE_MAL_CLIENT_ID=123", "VITE_MAL_CLIENT_ID=")
      ),
    /VITE_MAL_CLIENT_ID/
  );
  assert.throws(
    () =>
      clientBuildEnv(source, "web", {
        VITE_ANILIST_REDIRECT_URI: "http://localhost/callback",
      }),
    /Invalid production callback/
  );
});
