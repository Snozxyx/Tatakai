package app.tatakai.me.security;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.ViewGroup;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * CloudflareBypass — on-device Cloudflare challenge solving for the mobile
 * loopback proxy, the counterpart to desktop's Playwright/FlareSolverr stack
 * ({@code desktop/runtime/proxy/cloudflare-bypass.cjs}).
 *
 * Desktop visits the target in headless Chromium, harvests the
 * {@code cf_clearance} cookie + solved User-Agent, and replays them on
 * upstream fetches. Mobile has no headless Chromium, so this class solves in
 * a hidden platform WebView instead (same cookie-merge semantics), with an
 * optional user-provided FlareSolverr server as the high-reliability path
 * (same request/response protocol as desktop's FlareSolverr mode).
 *
 * Policy mirrors desktop exactly:
 * <ul>
 *   <li>Only {@link #CLOUDFLARE_DOMAINS} hosts are ever solved (verbatim copy
 *       of the desktop list).</li>
 *   <li>Sessions are cached per domain (≈20min); failures cool down 5min.</li>
 *   <li>A 403/503/429 is only treated as a challenge when the body carries
 *       challenge markers — plain origin errors relay as-is.</li>
 *   <li>Solving never hard-fails a fetch: on any solver failure the request
 *       proceeds with/without stale cookies, exactly like desktop's
 *       "continuing anyway".</li>
 *   <li>Turnstile/captcha challenges cannot be auto-solved anywhere
 *       (desktop included) — those still fail closed with the origin status.</li>
 * </ul>
 */
public final class CloudflareBypass {

    private static final String TAG = "CloudflareBypass";
    private static final String PREFS = "tatakai-security";
    private static final String KEY_ENABLED = "cf_bypass_enabled";
    private static final String KEY_FLARESOLVERR_URL = "flaresolverr_url";

    /** Solve budget per attempt (desktop: 45s visiting homepage then target). */
    private static final long SOLVE_TIMEOUT_MS = 45_000L;
    /** Session TTL (desktop: clearance expiry −60s, cap 2h, else 20min). */
    private static final long SESSION_TTL_MS = 20L * 60L * 1000L;
    /** Failure cooldown per host (desktop: 5min). */
    private static final long FAILURE_COOLDOWN_MS = 5L * 60L * 1000L;
    /** Bounded peek for challenge detection (markers live in the first KBs). */
    private static final int CHALLENGE_PEEK_BYTES = 64 * 1024;

    /**
     * Domains known to use Cloudflare protection — verbatim copy of desktop's
     * {@code CLOUDFLARE_DOMAINS} (local-proxy-server.cjs). Keep in sync.
     */
    private static final Set<String> CLOUDFLARE_DOMAINS = new HashSet<>(Arrays.asList(
        "animepahe.com", "animepahe.ru", "senshi.live", "senshianime.com",
        "aniworld.to", "4anime.gg", "mkissa.com", "anizone.to",
        "animesalt.com", "animeya.cc", "animeya.to", "toonstream.co",
        "animelok.xyz", "animelok.com", "watchanimeworld.com",
        "desidubbed.in", "hindidubbed.in", "reanime.to", "reanime.net",
        "anikoto.to",
        "weebcentral.com", "nelomanga.com", "toongod.org", "www.toongod.org",
        "mangadot.net", "www.mangadot.net", "mangaball.net", "www.mangaball.net",
        "bulbasaur.poke-black-and-white.net", "heracross.red-and-blue.net",
        "api.comick.dev",
        "webnovel.com", "novelfull.com", "royalroad.com", "justlightnovels.com",
        "lightnovel.to", "novelbuddy.me", "novelbuddy.com", "novelfire.net",
        "novelbin.com", "readnovelfull.com", "novelcool.com", "novgo.net",
        "re-library.com", "woopread.com", "wuxiaworld.site", "divinedaolibrary.com",
        "toonily.com", "onisaga.com"
    ));

    /** Challenge body markers (desktop cloudflare-bypass `isChallengeResponse`). */
    private static final String[] CHALLENGE_MARKERS = {
        "cf-browser-verification", "cf_chl_", "cf-chl-", "challenge-platform",
        "turnstile", "just a moment", "attention required", "__cf_chl_tk",
        "cf_clearance"
    };

    /** Solved session for one domain: replay cookies + solved User-Agent. */
    public static final class Session {
        public final String cookies;
        public final String userAgent;
        public final long expiresAt;

        Session(String cookies, String userAgent, long expiresAt) {
            this.cookies = cookies != null ? cookies : "";
            this.userAgent = userAgent;
            this.expiresAt = expiresAt;
        }

        boolean isValid() {
            return System.currentTimeMillis() < expiresAt;
        }
    }

    private static final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private static final Map<String, Long> cooldownUntil = new ConcurrentHashMap<>();
    private static final Map<String, Future<Session>> inflight = new ConcurrentHashMap<>();
    private static final ExecutorService solverExecutor = Executors.newCachedThreadPool();

    private static volatile boolean enabled = true;
    private static volatile String flaresolverrUrl = "";
    private static volatile boolean prefsLoaded = false;

    private CloudflareBypass() {}

    // ── Config ────────────────────────────────────────────────────────────

    private static synchronized void ensurePrefs(Context context) {
        if (prefsLoaded) return;
        prefsLoaded = true;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, 0);
            enabled = prefs.getBoolean(KEY_ENABLED, true);
            String url = prefs.getString(KEY_FLARESOLVERR_URL, "");
            flaresolverrUrl = url != null ? url.trim() : "";
        } catch (Exception ignored) {}
    }

    /** Called by the `setCloudflareConfig` plugin method (settings UI). */
    public static synchronized void setConfig(Context context, boolean enabledValue, String serverUrl) {
        String nextUrl = serverUrl != null ? serverUrl.trim() : "";
        if (enabled != enabledValue || !flaresolverrUrl.equals(nextUrl)) {
            sessions.clear(); cooldownUntil.clear();
        }
        enabled = enabledValue;
        flaresolverrUrl = serverUrl != null ? serverUrl.trim() : "";
        prefsLoaded = true;
        try {
            context.getSharedPreferences(PREFS, 0).edit()
                .putBoolean(KEY_ENABLED, enabled)
                .putString(KEY_FLARESOLVERR_URL, flaresolverrUrl)
                .apply();
        } catch (Exception ignored) {}
    }

    public static boolean isEnabled(Context context) {
        ensurePrefs(context);
        return enabled;
    }

    public static String getFlaresolverrUrl(Context context) {
        ensurePrefs(context);
        return flaresolverrUrl;
    }

    /** True when this host may need challenge solving at all. */
    public static boolean appliesTo(String host) {
        if (host == null || host.isEmpty()) return false;
        String h = host.toLowerCase(Locale.US);
        if (CLOUDFLARE_DOMAINS.contains(h)) return true;
        for (String suffix : CLOUDFLARE_DOMAINS) {
            if (h.endsWith("." + suffix)) return true;
        }
        return false;
    }

    // ── Challenge detection ───────────────────────────────────────────────

    /** Desktop `isChallengeResponse` parity: status + body markers. */
    public static boolean isChallengeResponse(int status, String bodySnippet) {
        if (status != 200 && status != 403 && status != 503 && status != 429) return false;
        if (bodySnippet == null) return false;
        String lower = bodySnippet.toLowerCase(Locale.US);
        for (String marker : CHALLENGE_MARKERS) {
            if (status == 200 && (marker.equals("turnstile") || marker.equals("attention required") || marker.equals("cf_clearance"))) continue;
            if (lower.contains(marker)) return true;
        }
        // Short body + CF ray header footprint (desktop's short-body heuristic).
        return lower.length() < 4096 && (lower.contains("cloudflare") || lower.contains("cf-ray"));
    }

    // ── Session handling ──────────────────────────────────────────────────

    private static Session validSession(String host) {
        Session s = sessions.get(host);
        if (s != null && s.isValid()) return s;
        if (s != null) sessions.remove(host);
        return null;
    }

    public static void clearSession(String host) {
        if (host != null) sessions.remove(host.toLowerCase(Locale.US));
    }

    /**
     * Non-blocking pre-merge: replay a cached session's cookies (+ solved UA)
     * into outbound headers. Desktop cookie-merge semantics: append to any
     * existing Cookie with "; ", overwrite User-Agent.
     */
    public static void prepare(String targetUrl, Map<String, String> headers) {
        if (!enabled || targetUrl == null || headers == null) return;
        String host = AdHosts.hostnameOf(targetUrl);
        if (!appliesTo(host)) return;
        Session s = validSession(host);
        if (s == null) return;
        mergeSession(headers, s);
    }

    private static void mergeSession(Map<String, String> headers, Session s) {
        if (s.cookies != null && !s.cookies.isEmpty()) {
            String existing = null;
            String existingKey = null;
            for (Map.Entry<String, String> e : headers.entrySet()) {
                if (e.getKey() != null && e.getKey().equalsIgnoreCase("Cookie")) {
                    existingKey = e.getKey();
                    existing = e.getValue();
                    break;
                }
            }
            List<String> pairs = new ArrayList<>();
            if (existing != null) for (String part : existing.split(";")) {
                String pair = part.trim();
                if (!pair.isEmpty() && !pair.startsWith("cf_clearance=")) pairs.add(pair);
            }
            pairs.add(s.cookies);
            String merged = joinPairs(pairs);
            headers.put(existingKey != null ? existingKey : "Cookie", merged);
        }
        if (s.userAgent != null && !s.userAgent.isEmpty()) {
            String uaKey = null;
            for (String k : headers.keySet()) {
                if (k != null && k.equalsIgnoreCase("User-Agent")) {
                    uaKey = k;
                    break;
                }
            }
            headers.put(uaKey != null ? uaKey : "User-Agent", s.userAgent);
        }
    }

    /**
     * Blocking solve with dedupe: concurrent callers for one host share a
     * single attempt (desktop `inflight` parity). FlareSolverr first when a
     * server is configured (desktop precedence), else the hidden WebView.
     * Never throws — returns null when solving is disabled, cooling down, or
     * failed, and the caller proceeds without a session ("continuing anyway").
     */
    public static Session solveBlocking(Context context, String targetUrl) {
        if (context == null || targetUrl == null) return null;
        if (Looper.myLooper() == Looper.getMainLooper()) return null;
        ensurePrefs(context);
        if (!enabled) return null;
        String host;
        try {
            host = AdHosts.hostnameOf(targetUrl);
        } catch (Exception e) {
            return null;
        }
        if (!appliesTo(host)) return null;
        Session cached = validSession(host);
        if (cached != null) return cached;
        Long cool = cooldownUntil.get(host);
        if (cool != null && System.currentTimeMillis() < cool) return null;

        FutureTask<Session> task = new FutureTask<>(() -> {
            long deadline = System.currentTimeMillis() + SOLVE_TIMEOUT_MS;
            Session solved = tryFlaresolverr(targetUrl);
            if (solved == null) solved = solveViaWebView(context, targetUrl, host, deadline);
            long now = System.currentTimeMillis();
            if (solved != null && enabled) {
                sessions.put(host, solved);
            } else {
                cooldownUntil.put(host, now + FAILURE_COOLDOWN_MS);
            }
            return solved;
        });
        Future<Session> previous = inflight.get(host);
        if (previous != null && previous.isDone()) inflight.remove(host, previous);
        Future<Session> running = inflight.putIfAbsent(host, task);
        if (running == null) {
            running = task;
            solverExecutor.execute(task);
        }
        try {
            // Budget covers the solve plus margin; the future itself enforces
            // the per-attempt timeouts.
            return running.get(SOLVE_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            return validSession(host);
        } finally {
            if (running.isDone()) inflight.remove(host, running);
        }
    }

    // ── FlareSolverr path ─────────────────────────────────────────────────

    private static Session tryFlaresolverr(String targetUrl) {
        String server = flaresolverrUrl;
        if (server == null || server.isEmpty()) return null;
        HttpURLConnection conn = null;
        try {
            String base = server.replaceAll("/+$", "");
            String endpoint = base.endsWith("/v1") ? base : base + "/v1";
            JSONObject payload = new JSONObject();
            payload.put("cmd", "request.get");
            payload.put("url", targetUrl);
            payload.put("maxTimeout", 23000);
            byte[] body = payload.toString().getBytes("UTF-8");
            conn = (HttpURLConnection) new URL(endpoint).openConnection();
            conn.setConnectTimeout(3_000);
            conn.setReadTimeout(25_000);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            OutputStream out = conn.getOutputStream();
            out.write(body);
            out.flush();
            out.close();
            if (conn.getResponseCode() != 200) return null;
            JSONObject res = new JSONObject(readAll(conn.getInputStream()));
            if (!"ok".equalsIgnoreCase(res.optString("status"))) {
                Log.w(TAG, "FlareSolverr refused: " + res.optString("message"));
                return null;
            }
            JSONObject solution = res.optJSONObject("solution");
            if (solution == null) return null;
            JSONArray cookies = solution.optJSONArray("cookies");
            List<String> pairs = new ArrayList<>();
            if (cookies != null) {
                for (int i = 0; i < cookies.length(); i++) {
                    JSONObject c = cookies.optJSONObject(i);
                    if (c == null) continue;
                    String name = c.optString("name", "");
                    String value = c.optString("value", "");
                    String domain = c.optString("domain", "").replaceFirst("^\\.+", "").toLowerCase(Locale.US);
                    String host = new URL(targetUrl).getHost().toLowerCase(Locale.US);
                    if (name.equals("cf_clearance") && !value.isEmpty() && !domain.isEmpty()
                        && (host.equals(domain) || host.endsWith("." + domain))) pairs.add(name + "=" + value);
                }
            }
            String ua = solution.optString("userAgent", "");
            if (pairs.isEmpty() || ua.isEmpty()) return null;
            long expiry = System.currentTimeMillis() + SESSION_TTL_MS;
            return new Session(joinPairs(pairs), ua.isEmpty() ? null : ua, expiry);
        } catch (Exception e) {
            Log.w(TAG, "FlareSolverr solve failed: " + e.getMessage());
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String joinPairs(List<String> pairs) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < pairs.size(); i++) {
            if (i > 0) sb.append("; ");
            sb.append(pairs.get(i));
        }
        return sb.toString();
    }

    // ── Hidden-WebView path ───────────────────────────────────────────────

    private static Session solveViaWebView(Context context, String targetUrl, String host, long deadline) {
        // The WebView itself must live on the main thread; the polling loop
        // below runs on the calling (proxy worker) thread, which is allowed to
        // block bounded — CookieManager reads are thread-safe.
        final WebView[] holder = new WebView[1];
        final String[] userAgent = new String[1];
        final AtomicBoolean abandoned = new AtomicBoolean(false);
        final CountDownLatch created = new CountDownLatch(1);
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                if (abandoned.get() || System.currentTimeMillis() >= deadline) return;
                if (!(context instanceof Activity) || ((Activity) context).isFinishing()) return;
                WebView webView = new WebView(context);
                holder[0] = webView;
                WebSettings settings = webView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setLoadWithOverviewMode(true);
                settings.setUseWideViewPort(true);
                userAgent[0] = settings.getUserAgentString();
                CookieManager.getInstance().setAcceptCookie(true);
                webView.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                        String scheme = request.getUrl().getScheme();
                        return !"https".equals(scheme) && !"http".equals(scheme);
                    }
                });
                ViewGroup root = (ViewGroup) ((Activity) context).getWindow().getDecorView();
                webView.setTranslationX(-2); webView.setTranslationY(-2);
                root.addView(webView, new ViewGroup.LayoutParams(1, 1));
                // Clear rejected clearance before polling; otherwise an old
                // cookie would look like an immediately successful solve.
                CookieManager.getInstance().setCookie(targetUrl, "cf_clearance=; Max-Age=0; Path=/", ignored -> webView.loadUrl(targetUrl));
            } catch (Exception e) {
                Log.w(TAG, "WebView solve setup failed for " + host + ": " + e.getMessage());
            } finally {
                created.countDown();
            }
        });
        try {
            if (!created.await(Math.max(1, Math.min(10000, deadline - System.currentTimeMillis())), TimeUnit.MILLISECONDS)) { abandoned.set(true); return null; }
        } catch (InterruptedException e) {
            abandoned.set(true);
            Thread.currentThread().interrupt();
            return null;
        }
        final WebView webView = holder[0];
        if (webView == null) return null;
        try {
            while (System.currentTimeMillis() < deadline) {
                String cookies = null;
                try {
                    cookies = CookieManager.getInstance().getCookie(targetUrl);
                } catch (Exception ignored) {}
                if (cookies != null && !extractClearance(cookies).isEmpty()) {
                    return new Session(
                        extractClearance(cookies),
                        userAgent[0],
                        System.currentTimeMillis() + SESSION_TTL_MS);
                }
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        } finally {
            // Teardown must also happen on the main thread; post-and-forget is
            // fine — the verdict above is already decided.
            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    webView.stopLoading();
                    if (webView.getParent() instanceof ViewGroup) ((ViewGroup) webView.getParent()).removeView(webView);
                    webView.loadUrl("about:blank");
                    webView.destroy();
                } catch (Exception ignored) {}
            });
        }
        Log.w(TAG, "WebView solve timed out for " + host);
        return null;
    }

    /**
     * Keep only the clearance pair(s); replaying the jar's analytics cookies
     * would leak tracker state into every upstream fetch.
     */
    private static String extractClearance(String cookieHeader) {
        if (cookieHeader == null) return "";
        List<String> keep = new ArrayList<>();
        for (String part : cookieHeader.split(";")) {
            String trimmed = part.trim();
            if (trimmed.startsWith("cf_clearance=")) keep.add(trimmed);
        }
        return joinPairs(keep);
    }

    private static String readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream(32 * 1024);
        byte[] chunk = new byte[16 * 1024];
        int count;
        while ((count = in.read(chunk)) >= 0) {
            if (bos.size() + count > CHALLENGE_PEEK_BYTES * 4) break;
            bos.write(chunk, 0, count);
        }
        return bos.toString("UTF-8");
    }
}
