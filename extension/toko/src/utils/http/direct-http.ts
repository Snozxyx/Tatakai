/**
 * Direct HTTP client (bypasses __tatakai_fetch__ proxy) for use with providers
 * that need direct axios-style access. This replicates A3's makeClient behavior.
 * 
 * Use this ONLY when the tatakai proxy is unavailable or incompatible.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface DirectHttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | FormData | URLSearchParams;
  params?: Record<string, string>;
  timeout?: number;
}

export interface DirectHttpResponse {
  data: string | any;
  status: number;
  statusText: string;
  headers: Headers;
  ok: boolean;
}

/**
 * Direct fetch that bypasses the Tatakai proxy
 */
export async function directFetch(
  baseURL: string,
  path: string,
  options: DirectHttpOptions = {}
): Promise<DirectHttpResponse> {
  const {
    method = 'GET',
    headers = {},
    body,
    params,
    timeout = 15000,
  } = options;

  // Build URL with query params
  const url = new URL(path, baseURL);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  // Build headers
  const fetchHeaders: Record<string, string> = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': baseURL + '/',
    'Origin': new URL(baseURL).origin,
    ...headers,
  };

  // Timeout controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: fetchHeaders,
      body,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      ok: response.ok,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Create an axios-like client for a specific base URL
 */
export function createDirectClient(baseURL: string, referer?: string) {
  return {
    get: async (path: string, options: DirectHttpOptions = {}) => {
      return directFetch(baseURL, path, {
        ...options,
        method: 'GET',
        headers: {
          ...options.headers,
          ...(referer ? { 'Referer': referer } : {}),
        },
      });
    },
    post: async (path: string, data?: any, options: DirectHttpOptions = {}) => {
      const isJsonData = data && typeof data === 'object' && !(data instanceof FormData) && !(data instanceof URLSearchParams);
      return directFetch(baseURL, path, {
        ...options,
        method: 'POST',
        headers: {
          ...options.headers,
          ...(referer ? { 'Referer': referer } : {}),
          ...(isJsonData ? { 'Content-Type': 'application/json' } : {}),
        },
        body: isJsonData ? JSON.stringify(data) : data,
      });
    },
  };
}

/**
 * Create an AJAX client (JSON Accept header)
 */
export function createDirectAjaxClient(baseURL: string, referer?: string) {
  const client = createDirectClient(baseURL, referer);
  
  // Wrap to add AJAX headers
  return {
    get: async (path: string, options: DirectHttpOptions = {}) => {
      return client.get(path, {
        ...options,
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          ...options.headers,
        },
      });
    },
    post: async (path: string, data?: any, options: DirectHttpOptions = {}) => {
      return client.post(path, data, {
        ...options,
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          ...options.headers,
        },
      });
    },
  };
}
