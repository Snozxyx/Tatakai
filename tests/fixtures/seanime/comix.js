/**
 * Comix manga provider. Loads the site's current security module to sign requests and
 * decode responses. Browser globals stay in a private scope; Seanime's APIs are untouched.
 * Requests start without a cookie. A Cloudflare challenge opens Chrome on the Seanime host
 * and captures its clearance and matching User-Agent, without DevTools or copy/paste.
 */
const SITE_URL = "https://comix.to";
const API_URL = `${SITE_URL}/api/v1`;
const IMAGE_ACCEPT = "image/avif,image/webp,image/apng,image/*,*/*;q=0.8";
const MODULE_KEY = "comix:security-module:v3";
const SESSION_KEY = "comix:browser-session:v3";
const SESSION_LEASE_KEY = "comix:session-lease:v3";
const DEFAULT_USER_AGENT = "Mozilla/5.0";
const B64_URL_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const CHAPTERS_PER_PAGE = 100;
const MAX_CHAPTER_PAGES = 200;
const CHAPTER_BATCH_SIZE = 4;
const MIN_MS_PER_REQUEST = 200;
const RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 3000;
const SESSION_TIMEOUT_MS = 120000;
const SESSION_LEASE_MS = SESSION_TIMEOUT_MS + 60000;
let modulePromise = null;
let moduleUserAgent = "";
let sessionPromise = null;

function fail(message) {
    console.error(message);
    return message;
}
function errorText(error) {
    return String((error && error.message) || error).slice(0, 300);
}
function readStoredJson(key) {
    try {
        return JSON.parse($store.get(key) || "null");
    } catch {
        return null;
    }
}
function describeRequest(path, params) {
    return params && params.page ? `${path} page ${params.page}` : path;
}
function requireList(value, label, field) {
    if (Array.isArray(value)) return value;
    throw fail(
        `Comix: ${label} returned no ${field} list. Retry, or update the extension if the API changed.`,
    );
}
function header(response, name) {
    const headers = response.headers || {};
    const key = Object.keys(headers).find(
        (key) => key.toLowerCase() === name.toLowerCase(),
    );
    return key ? headers[key] : "";
}
function isCloudflareChallenge(response, text) {
    return (
        header(response, "cf-mitigated") === "challenge" ||
        /<title>\s*just a moment|<title>\s*attention required/i.test(text) ||
        (response.status === 403 && /challenge-platform/i.test(text))
    );
}
function retryDelayMs(response) {
    const seconds = parseInt(
        response ? header(response, "retry-after") : "",
        10,
    );
    return isNaN(seconds)
        ? RETRY_DELAY_MS
        : Math.min(Math.max(seconds, 0) * 1000, MAX_RETRY_DELAY_MS);
}
function isComixUrl(value) {
    try {
        const url = new URL(String(value || ""));
        const host = url.hostname.toLowerCase();
        return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            (host === "comix.to" || host.endsWith(".comix.to"))
        );
    } catch {
        return false;
    }
}

/** Serializes Axios parameters, including bracketed objects and arrays. */
function queryEntries(params) {
    const entries = [];
    const add = (key, value) => {
        if (value === null || value === undefined) return;
        if (typeof value === "object") {
            Object.keys(value).forEach((child) =>
                add(
                    Array.isArray(value) ? `${key}[]` : `${key}[${child}]`,
                    value[child],
                ),
            );
        } else entries.push([key, String(value)]);
    };
    Object.keys(params || {}).forEach((key) => add(key, params[key]));
    return entries;
}

/** Converts our flat bracket keys to the objects expected by the site's interceptor. */
function axiosParams(params) {
    const result = {};
    Object.keys(params).forEach((key) => {
        const match = key.match(/^([^[]+)\[([^\]]+)\]$/);
        if (match) {
            if (!result[match[1]]) result[match[1]] = {};
            result[match[1]][match[2]] = params[key];
        } else result[key] = params[key];
    });
    return result;
}

/** Encodes a string as UTF-8 bytes. */
function utf8Encode(text) {
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
        let code = text.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
            const low = text.charCodeAt(i + 1);
            if (low >= 0xdc00 && low <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                i++;
            }
        }
        if (code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
        } else if (code < 0x10000) {
            bytes.push(
                0xe0 | (code >> 12),
                0x80 | ((code >> 6) & 63),
                0x80 | (code & 63),
            );
        } else {
            bytes.push(
                0xf0 | (code >> 18),
                0x80 | ((code >> 12) & 63),
                0x80 | ((code >> 6) & 63),
                0x80 | (code & 63),
            );
        }
    }
    return bytes;
}

/** Decodes UTF-8 bytes into a string. */
function utf8Decode(bytes) {
    let text = "";
    for (let i = 0; i < bytes.length;) {
        const lead = bytes[i++];
        let code;
        if (lead < 0x80) {
            code = lead;
        } else if (lead >= 0xf0) {
            code =
                ((lead & 7) << 18) |
                ((bytes[i++] & 63) << 12) |
                ((bytes[i++] & 63) << 6) |
                (bytes[i++] & 63);
        } else if (lead >= 0xe0) {
            code =
                ((lead & 15) << 12) |
                ((bytes[i++] & 63) << 6) |
                (bytes[i++] & 63);
        } else {
            code = ((lead & 31) << 6) | (bytes[i++] & 63);
        }
        if (code > 0xffff) {
            code -= 0x10000;
            text += String.fromCharCode(
                0xd800 + (code >> 10),
                0xdc00 + (code & 1023),
            );
        } else {
            text += String.fromCharCode(code);
        }
    }
    return text;
}

/** Encodes bytes as base64url without padding. */
function base64UrlEncode(bytes) {
    let text = "";
    let bits = 0;
    let bitCount = 0;
    for (let i = 0; i < bytes.length; i++) {
        bits = ((bits << 8) | bytes[i]) & 0xffff;
        bitCount += 8;
        while (bitCount >= 6) {
            bitCount -= 6;
            text += B64_URL_ALPHABET.charAt((bits >> bitCount) & 63);
        }
    }
    if (bitCount > 0) {
        text += B64_URL_ALPHABET.charAt((bits << (6 - bitCount)) & 63);
    }
    return text;
}

/** Decodes standard or url-safe base64, with or without padding. */
function base64Decode(text) {
    const bytes = [];
    let bits = 0;
    let bitCount = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i);
        let value = B64_URL_ALPHABET.indexOf(ch);
        if (ch === "+") value = 62;
        if (ch === "/") value = 63;
        if (value < 0) continue;
        bits = ((bits << 6) | value) & 0xffff;
        bitCount += 6;
        if (bitCount >= 8) {
            bitCount -= 8;
            bytes.push((bits >> bitCount) & 255);
        }
    }
    return bytes;
}

// ---------------------------------------------------------------------------------------------
// Cipher
// ---------------------------------------------------------------------------------------------

/** Loads only the security module, with browser shims scoped to this module's functions. */
function installSecurityModule(source, userAgent) {
    const exportIndex = source.lastIndexOf("export");
    if (exportIndex < 0 || !/^export\s*\{/.test(source.slice(exportIndex)))
        throw fail(
            "Comix: the site's security module format changed. Update the extension.",
        );
    // Goja cannot parse async generators. This empty generator is a feature probe in the
    // current obfuscator; the throwing replacement selects its unsupported-feature branch.
    const body = source
        .slice(0, exportIndex)
        .replace(
            /async\s+function\s*\*\s*\(\)\s*\{\s*\}/g,
            "(function(){throw 0})()",
        );
    const noop = () => {};
    const memory = () => {
        const values = {};
        return {
            getItem: (key) => (values[key] === undefined ? null : values[key]),
            setItem: (key, value) => {
                values[key] = String(value);
            },
            removeItem: (key) => {
                delete values[key];
            },
        };
    };
    const scope = {
        // Reduce direct access to Seanime APIs. This scope is not a security sandbox:
        // JavaScript intrinsics still belong to the host realm.
        $store: undefined,
        $getUserPreference: undefined,
        $sleep: undefined,
        fetch: undefined,
        ChromeDP: undefined,
        document: {
            cookie: "",
            referrer: "",
            title: "Comix",
            createElement: () => ({ style: {} }),
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: noop,
            removeEventListener: noop,
            body: { appendChild: noop },
            documentElement: { appendChild: noop },
        },
        location: {
            href: `${SITE_URL}/`,
            hostname: "comix.to",
            host: "comix.to",
            origin: SITE_URL,
            protocol: "https:",
            pathname: "/",
            reload: noop,
        },
        navigator: { appCodeName: "Mozilla", userAgent },
        localStorage: memory(),
        sessionStorage: memory(),
        setTimeout: noop,
        setInterval: noop,
        clearTimeout: noop,
        clearInterval: noop,
        addEventListener: noop,
        removeEventListener: noop,
        TextEncoder: function () {
            this.encode = (text) =>
                new Uint8Array(
                    utf8Encode(String(text === undefined ? "" : text)),
                );
        },
        TextDecoder: function () {
            this.decode = (bytes) =>
                utf8Decode(bytes ? new Uint8Array(bytes.buffer || bytes) : []);
        },
        atob: (text) =>
            base64Decode(String(text))
                .map((byte) => String.fromCharCode(byte))
                .join(""),
        btoa: (text) => {
            const encoded = base64UrlEncode(
                String(text)
                    .split("")
                    .map((char) => char.charCodeAt(0)),
            )
                .replace(/-/g, "+")
                .replace(/_/g, "/");
            return encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
        },
    };
    scope.window = scope;
    scope.self = scope;
    scope.global = scope;
    scope.globalThis = scope;
    const names = Object.keys(scope);
    try {
        new Function(...names, body)(...names.map((name) => scope[name]));
        // Aidoku discovers the installer by its interceptor registrations, avoiding export
        // names that change with each build. Only inspect vm objects created in this scope.
        const vmKey = Object.keys(scope).find(
            (key) =>
                /^vm/.test(key) && scope[key] && typeof scope[key] === "object",
        );
        if (!vmKey) throw "security VM missing";
        const vm = scope[vmKey];
        for (const key of Object.keys(vm)) {
            if (typeof vm[key] !== "function") continue;
            let request, response;
            try {
                vm[key]({
                    interceptors: {
                        request: {
                            use: (fn) => {
                                request = fn;
                            },
                        },
                        response: {
                            use: (fn) => {
                                response = fn;
                            },
                        },
                    },
                });
            } catch {
                continue;
            }
            if (typeof request === "function" && typeof response === "function")
                return { request, response };
        }
        throw "interceptors missing";
    } catch (error) {
        throw fail(
            `Comix: could not initialize the site's current security module (${errorText(error)}). Update the extension.`,
        );
    }
}

class Provider {
    constructor() {
        this.api = SITE_URL;
        this.apiUrl = API_URL;
    }
    getSettings() {
        return { supportsMultiLanguage: false, supportsMultiScanlator: true };
    }

    /** Manual settings override the automatically captured session when both are supplied. */
    readCredentials() {
        const raw = String($getUserPreference("cfClearance") || "").trim();
        const match = raw.match(/cf_clearance=([^;\s]+)/);
        const cookie = (match ? match[1] : raw).replace(/^["']|["']$/g, "");
        const userAgent = String($getUserPreference("userAgent") || "")
            .trim()
            .replace(/^["']|["']$/g, "");
        if (cookie || userAgent) {
            if (!cookie || !userAgent)
                throw fail(
                    "Comix: supply both manual cookie and User-Agent, or clear both fields to use automatic setup.",
                );
            return { cookie, userAgent, manual: true };
        }
        const session = readStoredJson(SESSION_KEY);
        if (
            session &&
            session.cookie &&
            session.userAgent &&
            session.expiresAt > Date.now()
        )
            return session;
        return { cookie: "", userAgent: DEFAULT_USER_AGENT };
    }
    async send(url, credentials, extraHeaders) {
        const headers = {
            Accept: "application/json, text/plain, */*",
        };
        Object.keys(extraHeaders || {}).forEach((name) => {
            // Preserve signature headers without allowing the module to replace the
            // clearance pair or override the destination's Host header.
            if (!/^(cookie|user-agent|host)$/i.test(name)) {
                const previous = Object.keys(headers).find(
                    (key) => key.toLowerCase() === name.toLowerCase(),
                );
                if (previous) delete headers[previous];
                headers[name] = extraHeaders[name];
            }
        });
        headers["User-Agent"] = credentials.userAgent;
        if (credentials.cookie)
            headers.Cookie = `cf_clearance=${credentials.cookie}`;
        return fetch(url, { headers });
    }

    /** Opens a dedicated visible browser only when the site actually requires clearance. */
    async captureSession() {
        let browser;
        try {
            browser = await ChromeDP.newBrowser({
                headless: false,
                timeout: 20,
            });
            console.log(
                "Comix: complete the Cloudflare check in the Chrome window on the Seanime host. Setup will finish automatically.",
            );
            const deadline = Date.now() + SESSION_TIMEOUT_MS;
            try {
                await browser.navigate(SITE_URL);
            } catch {
                /* Navigation may time out while the challenge is displayed. */
            }
            while (Date.now() < deadline) {
                let state, result;
                try {
                    state = JSON.parse(
                        await browser.evaluate(
                            "JSON.stringify({title:document.title,userAgent:navigator.userAgent})",
                        ),
                    );
                    result = await browser.executeCDP("Network.getCookies", {
                        urls: [SITE_URL],
                    });
                } catch (error) {
                    // A completed Cloudflare check can reload the page between CDP calls.
                    // Keep polling through navigation, but report a closed browser immediately.
                    if (
                        !/execution context.*destroyed|cannot find context|inspected target navigated/i.test(
                            errorText(error),
                        )
                    )
                        throw error;
                    await browser.sleep(1000);
                    continue;
                }
                const cookie = (result.cookies || []).find(
                    (cookie) => cookie.name === "cf_clearance",
                );
                if (
                    cookie &&
                    !/just a moment|attention required|security check/i.test(
                        state.title,
                    )
                ) {
                    const session = {
                        cookie: cookie.value,
                        userAgent: state.userAgent,
                        expiresAt:
                            cookie.expires > 0
                                ? cookie.expires * 1000
                                : Date.now() + 30 * 60 * 1000,
                    };
                    $store.set(SESSION_KEY, JSON.stringify(session));
                    return session;
                }
                await browser.sleep(1000);
            }
            throw "timed out waiting for clearance";
        } catch (error) {
            throw fail(
                `Comix: automatic browser setup failed (${errorText(error)}). Install Chrome or Chromium on the Seanime host and complete its check there. For a server without a display, enter the optional cookie and matching User-Agent manually.`,
            );
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch {
                    /* Keep the setup result. */
                }
            }
        }
    }

    /** Shares one browser setup between concurrent calls and Seanime's separate runtimes. */
    async automaticSession(rejected) {
        if (rejected.manual)
            throw fail(
                "Comix: Cloudflare rejected the manual cookie. Clear both settings to use automatic setup, or replace both values from the same browser.",
            );
        if (!sessionPromise)
            sessionPromise = this.sessionWithLease(rejected).finally(() => {
                sessionPromise = null;
            });
        return sessionPromise;
    }
    async sessionWithLease(rejected) {
        const deadline = Date.now() + SESSION_LEASE_MS;
        const owner = `${Date.now()}:${Math.random()}`;
        while (Date.now() < deadline) {
            const cached = readStoredJson(SESSION_KEY);
            if (
                cached &&
                cached.cookie !== rejected.cookie &&
                cached.expiresAt > Date.now()
            )
                return cached;
            const lease = readStoredJson(SESSION_LEASE_KEY);
            if (!lease || lease.expiresAt < Date.now()) {
                $store.set(
                    SESSION_LEASE_KEY,
                    JSON.stringify({
                        owner,
                        expiresAt: Date.now() + SESSION_LEASE_MS,
                    }),
                );
                $sleep(50);
                const confirmed = readStoredJson(SESSION_LEASE_KEY);
                if (confirmed && confirmed.owner === owner) {
                    try {
                        return await this.captureSession();
                    } finally {
                        const current = readStoredJson(SESSION_LEASE_KEY);
                        if (current && current.owner === owner)
                            $store.remove(SESSION_LEASE_KEY);
                    }
                }
            }
            $sleep(250);
        }
        throw fail(
            "Comix: timed out waiting for automatic browser setup. Retry.",
        );
    }

    /** Fetches site scripts, retrying a transient failure or one browser challenge. */
    async resource(url) {
        if (!isComixUrl(url))
            throw fail(
                "Comix: refused a security module URL outside comix.to.",
            );
        let credentials = this.readCredentials();
        let retry = true,
            session = true;
        for (;;) {
            let response;
            try {
                response = await this.send(url, credentials);
            } catch (error) {
                if (!retry)
                    throw fail(
                        `Comix: could not load the site's scripts (${errorText(error)}).`,
                    );
                retry = false;
                $sleep(RETRY_DELAY_MS);
                continue;
            }
            const text = response.text();
            if (isCloudflareChallenge(response, text)) {
                if (!session)
                    throw fail(
                        "Comix: Cloudflare still rejects the automatically captured session. Retry or use manual settings.",
                    );
                session = false;
                credentials = await this.automaticSession(credentials);
                continue;
            }
            if (response.status === 200) return text;
            if (retry && (response.status === 429 || response.status >= 500)) {
                retry = false;
                $sleep(retryDelayMs(response));
                continue;
            }
            throw fail(
                `Comix: HTTP ${response.status} loading the site's scripts.`,
            );
        }
    }
    async loadModule(refresh) {
        let cached = refresh ? null : readStoredJson(MODULE_KEY);
        if (!cached || typeof cached.source !== "string") {
            const home = await this.resource(SITE_URL);
            const main = home.match(
                /<script\b[^>]*\bsrc=["']([^"']*\/main-[^"']+\.js)["']/i,
            );
            if (!main)
                throw fail(
                    "Comix: the site's main script was not found. Update the extension.",
                );
            const mainUrl = new URL(main[1], SITE_URL).toString();
            const mainSource = await this.resource(mainUrl);
            const secure = mainSource.match(/secure-[A-Za-z0-9_-]+\.js/);
            if (!secure)
                throw fail(
                    "Comix: the site's security script was not found. Update the extension.",
                );
            // Seanime's URL binding resolves relative paths against the origin, so join the
            // asset directory explicitly instead of relying on browser URL semantics.
            const url =
                mainUrl.slice(0, mainUrl.lastIndexOf("/") + 1) + secure[0];
            cached = { url, source: await this.resource(url) };
        }
        const credentials = this.readCredentials();
        const installed = installSecurityModule(
            cached.source,
            credentials.userAgent,
        );
        $store.set(MODULE_KEY, JSON.stringify(cached));
        moduleUserAgent = credentials.userAgent;
        return installed;
    }
    async getModule(refresh) {
        if (
            refresh ||
            (moduleUserAgent &&
                moduleUserAgent !== this.readCredentials().userAgent)
        )
            modulePromise = null;
        if (!modulePromise) {
            modulePromise = this.loadModule(refresh).catch((error) => {
                modulePromise = null;
                throw error;
            });
        }
        return modulePromise;
    }

    /** Uses the site's Axios interceptors, then restores the envelope expected by our mappers. */
    async apiGet(path, params) {
        const label = describeRequest(path, params);
        let refresh = false,
            refreshLeft = true,
            sessionLeft = true,
            retryLeft = true;
        for (;;) {
            const security = await this.getModule(refresh);
            refresh = false;
            const credentials = this.readCredentials();
            const config = await security.request({
                url: `${API_URL}${path}`,
                method: "GET",
                params: axiosParams(params || {}),
                headers: {},
            });
            const query = queryEntries(config.params)
                .map(
                    ([key, value]) =>
                        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
                )
                .join("&");
            const target = new URL(config.url || `${API_URL}${path}`, API_URL);
            if (
                target.origin !== SITE_URL ||
                target.username ||
                target.password ||
                !target.pathname.startsWith("/api/v1/")
            )
                throw fail(
                    "Comix: refused an interceptor URL outside the Comix API.",
                );
            target.hash = "";
            const url = target.toString();
            const separator = url.includes("?")
                ? /[?&]$/.test(url)
                    ? ""
                    : "&"
                : "?";
            let response;
            try {
                response = await this.send(
                    query ? `${url}${separator}${query}` : url,
                    credentials,
                    config.headers,
                );
            } catch (error) {
                if (!retryLeft)
                    throw fail(
                        `Comix: could not reach ${label} (${errorText(error)}).`,
                    );
                retryLeft = false;
                $sleep(RETRY_DELAY_MS);
                continue;
            }
            const text = response.text();
            if (isCloudflareChallenge(response, text)) {
                if (!sessionLeft)
                    throw fail(
                        "Comix: Cloudflare still rejects the automatically captured session.",
                    );
                sessionLeft = false;
                await this.automaticSession(credentials);
                continue;
            }
            if (/captcha_required/.test(text))
                throw fail(
                    "Comix: the site's firewall requires a captcha. Open comix.to, solve it and retry.",
                );
            if (/(missing|invalid)[_ ]token/i.test(text)) {
                if (!refreshLeft)
                    throw fail(
                        "Comix: the site still rejects tokens after refreshing its security module. Update the extension.",
                    );
                refreshLeft = false;
                refresh = true;
                continue;
            }
            if (response.status !== 200) {
                if (
                    retryLeft &&
                    (response.status === 429 || response.status >= 500)
                ) {
                    retryLeft = false;
                    $sleep(retryDelayMs(response));
                    continue;
                }
                throw fail(`Comix: HTTP ${response.status} from ${label}.`);
            }
            let root;
            try {
                root = JSON.parse(text);
            } catch {
                throw fail(`Comix: non-JSON response from ${label}.`);
            }
            if (root && typeof root.e === "string") {
                try {
                    const decoded = await security.response({
                        data: root,
                        status: response.status,
                        headers: { "x-enc": header(response, "x-enc") },
                        config,
                    });
                    root = decoded.data;
                    if (!root || typeof root.e === "string")
                        throw "encrypted payload was not decoded";
                } catch (error) {
                    if (!refreshLeft)
                        throw fail(
                            `Comix: could not decode ${label} (${errorText(error)}). Update the extension.`,
                        );
                    refreshLeft = false;
                    refresh = true;
                    continue;
                }
            }
            if (
                !root ||
                typeof root !== "object" ||
                Array.isArray(root) ||
                root.error ||
                (root.status && root.status !== "ok")
            )
                throw fail(
                    `Comix: ${label} returned an unexpected response or application error.`,
                );
            return root.result !== undefined ? root : { result: root };
        }
    }
    // -----------------------------------------------------------------------------------------
    // Ids and mapping
    // -----------------------------------------------------------------------------------------

    /** Returns the `<hid>-<slug>` part of a `/title/<hid>-<slug>/...` URL. */
    extractTitleSlug(url) {
        if (!url) return "";

        const value = String(url);
        const marker = "/title/";
        const slug =
            value.indexOf(marker) >= 0
                ? value.slice(value.indexOf(marker) + marker.length)
                : value.replace(/^\/?title\//, "").replace(/^\/+/, "");

        return slug.split(/[/?#]/)[0] || "";
    }

    /** Strips the `<hid>-` prefix from a slug. */
    slugWithoutHash(hashId, slug) {
        const cleanSlug = String(slug || "")
            .trim()
            .replace(/^\/+/, "");
        if (!cleanSlug) return "";
        if (cleanSlug === hashId) return "";
        return cleanSlug.indexOf(`${hashId}-`) === 0
            ? cleanSlug.slice(hashId.length + 1)
            : cleanSlug;
    }

    /** Parses a manga id: `<hid>|<slug>` (current) or `<hid>-<slug>` (legacy). */
    normalizeMangaId(mangaId) {
        const rawId = String(mangaId || "").trim();
        const parts = rawId.split("|");

        let hashId = parts[0] || "";
        let slug = parts[1] || "";

        if (rawId.indexOf("|") < 0 && rawId.indexOf("-") > 0) {
            hashId = rawId.split("-")[0];
            slug = rawId.slice(hashId.length + 1);
        }

        slug = this.slugWithoutHash(hashId, slug);

        return {
            hashId,
            slug,
            fullSlug: slug ? `${hashId}-${slug}` : hashId,
        };
    }

    /** Returns the numeric chapter id from `<hid>|<slug>|<chapterId>|<number>` or a chapter URL. */
    extractNumericChapterId(chapterId) {
        const parts = String(chapterId || "").split("|");
        const raw =
            parts.length >= 3
                ? parts[2]
                : String(chapterId || "")
                      .split("/")
                      .pop();
        const match = String(raw || "").match(/^\d+/);
        return match ? match[0] : "";
    }

    normalizeSynonyms(value) {
        if (!Array.isArray(value)) return [];
        return value
            .map((item) => {
                if (typeof item === "string") return item;
                return item && item.title ? String(item.title) : "";
            })
            .filter((item) => item.length > 0);
    }

    getPosterUrl(item) {
        const poster = item.poster || {};
        return poster.large || poster.medium || poster.small || "";
    }

    getYear(item) {
        const value = item.year || item.startDate;
        const year = parseInt(value, 10);
        return isNaN(year) ? undefined : year;
    }

    /** The page count the API declares, or 0 when it is missing or not a positive integer. */
    declaredLastPage(result) {
        const pagination = result.meta || result.pagination || {};
        const lastPage =
            pagination.lastPage !== undefined
                ? pagination.lastPage
                : pagination.last_page;
        return Number.isInteger(lastPage) && lastPage > 0 ? lastPage : 0;
    }

    formatChapterNumber(value) {
        const str = String(value);
        return str.endsWith(".0") ? str.slice(0, -2) : str;
    }

    extractChapterNumber(chapterStr) {
        const num = parseFloat(chapterStr);
        if (!isNaN(num)) return num;

        const match = String(chapterStr).match(/(\d+(?:\.\d+)?)/);
        return match ? parseFloat(match[1]) : 0;
    }

    extractChapterId(chapterId) {
        const num = parseInt(chapterId.split("|")[2], 10);
        return isNaN(num) ? 0 : num;
    }

    /** Maps an API chapter to Seanime's ChapterDetails, or null for non-English or incomplete items. */
    toChapterDetails(item, manga) {
        const language = String(item.language || "en").toLowerCase();
        if (language !== "en" && language !== "english") return null;

        const chapterId = item.id != null ? item.id : item.chapter_id;
        const chapterNumber =
            item.number != null ? this.formatChapterNumber(item.number) : "";
        if (!chapterId || !chapterNumber) return null;

        const name = item.name ? String(item.name).trim() : "";
        const group = item.group || item.scanlation_group;
        const isOfficial = item.isOfficial === true || item.isOfficial === 1;
        const url =
            typeof item.url === "string" && item.url.indexOf("/title/") >= 0
                ? item.url.indexOf("http") === 0
                    ? item.url
                    : `${this.api}${item.url}`
                : `${this.api}/title/${manga.fullSlug}/${chapterId}-chapter-${chapterNumber}`;

        return {
            id: `${manga.hashId}|${manga.slug}|${chapterId}|${chapterNumber}`,
            url,
            title: name
                ? `Chapter ${chapterNumber}: ${name}`
                : `Chapter ${chapterNumber}`,
            chapter: chapterNumber,
            index: 0,
            scanlator:
                group && group.name
                    ? String(group.name).trim()
                    : isOfficial
                      ? "Official"
                      : undefined,
            language: "en",
            rating: item.votes,
            updatedAt:
                item.updatedAtFormatted || item.createdAtFormatted || undefined,
        };
    }

    // -----------------------------------------------------------------------------------------
    // MangaProvider
    // -----------------------------------------------------------------------------------------

    /**
     * Searches for manga.
     */
    async search(opts) {
        const query = String((opts && opts.query) || "").trim();
        if (!query) return [];

        const data = await this.apiGet("/manga", {
            keyword: query,
            "order[relevance]": "desc",
            limit: 28,
            page: 1,
        });
        const items = requireList(
            data.result && data.result.items,
            "/manga search",
            "result.items",
        );

        // Covers on static.comix.to sit behind Cloudflare too, so Seanime's image proxy needs the
        // clearance. The cookie only appears in the image-proxy URL the user's own Seanime client
        // requests from their own Seanime server, and is attached to comix.to covers only.
        const credentials = this.readCredentials();
        const coverHeaders = {
            "User-Agent": credentials.userAgent,
        };
        if (credentials.cookie)
            coverHeaders.Cookie = `cf_clearance=${credentials.cookie}`;

        const mangas = [];
        items.forEach((item) => {
            const hashId = item.hid || item.hash_id;
            if (!hashId) return;

            const slug = this.slugWithoutHash(
                hashId,
                item.slug || this.extractTitleSlug(item.url),
            );
            const image = this.getPosterUrl(item);
            const manga = {
                id: `${hashId}|${slug}`,
                title: item.title || slug || hashId,
                synonyms: this.normalizeSynonyms(
                    item.altTitles || item.alt_titles,
                ),
                year: this.getYear(item),
                image,
            };
            if (isComixUrl(image)) manga.imageHeaders = coverHeaders;
            mangas.push(manga);
        });
        return mangas;
    }

    /**
     * Finds all English chapters, sorted ascending. Any failed or malformed page fails the whole
     * call, because Seanime caches the list it gets and a partial one would hide chapters.
     *
     * Paging always reaches a valid declared `lastPage`, fetching those pages in parallel batches,
     * and then continues one page at a time while the last page fetched was full. So neither a
     * short page before `lastPage` nor missing or understated metadata can cut the list short.
     * An empty page means the list has ended: the batch in flight is kept and no more are fetched.
     * Lists longer than MAX_CHAPTER_PAGES pages, declared or discovered, fail instead of being cut.
     */
    async findChapters(mangaId) {
        const manga = this.normalizeMangaId(mangaId);
        if (!manga.hashId) return [];

        const path = `/manga/${manga.hashId}/chapters`;
        const fetchPage = (page) =>
            this.apiGet(path, {
                limit: CHAPTERS_PER_PAGE,
                "order[number]": "desc",
                page,
            });
        const itemsOf = (data, page) =>
            requireList(
                data.result && data.result.items,
                describeRequest(path, { page }),
                "result.items",
            );

        const first = await fetchPage(1);
        const rawChapters = itemsOf(first, 1).slice();
        let lastPageFull = rawChapters.length >= CHAPTERS_PER_PAGE;
        let sawEmptyPage = rawChapters.length === 0;
        const tooManyPages = `Comix: ${path} has more than ${MAX_CHAPTER_PAGES} pages of chapters. Refusing to return a partial chapter list; wait for an extension update.`;
        const declared = this.declaredLastPage(first.result);
        if (declared > MAX_CHAPTER_PAGES) throw fail(tooManyPages);
        if (lastPageFull && !declared) {
            const meta = JSON.stringify(
                first.result.meta || first.result.pagination || null,
            );
            console.warn(
                `Comix: ${describeRequest(path, { page: 1 })} is full but declares no usable lastPage (${meta.slice(0, 120)}); fetching pages one at a time until a short page`,
            );
        }

        let page = 1;
        while ((page < declared || lastPageFull) && !sawEmptyPage) {
            if (page >= MAX_CHAPTER_PAGES) throw fail(tooManyPages);
            if (page === declared) {
                console.warn(
                    `Comix: ${path} page ${declared}, the declared last page, is full; checking for more pages one at a time`,
                );
            }
            const batchEnd =
                page < declared
                    ? Math.min(page + CHAPTER_BATCH_SIZE, declared)
                    : page + 1;
            const pages = [];
            for (let p = page + 1; p <= batchEnd; p++) pages.push(p);

            const started = Date.now();
            const results = await Promise.all(pages.map(fetchPage));
            results.forEach((data, i) => {
                const items = itemsOf(data, pages[i]);
                rawChapters.push.apply(rawChapters, items);
                if (items.length === 0) sawEmptyPage = true;
                if (pages[i] === batchEnd)
                    lastPageFull = items.length >= CHAPTERS_PER_PAGE;
            });
            page = batchEnd;

            const wait =
                pages.length * MIN_MS_PER_REQUEST - (Date.now() - started);
            if (wait > 0 && (page < declared || lastPageFull) && !sawEmptyPage)
                $sleep(wait);
        }

        // Pages can shift while new chapters are published, so drop repeated chapter ids.
        const seen = {};
        const chapters = [];
        rawChapters.forEach((item) => {
            const chapter = this.toChapterDetails(item, manga);
            if (!chapter || seen[chapter.id]) return;
            seen[chapter.id] = true;
            chapters.push(chapter);
        });

        chapters.sort((a, b) => {
            const chapterDiff =
                this.extractChapterNumber(a.chapter) -
                this.extractChapterNumber(b.chapter);
            if (chapterDiff !== 0) return chapterDiff;
            return this.extractChapterId(a.id) - this.extractChapterId(b.id);
        });
        chapters.forEach((chapter, index) => {
            chapter.index = index;
        });

        return chapters;
    }

    /**
     * Finds all image pages. Images are fetched without Referer or Origin; the hosts reject any Referer.
     * Non-empty headers make Seanime load them through its image proxy instead of the browser.
     */
    async findChapterPages(chapterId) {
        const numericId = this.extractNumericChapterId(chapterId);
        if (!numericId) return [];

        const path = `/chapters/${numericId}`;
        const data = await this.apiGet(path, {});
        const pages = (data.result && data.result.pages) || {};
        const items = Array.isArray(pages)
            ? pages
            : requireList(pages.items, path, "result.pages.items");
        const baseUrl = String(pages.baseUrl || "").replace(/\/+$/, "");

        if (items.length === 0)
            console.warn(`Comix: chapter ${numericId} has no pages`);

        return items
            .filter((item) => item && item.url)
            .map((item, index) => ({
                url: /^https?:\/\//i.test(item.url)
                    ? item.url
                    : `${baseUrl}/${String(item.url).replace(/^\/+/, "")}`,
                index,
                headers: {
                    Accept: IMAGE_ACCEPT,
                },
            }));
    }
}
