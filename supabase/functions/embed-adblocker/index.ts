import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const proxyHeaders = {
  ...corsHeaders,
  'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data: blob:; media-src * data: blob:; connect-src *; frame-ancestors *;",
  'X-Frame-Options': 'ALLOWALL',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Proxy] Fetching: ${targetUrl}`);

    // Fetch the target content
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      return new Response(`Upstream error: ${response.status}`, { status: response.status, headers: corsHeaders });
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    if (!doc) {
      return new Response('Failed to parse HTML', { status: 500, headers: corsHeaders });
    }

    // --- SANITIZATION ---

    // 1. Remove specific ad/tracking scripts
    const scripts = doc.querySelectorAll('script');
    scripts.forEach((node) => {
      const script = node as Element;
      const src = script.getAttribute('src') || '';
      const content = script.textContent || '';

      if (
        src.includes('fuckadblock') ||
        src.includes('googletagmanager') ||
        src.includes('googlesyndication') ||
        src.includes('adsbygoogle') ||
        content.includes('fuckAdBlock') ||
        content.includes('gtag')
      ) {
        console.log('[Proxy] Removed ad script:', src || 'inline');
        script.remove();
      }

      // Remove popup config
      if (content.includes('window.abyssConfig')) {
        script.textContent = content.replace(/window\.abyssConfig\s*=\s*{[^}]*};/, 'window.abyssConfig = { popups: [] };');
        console.log('[Proxy] Neutralized abyssConfig popups');
      }

      // Neutralize click handler assignment (vRGiacM or similar)
      if (content.includes('document.onclick =')) {
        script.textContent = content.replace(/document\.onclick\s*=[^;]+;/, '// document.onclick removed by proxy');
      }
    });

    // 2. Remove click-capture overlay
    const overlay = doc.getElementById('overlay');
    if (overlay) {
      console.log('[Proxy] Removed #overlay');
      overlay.remove();
    }

    // --- INJECTION ---

    // Extract Slug from URL (e.g. ?v=SLUG)
    let slug = '';
    const targetUrlObj = new URL(targetUrl);
    slug = targetUrlObj.searchParams.get('v') || '';

    // Inject Protection & Slug Fix Script at the TOP of Head
    const head = doc.querySelector('head');
    const protectionScript = doc.createElement('script');
    protectionScript.textContent = `
      // [Tatakai Proxy] Ad-Shield v3 - Active Protection
      (function() {
        console.log("[Tatakai] Ad-Shield active - neutralizing click hijacking");

        // 1. Override window.open to block popups
        const originalOpen = window.open;
        window.open = function(url, target, features) {
            console.log("[Tatakai] Blocked popup:", url);
            return {
                closed: false,
                focus: function() {},
                blur: function() {},
                close: function() {},
                postMessage: function() {},
                location: { href: '' }
            }; // Fake window
        };
        // Patch toString to hide the override
        window.open.toString = function() { return 'function open() { [native code] }'; };

        // 2. Neutralize specific global variables used by ad scripts
        Object.defineProperty(window, 'isUseExtension', { get: () => false, set: () => {} });
        Object.defineProperty(window, 'fuckAdBlock', { get: () => undefined, set: () => {} });
        
        // 3. Click Hijacking Protection
        // The player needs clicks to play, but ad scripts attach listeners to open popups.
        // We capture and stop propagation of clicks that go to known ad domains or generic document clicks if suspicious.
        
        // Simulate "native" behavior for detection scripts
        const nativeToString = Function.prototype.toString;
        Function.prototype.toString = function() {
            if (this === window.open) return 'function open() { [native code] }';
            if (this === window.setTimeout) return 'function setTimeout() { [native code] }';
            if (this === window.setInterval) return 'function setInterval() { [native code] }';
            return nativeToString.apply(this, arguments);
        };

        // Enforce the slug extracted by the server
        const SERVER_DETECTED_SLUG = "${slug}";
        
        console.log("[Tatakai Proxy] Active protection injected. Slug:", SERVER_DETECTED_SLUG);
      })();
    `;

    if (head) {
      head.insertBefore(protectionScript, head.firstChild);
    }

    // --- SOURCE PATCHING (The most robust way) ---
    // Since we have the raw text content of scripts in DOM, we can patch them!

    scripts.forEach((node) => {
      const script = node as Element;
      let content = script.textContent;
      if (!content) return;

      let modified = false;

      // Patch getQueryParams to hardcode the slug
      if (content.includes('window.location.search') && slug) {
        content = content.replace(/window\.location\.search/g, `"?v=${slug}"`);
        modified = true;
        console.log('[Proxy] Patched window.location.search in script');
      }

      // Fix syntax errors / Neutralize tracking
      if (content.includes('reqTrack')) {
        content = content.replace(/const\s+reqTrack\s*=\s*\([^)]*\)\s*=>\s*{[^}]*};/g, 'const reqTrack = () => {};');
        content = content.replace(/reqTrack\s*\([^)]+\)/g, ''); // Remove calls
        modified = true;
      }

      if (content.includes('isUseExtension')) {
        content = content.replace(/const\s+isUseExtension\s*=[^;]+;/g, 'const isUseExtension = false;');
        modified = true;
      }

      // 3. TARGETED SURGICAL STRIKES (Based on user snippet)

      // A. Neutralize Anti-Framing
      if (content.includes('top.location == self.location')) {
        content = content.replace(/if\s*\(\s*top\.location\s*==\s*self\.location[^)]*\)/, 'if (false)');
        console.log('[Proxy] Neutralized anti-framing check');
        modified = true;
      }

      // B. Mock window.open to prevent failure detection
      // The script checks if (!open.closed). If we just console.log, it might fail/throw.
      // We explicitly return a fake window object so the script thinks the popup opened successfully!
      // This prevents 'track.window' from incrementing, so the player never gets destroyed.
      if (content.includes('window.open')) {
        const fakeWindow = '{ closed: false, focus: function(){}, close: function(){} }';
        content = content.replace(/window\.open\s*\(([^)]*)\)/g, `(function(u){ console.log("Blocked window.open", u); return ${fakeWindow}; })($1)`);
        modified = true;
        console.log('[Proxy] Mocked window.open calls');
      }

      // C. Block Stealth <a> Clicks (isUseExtension path)
      if (content.includes('.click()')) {
        content = content.replace(/\.click\(\)/g, '.toString() /* Blocked stealth click */');
        modified = true;
        console.log('[Proxy] Blocked .click() calls');
      }

      // D. Prevent Player Killing
      if (content.includes('jwplayer().remove()')) {
        content = content.replace(/jwplayer\(\)\.remove\(\)/g, 'console.log("Blocked player removal")');
        modified = true;
        console.log('[Proxy] Protected player from removal');
      }

      // E. Block Error Screen (document.write)
      if (content.includes('document.write')) {
        content = content.replace(/document\.write\s*\(/g, 'console.log("Blocked document.write", ');
        modified = true;
      }

      // F. Force track.window to be effectively 0
      // Find where "track" object is defined and defined window:0
      if (content.includes('track = {')) {
        content = content.replace(/window:\s*0/, 'window: -9999'); // Start negative so it takes forever to reach 2
        modified = true;
      }

      if (modified) {
        script.textContent = content;
      }
    });

    // Serialize back to HTML
    // doc.documentElement?.outerHTML gives the whole html
    const finalHtml = "<!DOCTYPE html>\n" + doc.documentElement?.outerHTML;

    return new Response(finalHtml, {
      headers: {
        ...proxyHeaders,
        'Content-Type': 'text/html; charset=utf-8',
      },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Proxy] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
