import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeMangaBakaCode, clearMangaBakaPendingMarker, clearMangaBakaOAuthStorage, getMangaBakaAuthUrl, isMangaBakaLoginPendingFresh } from '@/lib/mangabaka';
import { buildDesktopDeepLink, isNativeOAuthApp, isDesktopOAuthState, getWebMangabakaRedirectUri, buildDesktopOAuthState, openOAuthInBrowser } from '@/lib/desktopOAuth';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';

/** The redirect URI this browser sent at authorize time (persisted by getMangaBakaAuthUrl). */
function safeReadMangabakaRedirect(): string | null {
    try {
        return localStorage.getItem('mangabaka_redirect_uri');
    } catch {
        return null;
    }
}

export default function MangaBakaRedirectPage() {
  useUiTranslation();
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
        return buildDesktopDeepLink(`/integration/mangabaka/redirect${qs ? `?${qs}` : ''}`);
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
            clearMangaBakaOAuthStorage();
            clearMangaBakaPendingMarker();
            if (isNativeOAuthApp()) {
                const url = await getMangaBakaAuthUrl(getWebMangabakaRedirectUri(), buildDesktopOAuthState());
                if (await openOAuthInBrowser(url)) {
                    toast.info(uiI18n.t('app.complete_the_mangabaka_login_in_your_browser_the_b9d344fb'));
                    return;
                }
                window.location.href = url;
                return;
            }
            window.location.href = await getMangaBakaAuthUrl();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : uiI18n.t('app.could_not_restart_mangabaka_login_326481f7'));
            setIsRetrying(false);
        }
    };

    useEffect(() => {
        if (hasRun.current) return;

        // Desktop bridge: this callback was initiated from the desktop app (the
        // provider echoed our `state` marker). The code belongs to the desktop
        // session, so forward to the app instead of consuming it here.
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
        const errorParam = searchParams.get('error') || searchParams.get('error_description');

        if (errorParam) {
            setStatus('error');
            const sentRedirect = safeReadMangabakaRedirect();
            const hint = /redirect/i.test(errorParam)
                ? `${errorParam} — the MangaBaka app must list the sent URI (${sentRedirect || 'unknown'}) on its own line in the redirect URIs.`
                : errorParam;
            setError(hint);
            toast.error(uiI18n.t('app.mangabaka_error_i18n_value_0_3154738e', { value0: errorParam }));
            return;
        }

        if (!code) {
            setStatus('error');
            setError(uiI18n.t('app.no_authorization_code_found_42a7c6ac'));
            return;
        }

        const completeAuth = async () => {
            try {
                if (!user) throw new Error(uiI18n.t('app.sign_in_to_tatakai_before_linking_mangabaka_73a124cf'));
                // Validate CSRF state BEFORE marking the single-use code as consumed.
                const expectedState = localStorage.getItem('mangabaka_oauth_state');
                if (!stateParam) {
                    throw new Error(uiI18n.t('app.mangabaka_did_not_return_a_login_session_missing_42dc1cc6'));
                }
                if (!expectedState) {
                    throw new Error(uiI18n.t('app.this_browser_did_not_start_this_mangabaka_login__5869cacc'));
                }
                if (stateParam !== expectedState) {
                    if (isMangaBakaLoginPendingFresh()) {
                        throw new Error(uiI18n.t('app.this_mangabaka_login_link_is_stale_a_newer_login_33179569'));
                    }
                    throw new Error(uiI18n.t('app.this_mangabaka_login_does_not_match_the_one_this_b1b637d4'));
                }
                // Authorization codes are single-use: guard against double-run.
                const usedKey = `mangabaka_exchange_used:${code}`;
                try {
                    if (sessionStorage.getItem(usedKey) === '1') {
                        throw new Error(uiI18n.t('app.this_mangabaka_login_link_was_already_used_autho_505beea7'));
                    }
                    sessionStorage.setItem(usedKey, '1');
                } catch (e) {
                    if (e instanceof Error && e.message.startsWith('This MangaBaka login link was already used')) throw e;
                    /* storage unavailable — proceed without the guard */
                }
                await exchangeMangaBakaCode(code);
                await refreshProfile();
                setStatus('success');
                toast.success(uiI18n.t('app.successfully_linked_mangabaka_79ec7746'));
                setTimeout(() => navigate('/profile'), 2000);
            } catch (err: unknown) {
                console.error('MangaBaka Exchange Error:', err);
                setStatus('error');
                try {
                    const storedState = localStorage.getItem('mangabaka_oauth_state');
                    if (!storedState || storedState === stateParam) clearMangaBakaPendingMarker();
                } catch { /* ignore */ }
                const raw = err instanceof Error ? err.message : 'Failed to exchange code for tokens';
                const sentRedirect = safeReadMangabakaRedirect();
                const hinted = /redirect_uri|redirect/i.test(raw)
                    ? `${raw} — in the MangaBaka app settings, list the sent URI (${sentRedirect || 'unknown'}) on its own line in the redirect URIs, then reconnect from Settings → Integrations.`
                    : raw;
                setError(hinted);
                toast.error(uiI18n.t('app.failed_to_link_mangabaka_c71c6462'));
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
                            {status === 'forwarding' ? uiI18n.t('app.returning_to_the_app_2c0175f0') : uiI18n.t('app.linking_mangabaka_4fcf9c95')}
                        </h1>
                        <p className="text-muted-foreground">
                            {status === 'forwarding'
                                ? uiI18n.t('app.login_approved_opening_the_tatakai_app_to_finish_5d72e6f1')
                                : uiI18n.t('app.please_wait_while_we_complete_the_authentication_290e801e')}
                        </p>
                        {status === 'forwarding' && (
                            <a
                                href={desktopDeepLink}
                                className="inline-flex items-center gap-2 mt-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                                {uiI18n.t('app.open_tatakai_app_026da312')}
                            </a>
                        )}
                    </>
                )}

                {status === 'success' && (
                    <>
                        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                        <h1 className="text-2xl font-bold">{uiI18n.t('app.success_7ce01f63')}</h1>
                        <p className="text-muted-foreground">{uiI18n.t('app.your_mangabaka_account_has_been_linked_redirecti_390d74c2')}</p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
                        <h1 className="text-2xl font-bold">{uiI18n.t('app.authentication_failed_ed3b12fb')}</h1>
                        <p className="text-destructive font-medium">{error}</p>
                        <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                            <button
                                onClick={() => void handleReconnect()}
                                disabled={isRetrying}
                                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-wait"
                            >
                                {isRetrying ? uiI18n.t('app.restarting_b86eee16') : uiI18n.t('app.reconnect_mangabaka_237c7435')}
                            </button>
                            <button
                                onClick={() => navigate('/profile')}
                                className="px-6 py-2 rounded-lg border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                            >
                                {uiI18n.t('app.back_to_profile_a8586e20')}
                            </button>
                        </div>
                    </>
                )}
            </GlassPanel>
        </div>
    );
}
