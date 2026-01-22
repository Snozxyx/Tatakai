import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppConfig } from '@/hooks/useAppConfig';
import { toast } from 'sonner';
import { Smartphone } from 'lucide-react';

// Simple semver compare: returns 1 if a > b, -1 if a < b, 0 if equal
function compareVersions(a: string, b: string): number {
    if (a === b) return 0;
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const valA = aParts[i] || 0;
        const valB = bParts[i] || 0;
        if (valA > valB) return 1;
        if (valA < valB) return -1;
    }
    return 0;
}

export function VersionCheck({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { getConfigValue, data: config } = useAppConfig();
    const [hasChecked, setHasChecked] = useState(false);

    useEffect(() => {
        if (!config || hasChecked) return;

        const currentVersion = __APP_VERSION__;
        const minVersion = getConfigValue('min_supported_version', '1.0.0');
        const latestVersion = getConfigValue('latest_version', currentVersion);

        // Skip check on update page itself to avoid loops
        if (location.pathname === '/update-required') return;

        // Check minimum requirements
        if (compareVersions(currentVersion, minVersion) < 0) {
            console.log(`Force update required: Current ${currentVersion} < Min ${minVersion}`);
            navigate('/update-required', { replace: true });
            return;
        }

        // Check for optional updates
        if (compareVersions(currentVersion, latestVersion) < 0) {
            const lastNotify = localStorage.getItem('last_update_notify');
            const now = Date.now();

            // Notify once every 24 hours
            if (!lastNotify || now - parseInt(lastNotify) > 24 * 60 * 60 * 1000) {
                toast.info(
                    <div className="flex flex-col gap-1">
                        <span className="font-bold flex items-center gap-2">
                            <Smartphone className="w-4 h-4" />
                            Update Available
                        </span>
                        <span className="text-xs">
                            Version {latestVersion} is available.
                        </span>
                    </div>,
                    {
                        duration: 5000,
                        action: {
                            label: 'Update',
                            onClick: () => navigate('/update-required') // Or open app store directly
                        }
                    }
                );
                localStorage.setItem('last_update_notify', now.toString());
            }
        }

        setHasChecked(true);
    }, [config, getConfigValue, navigate, location.pathname, hasChecked]);

    return <>{children}</>;
}
