
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeMalCode } from '@/lib/mal';
import { buildDesktopDeepLink, isDesktopApp, isDesktopOAuthState } from '@/lib/desktopOAuth';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';

export default function MalRedirectPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { refreshProfile } = useAuth();
    const [status, setStatus] = useState<'loading' | 'forwarding' | 'success' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);

    const hasRun = useRef(false);

    // `tatakai://` handoff for desktop-initiated flows. Only used when this page
    // loads in the system browser (not the desktop app itself).
    const desktopDeepLink = useMemo(() => {
        const qs = searchParams.toString();
        return buildDesktopDeepLink(`/integration/mal/redirect${qs ? `?${qs}` : ''}`);
    }, [searchParams]);

    useEffect(() => {
        if (hasRun.current) return;

        // Desktop bridge: this callback was initiated from the desktop app (the
        // provider echoed our `state` marker). The code + PKCE verifier belong
        // to the desktop session, so forward to the app instead of consuming
        // the code here with the browser's session.
        const stateParam = searchParams.get('state');
        if (stateParam && isDesktopOAuthState(stateParam) && !isDesktopApp()) {
            hasRun.current = true;
            setStatus('forwarding');
            window.location.href = desktopDeepLink;
            return;
        }

        hasRun.current = true;
        const code = searchParams.get('code');
        const errorParam = searchParams.get('error');

        if (errorParam) {
            setStatus('error');
            setError(errorParam);
            toast.error(`MAL Error: ${errorParam}`);
            return;
        }

        if (!code) {
            setStatus('error');
            setError('No authorization code found');
            return;
        }

        const completeAuth = async () => {
            try {
                await exchangeMalCode(code);
                await refreshProfile();
                setStatus('success');
                toast.success('Successfully linked MyAnimeList!');
                setTimeout(() => navigate('/profile'), 2000);
            } catch (err: any) {
                console.error('MAL Exchange Error:', err);
                setStatus('error');
                setError(err.message || 'Failed to exchange code for tokens');
                toast.error('Failed to link MyAnimeList');
            }
        };

        completeAuth();
    }, [searchParams, navigate, desktopDeepLink, refreshProfile]);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <GlassPanel className="max-w-md w-full p-8 text-center space-y-6">
                {(status === 'loading' || status === 'forwarding') && (
                    <>
                        <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
                        <h1 className="text-2xl font-bold">
                            {status === 'forwarding' ? 'Returning to the app...' : 'Linking MyAnimeList...'}
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
                        <p className="text-muted-foreground">Your MyAnimeList account has been linked. Redirecting you back to your profile...</p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
                        <h1 className="text-2xl font-bold">Authentication Failed</h1>
                        <p className="text-destructive font-medium">{error}</p>
                        <button
                            onClick={() => navigate('/profile')}
                            className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                        >
                            Back to Profile
                        </button>
                    </>
                )}
            </GlassPanel>
        </div>
    );
}
