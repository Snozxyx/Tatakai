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
                    toast.info('Complete the MangaBaka login in your browser, then return to the app.');
                    return;
                }
                window.location.href = url;
                return;
            }
            window.location.href = await getMangaBakaAuthUrl();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not restart MangaBaka login.');
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
            toast.error(`MangaBaka Error: ${errorParam}`);
            return;
        }

        if (!code) {
            setStatus('error');
            setError('No authorization code found');
            return;
        }

        const completeAuth = async () => {
            try {
                if (!user) throw new Error('Sign in to Tatakai before linking MangaBaka.');
                // Validate CSRF state BEFORE marking the single-use code as consumed.
                const expectedState = localStorage.getItem('mangabaka_oauth_state');
                if (!stateParam) {
                    throw new Error('MangaBaka did not return a login session (missing state). Please reconnect MangaBaka again.');
                }
                if (!expectedState) {
                    throw new Error('This browser did not start this MangaBaka login (no login session found here). If you approved MangaBaka in a different browser, a private window, or after clearing site data, restart the login in THIS browser and approve it here.');
                }
                if (stateParam !== expectedState) {
                    if (isMangaBakaLoginPendingFresh()) {
                        throw new Error('This MangaBaka login link is stale — a newer login was started. Only the newest MangaBaka tab can complete. Finish that tab, or discard it and start a fresh login.');
                    }
                    throw new Error('This MangaBaka login does not match the one this browser started (stale or double login). Please start a fresh login and approve only the newest MangaBaka tab.');
                }
                // Authorization codes are single-use: guard against double-run.
                const usedKey = `mangabaka_exchange_used:${code}`;
                try {
                    if (sessionStorage.getItem(usedKey) === '1') {
                        throw new Error('This MangaBaka login link was already used — authorization codes are single-use. Start a fresh login from Settings → Integrations.');
                    }
                    sessionStorage.setItem(usedKey, '1');
                } catch (e) {
                    if (e instanceof Error && e.message.startsWith('This MangaBaka login link was already used')) throw e;
                    /* storage unavailable — proceed without the guard */
                }
                await exchangeMangaBakaCode(code);
                await refreshProfile();
                setStatus('success');
                toast.success('Successfully linked MangaBaka!');
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
                toast.error('Failed to link MangaBaka');
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
                            {status === 'forwarding' ? 'Returning to the app...' : 'Linking MangaBaka...'}
                        </h1>
                        <p className="text-muted-foreground">
                            {status === 'forwarding'
                                ? 'Login approved. Opening the Tatakai app to finish linking.'
                                : 'Please wait while we complete the authentication process.'}
                        </p>
                        {status === 'forwarding' && (
                            <a
                                href={desktopDeepLink}
                                className="inline-flex items-center gap-2 mt-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Open Tatakai app
                            </a>
                        )}
                    </>
                )}

                {status === 'success' && (
                    <>
                        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                        <h1 className="text-2xl font-bold">Success!</h1>
                        <p className="text-muted-foreground">Your MangaBaka account has been linked. Redirecting you back to your profile...</p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
                        <h1 className="text-2xl font-bold">Authentication Failed</h1>
                        <p className="text-destructive font-medium">{error}</p>
                        <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                            <button
                                onClick={() => void handleReconnect()}
                                disabled={isRetrying}
                                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-wait"
                            >
                                {isRetrying ? 'Restarting…' : 'Reconnect MangaBaka'}
                            </button>
                            <button
                                onClick={() => navigate('/profile')}
                                className="px-6 py-2 rounded-lg border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                            >
                                Back to Profile
                            </button>
                        </div>
                    </>
                )}
            </GlassPanel>
        </div>
    );
}
