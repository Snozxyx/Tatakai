import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";

// Public browser/app configuration only. Never copy every VITE_* key blindly.
const publicKeys = new Set(
  `SUPABASE_URL SUPABASE_ANON_KEY BACKEND_ORIGIN TATAKAI_API_URL API_ORIGIN API_V3_ORIGIN API_BASE_URL
MAL_CLIENT_ID MAL_REDIRECT_URI MAL_DESKTOP_REDIRECT_URI ANILIST_CLIENT_ID ANILIST_REDIRECT_URI ANILIST_DESKTOP_REDIRECT_URI MANGABAKA_CLIENT_ID MANGABAKA_REDIRECT_URI
EXTENSION_API_URL EXTENSION_ASSET_BASE EXTENSION_PORTAL_URL OPERATIONS_AUTH_ENABLED TURNSTILE_SITE_KEY POSTHOG_KEY POSTHOG_HOST
DD_CLIENT_TOKEN DD_SITE GA_MEASUREMENT_ID GIPHY_API_KEY DISCORD_CLIENT_ID DISCORD_GUILD_ID DISCORD_INVITE PUBLIC_DOMAIN
SENTRY_DSN SENTRY_ENV SENTRY_TRACES_SAMPLE_RATE ALWAYS_FRESH_MANGA_READS ENABLE_COMBINED_SOURCE_CACHE LOG_FRONTEND_ERRORS_TO_DB
PROXY_CF_URL PROXY_NODE_URL PROXY_BUN_URL PROXY_PASSWORD SINGLE_STREAM_PROXY_URL STREAM_PROXY_URL STREAM_PROXY_PASSWORD`
    .split(/\s+/)
    .map((key) => "VITE_" + key)
);
export function clientBuildEnv(source, profile = "web", overrides = {}) {
  if (!["web", "desktop", "mobile"].includes(profile))
    throw Error("Expected web, desktop or mobile build profile");
  const raw = {
    ...dotenv.parse(source),
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([, value]) => typeof value === "string" && value.trim()
      )
    ),
  };
  const values = Object.fromEntries(
    Object.entries(raw).filter(
      ([key, value]) => publicKeys.has(key) && value.trim()
    )
  );
  for (const key of [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_MAL_CLIENT_ID",
    "VITE_ANILIST_CLIENT_ID",
  ]) {
    if (!values[key] || /^(your_|replace_)/i.test(values[key]))
      throw Error("Missing required public build setting: " + key);
  }
  // Production artifacts must never inherit local development origins.
  Object.assign(values, {
    VITE_SUPABASE_URL: "https://db.tatakai.me",
    VITE_BACKEND_ORIGIN: "https://api.tatakai.me",
    VITE_API_ORIGIN: "https://api.tatakai.me",
    VITE_API_V3_ORIGIN: "https://api.tatakai.me",
    VITE_API_BASE_URL: "https://api.tatakai.me/api/v3",
    VITE_TATAKAI_API_URL: "https://api.tatakai.me/api/v3",
  });
  values.VITE_MAL_REDIRECT_URI = "https://tatakai.me/api/mal/redirect";
  values.VITE_ANILIST_REDIRECT_URI =
    values.VITE_ANILIST_REDIRECT_URI ||
    "https://tatakai.me/integration/anilist/redirect";
  values.VITE_MANGABAKA_REDIRECT_URI =
    values.VITE_MANGABAKA_REDIRECT_URI ||
    "https://tatakai.me/integration/mangabaka/redirect";
  for (const key of [
    "VITE_ANILIST_REDIRECT_URI",
    "VITE_MANGABAKA_REDIRECT_URI",
  ]) {
    const urls = values[key].split(/[\s,]+/);
    const selected = urls.find((value) => {
      try {
        return (
          new URL(value).protocol === "https:" &&
          new URL(value).hostname === "tatakai.me"
        );
      } catch {
        return false;
      }
    });
    if (!selected) throw Error("Invalid production callback: " + key);
    values[key] = selected;
  }
  if (profile === "web")
    Object.assign(values, {
      VITE_APP_MODE: "web",
      VITE_APP_PLATFORM: "web",
      VITE_FORCE_NATIVE_APP: "false",
      VITE_DISABLE_NATIVE_FEATURES: "true",
      VITE_TV_MODE: "false",
    });
  return values;
}
export function serializeClientEnv(values) {
  return (
    Object.entries(values)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => key + "=" + JSON.stringify(value))
      .join("\n") + "\n"
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const profile = process.argv[2] || "web";
    const source =
      process.env.CLIENT_DOTENV || process.env.DESKTOP_DOTENV || "";
    const values = clientBuildEnv(source, profile, process.env);
    fs.writeFileSync(
      profile === "web" ? ".env.web.local" : ".env.local",
      serializeClientEnv(values),
      { mode: 0o600 }
    );
    console.log(
      "Prepared " +
        profile +
        " build configuration (" +
        Object.keys(values).length +
        " public settings; values hidden)"
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
