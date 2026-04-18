const ADMIN_API_SECRET = String(import.meta.env.VITE_ADMIN_API_SECRET || "").trim();
const GLOBAL_FETCH_PATCH_FLAG = "__tatakaiAdminSecretFetchPatched__";

function extractOrigin(value: string): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function resolveBackendOrigins(): Set<string> {
  const origins = new Set<string>();

  const configuredCandidates = [
    import.meta.env.VITE_BACKEND_ORIGIN,
    import.meta.env.VITE_API_BASE_URL,
    import.meta.env.VITE_HIANIME_API_URL,
    import.meta.env.VITE_TATAKAI_API_URL,
    import.meta.env.VITE_MANGA_API_URL,
  ];

  for (const candidate of configuredCandidates) {
    const origin = extractOrigin(String(candidate || ""));
    if (origin) origins.add(origin);
  }

  if (typeof window !== "undefined") {
    origins.add(window.location.origin);
  }

  return origins;
}

function resolveRequestUrl(input: RequestInfo | URL): URL | null {
  if (typeof window === "undefined") return null;

  try {
    if (input instanceof Request) {
      return new URL(input.url, window.location.origin);
    }

    if (input instanceof URL) {
      return new URL(input.toString(), window.location.origin);
    }

    return new URL(String(input), window.location.origin);
  } catch {
    return null;
  }
}

function shouldAttachAdminSecret(requestUrl: URL, backendOrigins: Set<string>): boolean {
  if (backendOrigins.has(requestUrl.origin)) return true;

  if (typeof window !== "undefined" && requestUrl.origin === window.location.origin) {
    return (
      requestUrl.pathname.startsWith("/api/") ||
      requestUrl.pathname === "/health" ||
      requestUrl.pathname.startsWith("/health/")
    );
  }

  return false;
}

function mergeHeaders(
  requestHeaders?: HeadersInit,
  initHeaders?: HeadersInit
): Headers {
  const merged = new Headers();

  if (requestHeaders) {
    new Headers(requestHeaders).forEach((value, key) => {
      merged.set(key, value);
    });
  }

  if (initHeaders) {
    new Headers(initHeaders).forEach((value, key) => {
      merged.set(key, value);
    });
  }

  return merged;
}

export function withAdminSecretHeader(
  headers: Record<string, string> = {}
): Record<string, string> {
  if (!ADMIN_API_SECRET) return { ...headers };

  return {
    ...headers,
    "X-Admin-Secret": ADMIN_API_SECRET,
  };
}

export function installGlobalAdminSecretFetchPatch(): void {
  if (typeof window === "undefined") return;
  if (!ADMIN_API_SECRET) return;

  const flagHost = window as unknown as Record<string, unknown>;
  if (flagHost[GLOBAL_FETCH_PATCH_FLAG]) return;

  const backendOrigins = resolveBackendOrigins();
  const nativeFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = resolveRequestUrl(input);
    if (!requestUrl || !shouldAttachAdminSecret(requestUrl, backendOrigins)) {
      return nativeFetch(input, init);
    }

    const headers = mergeHeaders(
      input instanceof Request ? input.headers : undefined,
      init?.headers
    );

    if (!headers.has("X-Admin-Secret")) {
      headers.set("X-Admin-Secret", ADMIN_API_SECRET);
    }

    if (input instanceof Request) {
      const patchedRequest = new Request(input, {
        ...init,
        headers,
      });
      return nativeFetch(patchedRequest);
    }

    return nativeFetch(input, {
      ...init,
      headers,
    });
  }) as typeof window.fetch;

  flagHost[GLOBAL_FETCH_PATCH_FLAG] = true;
}
