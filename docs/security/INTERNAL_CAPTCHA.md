# CAPTCHA platform policy

Cloudflare Turnstile protects web, desktop, Android and TV flows. The native iOS
Capacitor app displays no CAPTCHA. Safari on iPhone or iPad remains a web client
and requires Turnstile.

isCaptchaRequired() uses the canonical native-platform detector. iOS skips
scripts, iframes, tokens and CAPTCHA-based button gating. Requests from that
client carry clientPlatform: "ios-capacitor". Other clients omit this field.
Packaged non-iOS clients use /security/turnstile.html over HTTPS when their own
origin cannot host Turnstile reliably. The parent validates the frame's HTTPS
origin, source window and current render ID.

Browser development also uses this hosted verification frame so tokens carry
the approved tatakai.me hostname. API calls from a development browser go through
Vite's same-origin /api proxy, even when the public .env specifies the production
backend. VITE_API_V3_ORIGIN controls the proxy destination. Production and native
clients retain their configured backend origins.

The API exempts a request only when its explicit platform marker, native
capacitor://tatakai.me or legacy capacitor://localhost Origin, and iOS WebView
user agent all match. A regular HTTPS browser on iOS, a platform marker alone,
Android, or a missing/null Origin does not qualify. These signals classify the
requested platform exception; they are not cryptographic device attestation
and can be imitated by a non-browser client. Rate limits still apply to exempt
requests, including OPS signup and email proof.

All other requests require a Turnstile token verified server-side with its
expected action, configured hostname and caller IP. Redis tracks token reuse;
unavailable verification or replay fails closed. Arithmetic CAPTCHA endpoints
are retired and cannot grant access.

Protected auth and submission APIs remain the enforcement point. OPS preserves
its email-delivery quota policy, restricted-account fallback and email proof.
OPS forwards the original caller's platform marker, Origin and user agent only
through the shared-secret internal verification route. Public callers cannot
supply trusted Origin or user-agent fields in OPS request bodies.

Server configuration:

- Client: public VITE_TURNSTILE_SITE_KEY.
- API: server-only TURNSTILE_SECRET_KEY, TURNSTILE_ALLOWED_HOSTNAMES,
  CAPTCHA_INTERNAL_SECRET, SUPABASE_ANON_KEY and Redis control configuration.
- API: private GoTrue/PostgREST origins in CAPTCHA_SUPABASE_URL/CAPTCHA_REST_URL.
- OPS: the same CAPTCHA_INTERNAL_SECRET, private CAPTCHA_API_URL and
  CAPTCHA_GOTRUE_URL.
- Keep GOTRUE_SECURITY_CAPTCHA_ENABLED=false: global provider CAPTCHA would
  reject the intentionally exempt native iOS client too.
- Keep public gateway guards on direct auth sends/password login, suggestions,
  reports and GraphQL mutations. Token refresh, OTP verification and ordinary
  RLS-protected reads/updates remain available. Existing database permissions
  and email-autoconfirm settings are preserved.

Existing native installations need a rebuilt client to use this policy.
Environment secrets, private keys and source changes are not published to GitHub.
