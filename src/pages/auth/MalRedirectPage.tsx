import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeMalCode, clearMalPendingMarker, clearMalOAuthStorage, getMalAuthUrl, isMalLoginPendingFresh } from '@/lib/mal';
import { buildDesktopDeepLink, isNativeOAuthApp, isDesktopOAuthState, getWebMalRedirectUri, buildDesktopOAuthState, openOAuthInBrowser } from '@/lib/desktopOAuth';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';

/** The redirect URI this browser sent at authorize time (persisted by getMalAuthUrl). */
function safeReadMalRedirect(): string | null {
    try {
        return localStorage.getItem('mal_redirect_uri');
    } catch {
        return null;
    }
}

export default function MalRedirectPage() {
  useUiTranslation();
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { refreshProfile, isLoading: authLoading, user } = useAuth();
    const [status, setStatus] = useState<'loading' | 'forwarding' | 'success' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);
    const [isRetrying, setIsRetrying] = useState(false);

    const hasRun = useRef(false);

    // `tatakai://` handoff for desktop-initiated flows. Only used when this page
    // loads in the system browser (not the desktop app itself).
    const desktopDeepLink = useMemo(() => {
        const qs = searchParams.toString();
        return buildDesktopDeepLink(`/integration/mal/redirect${qs ? `?${qs}` : ''}`);
    }, [searchParams]);

    const handleReconnect = async () => {
        if (isRetrying) return;
        if (!user) {
            navigate('/profile');
            return;
        }
        setIsRetrying(true);
        try {
            // The old flow is dead (rejected/stale codes can't be retried), so
            // drop its verifier/state and mint a brand-new one.
            clearMalOAuthStorage();
            clearMalPendingMarker();
            if (isNativeOAuthApp()) {
                const url = getMalAuthUrl(getWebMalRedirectUri(), buildDesktopOAuthState());
                if (await openOAuthInBrowser(url)) {
                    toast.info(uiI18n.t('app.complete_the_myanimelist_login_in_your_browser_t_c231915a'));
                    return;
                }
                window.location.href = url;
                return;
            }
            window.location.href = getMalAuthUrl();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : uiI18n.t('app.could_not_restart_myanimelist_login_88933b79'));
            setIsRetrying(false);
        }
    };

    useEffect(() => {
        if (hasRun.current) return;

        // Desktop bridge: this callback was initiated from the desktop app (the
        // provider echoed our `state` marker). The code + PKCE verifier belong
        // to the desktop session, so forward to the app instead of consuming
        // the code here with the browser's session.
        const stateParam = searchParams.get('state');
        if (stateParam && isDesktopOAuthState(stateParam) && !isNativeOAuthApp()) {
            hasRun.current = true;
            setStatus('forwarding');
            window.location.href = desktopDeepLink;
            return;
        }

        if (authLoading) return;

        hasRun.current = true;
        const code = searchParams.get('code');
        const errorParam = searchParams.get('error');

        if (errorParam) {
            setStatus('error');
            // MAL answers `invalid_client` (often as a native HTTP-auth prompt
            // upstream) when the authorize redirect_uri doesn't exactly match an
            // entry in the MAL app settings. A comma/space-joined pair sent as
            // one literal URL always fails — surface that, naming the URI this
            // build actually sent. MAL supports MULTIPLE registered URLs (one
            // per line) in the same app.
            const sentRedirect = safeReadMalRedirect();
            const hint = /invalid_client|redirect/i.test(errorParam)
                ? `${errorParam} — the MAL app must list the sent URI (${sentRedirect || 'unknown'}) on its own line in App Redirect URL (multiple URLs go one per line, never comma-joined).`
                : errorParam;
            setError(hint);
            toast.error(t('auth.malError', { error: errorParam }));
            return;
        }

        if (!code) {
            setStatus('error');
            setError(t('auth.noAuthCode'));
            return;
        }

        const completeAuth = async () => {
            try {
                if (!user) throw new Error(uiI18n.t('app.sign_in_to_tatakai_before_linking_myanimelist_08a172db'));
                // Validate CSRF state BEFORE marking the single-use code as consumed:
                // a failed check must not burn a code that was never exchanged.
                const expectedState = localStorage.getItem('mal_oauth_state');
                if (!stateParam) {
                    throw new Error(uiI18n.t('app.myanimelist_did_not_return_a_login_session_missi_24618a3c'));
                }
                if (!expectedState) {
                    throw new Error(uiI18n.t('app.this_browser_did_not_start_this_mal_login_no_log_59d513a9'));
                }
                if (stateParam !== expectedState) {
                    // A second Connect click mints a fresh verifier/state and permanently
                    // invalidates the code from the first tab (MAL answers invalid_grant),
                    // so name that case instead of a generic "expired".
                    if (isMalLoginPendingFresh()) {
                        throw new Error(uiI18n.t('app.this_mal_login_link_is_stale_a_newer_login_was_s_3de519bb'));
                    }
                    throw new Error(uiI18n.t('app.this_mal_login_does_not_match_the_one_this_brows_e8c7a6d1'));
                }
                // Authorization codes are single-use: a reload, HMR remount, or
                // double-run would otherwise burn the code twice and the retry
                // dies with `invalid_grant`. One attempt per code per tab session.
                const usedKey = `mal_exchange_used:${code}`;
                try {
                    if (sessionStorage.getItem(usedKey) === '1') {
                        throw new Error(uiI18n.t('app.this_mal_login_link_was_already_used_authorizati_0ae9aa6e'));
                    }
                    sessionStorage.setItem(usedKey, '1');
                } catch (e) {
                    if (e instanceof Error && e.message.startsWith('This MAL login link was already used')) throw e;
                    /* storage unavailable — proceed without the guard */
                }
                await exchangeMalCode(code);
                await refreshProfile();
                setStatus('success');
                toast.success(t('auth.malLinked'));
                setTimeout(() => navigate('/profile'), 2000);
            } catch (err: any) {
                console.error('MAL Exchange Error:', err);
                setStatus('error');
                // The flow is dead (rejected codes can't be retried), so release
                // the in-flight marker and allow an immediate fresh login —
                // unless a NEWER flow is pending (stored state differs from this
                // callback's), which must keep its marker.
                try {
                    const storedState = localStorage.getItem('mal_oauth_state');
                    if (!storedState || storedState === stateParam) clearMalPendingMarker();
                } catch { /* ignore */ }
                const raw = err.message || t('auth.exchangeCodeFailed');
                // Token-exchange 400s with `invalid_client`/`redirect_uri` mean the
                // code was issued for a different redirect_uri than the exchange
                // sends (or the MAL app registration mismatches) — tell the user
                // exactly what to check instead of leaving them retrying login.
                const sentRedirect = safeReadMalRedirect();
                const hinted = /invalid_client|redirect_uri|redirect/i.test(raw)
                    ? `${raw} — in the MAL app settings, list the sent URI (${sentRedirect || 'unknown'}) on its own line in App Redirect URL (one URL per line; canonical prod: https://tatakai.me/api/mal/redirect), then reconnect from Settings → Integrations.`
                    : raw;
                setError(hinted);
                toast.error(t('auth.malLinkFailed'));
            }
        };

        completeAuth();
    }, [searchParams, navigate, desktopDeepLink, refreshProfile, authLoading, user]);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <GlassPanel className="max-w-md w-full p-8 text-center space-y-6">
                {(status === 'loading' || status === 'forwarding') && (
                    <>
                        <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
                        <h1 className="text-2xl font-bold">
                            {status === 'forwarding' ? t('migration.returning') : t('auth.linkingMal')}
                        </h1>
                        <p className="text-muted-foreground">
                            {status === 'forwarding'
                                ? t('migration.loginApproved')
                                : t('auth.linkingWait')}
                        </p>
                        {status === 'forwarding' && (
                            <a
                                href={desktopDeepLink}
                                className="inline-flex items-center gap-2 mt-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                                {t('migration.openApp')}
                            </a>
                        )}
                    </>
                )}

                {status === 'success' && (
                    <>
                        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                        <h1 className="text-2xl font-bold">{t('auth.successTitle')}</h1>
                        <p className="text-muted-foreground">{t('auth.malLinkedRedirect')}</p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
                        <h1 className="text-2xl font-bold">{t('auth.authFailed')}</h1>
                        <p className="text-destructive font-medium">{error}</p>
                        <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                            <button
                                onClick={() => void handleReconnect()}
                                disabled={isRetrying}
                                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-wait"
                            >
                                {isRetrying ? t('migration.restarting') : t('migration.reconnectMal')}
                            </button>
                            <button
                                onClick={() => navigate('/profile')}
                                className="px-6 py-2 rounded-lg border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                            >
                                {t('auth.backToProfile')}
                            </button>
                        </div>
                    </>
                )}
            </GlassPanel>
        </div>
    );
}
