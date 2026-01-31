
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeMalCode } from '@/lib/mal';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';

export default function MalRedirectPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { refreshProfile } = useAuth();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
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
    }, [searchParams, navigate]);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <GlassPanel className="max-w-md w-full p-8 text-center space-y-6">
                {status === 'loading' && (
                    <>
                        <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
                        <h1 className="text-2xl font-bold">Linking MyAnimeList...</h1>
                        <p className="text-muted-foreground">Please wait while we complete the authentication process.</p>
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
