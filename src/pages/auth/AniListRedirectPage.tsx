
import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { exchangeAniListCode } from '@/lib/externalIntegrations';
import { buildDesktopDeepLink, isDesktopApp, isDesktopOAuthState } from '@/lib/desktopOAuth';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';

export default function AniListRedirectPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { openSettings } = useSettingsModal();
    const { user, isLoading: authLoading, refreshProfile } = useAuth();
    const [status, setStatus] = useState<'loading' | 'forwarding' | 'success' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);

    const hasRun = useRef(false);

    // `tatakai://` handoff for desktop-initiated flows. Only used when this page
    // loads in the system browser (not the desktop app itself).
    const desktopDeepLink = useMemo(() => {
        const qs = searchParams.toString();
        return buildDesktopDeepLink(`/integration/anilist/redirect${qs ? `?${qs}` : ''}`);
    }, [searchParams]);

    useEffect(() => {
        // Desktop bridge: this callback was initiated from the desktop app (the
        // provider echoed our `state` marker). The code belongs to the desktop
        // session, so forward it to the app instead of consuming it here with
        // the browser's session. Must run before any login check — the system
        // browser may not be logged into Tatakai at all.
        const stateParam = searchParams.get('state');
        if (stateParam && isDesktopOAuthState(stateParam) && !isDesktopApp()) {
            hasRun.current = true;
            setStatus('forwarding');
            window.location.href = desktopDeepLink;
            return;
        }

        // Wait until auth context has finished resolving before doing anything
        if (authLoading) return;

        if (hasRun.current) return;

        const code = searchParams.get('code');
        const errorParam = searchParams.get('error');

        if (errorParam) {
            hasRun.current = true;
            setStatus('error');
            setError(errorParam);
            toast.error(`AniList Error: ${errorParam}`);
            return;
        }

        if (!code) {
            hasRun.current = true;
            setStatus('error');
            setError('No authorization code found');
            return;
        }

        if (!user) {
            hasRun.current = true;
            setStatus('error');
            setError('You must be logged in to link AniList');
            return;
        }

        const completeAuth = async () => {
            hasRun.current = true;
            try {
                await exchangeAniListCode(code, user.id);
                await refreshProfile();
                setStatus('success');
                toast.success('Successfully linked AniList!');
                setTimeout(() => { navigate('/', { replace: true }); openSettings('integrations'); }, 2000);
            } catch (err: any) {
                console.error('AniList Exchange Error:', err);
                setStatus('error');
                setError(err.message || 'Failed to exchange code for tokens');
                toast.error('Failed to link AniList');
            }
        };

        completeAuth();
    }, [searchParams, navigate, user, authLoading, refreshProfile, desktopDeepLink]);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <GlassPanel className="max-w-md w-full p-8 text-center space-y-6">
                {(status === 'loading' || status === 'forwarding') && (
                    <>
                        <Loader2 className="w-12 h-12 text-[#02A9FF] animate-spin mx-auto" />
                        <h1 className="text-2xl font-bold">
                            {status === 'forwarding' ? 'Returning to the app...' : 'Linking AniList...'}
                        </h1>
                        <p className="text-muted-foreground">
                            {status === 'forwarding'
                                ? 'Login approved. Opening the Tatakai desktop app to finish linking.'
                                : 'Please wait while we complete the authentication process.'}
                        </p>
                        {status === 'forwarding' && (
                            <a
                                href={desktopDeepLink}
                                className="inline-flex items-center gap-2 mt-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Open desktop app
                            </a>
                        )}
                    </>
                )}

                {status === 'success' && (
                    <>
                        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                        <h1 className="text-2xl font-bold">Success!</h1>
                        <p className="text-muted-foreground">Your AniList account has been linked. Redirecting you back to settings...</p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
                        <h1 className="text-2xl font-bold">Authentication Failed</h1>
                        <p className="text-destructive font-medium">{error}</p>
                        <button
                            onClick={() => { navigate('/', { replace: true }); openSettings('integrations'); }}
                            className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                        >
                            Back to Settings
                        </button>
                    </>
                )}
            </GlassPanel>
        </div>
    );
}
