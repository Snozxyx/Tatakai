import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useEffect } from 'react';
import { useAppConfig, AppConfigKey } from '@/hooks/ui/useAppConfig';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Smartphone, AlertTriangle, Save, RefreshCw } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';

export function AppVersionManager() {
  useUiTranslation();
    const { data: config, isLoading, updateConfig, getConfigValue } = useAppConfig();
    const confirm = useConfirm();

    // Local state for inputs
    const [minVersion, setMinVersion] = useState('');
    const [latestVersion, setLatestVersion] = useState('');
    const [updateUrl, setUpdateUrl] = useState('');
    const [updateMessage, setUpdateMessage] = useState('');

    // Sync with data when loaded
    useEffect(() => {
        if (config) {
            setMinVersion(getConfigValue('min_supported_version', '1.0.0'));
            setLatestVersion(getConfigValue('latest_version', __APP_VERSION__));
            setUpdateUrl(getConfigValue('android_download_url', ''));
            setUpdateMessage(getConfigValue('force_update_message', 'A new version is available. Please update to continue.'));
        }
    }, [config]);

    const handleSave = (key: AppConfigKey, value: string) => {
        updateConfig.mutate({ key, value });
    };

    const handleForceUpdate = async () => {
        if (await confirm({ get title() { return uiI18n.t('app.are_you_sure_you_want_to_force_all_users_to_upda_d338d94b', { value0: __APP_VERSION__, value1: __APP_VERSION__ }); }, destructive: true })) {
            updateConfig.mutate({ key: 'min_supported_version', value: __APP_VERSION__ });
            updateConfig.mutate({ key: 'latest_version', value: __APP_VERSION__ });
            setMinVersion(__APP_VERSION__);
            setLatestVersion(__APP_VERSION__);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
                <Smartphone className="w-5 h-5 text-primary" />
                <h3 className="font-display text-lg font-semibold">{uiI18n.t('app.mobile_app_updates_18415522')}</h3>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Version Control */}
                <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-muted/20 border border-white/5 space-y-4">
                        <h4 className="font-medium flex items-center gap-2 text-sm">
                            <RefreshCw className="w-4 h-4 text-secondary" />
                            {uiI18n.t('app.version_control_57bdb60b')}
                        </h4>

                        <div className="space-y-3">
                            <div className="grid gap-2">
                                <Label htmlFor="latest_version">{uiI18n.t('app.latest_version_current_348485c1')} {__APP_VERSION__})</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="latest_version"
                                        value={latestVersion}
                                        onChange={(e) => setLatestVersion(e.target.value)}
                                        placeholder="e.g. 2.1.0"
                                    />
                                    <Button
                                        size="sm"
                                        onClick={() => handleSave('latest_version', latestVersion)}
                                        disabled={updateConfig.isPending}
                                    >
                                        <Save className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="min_version" className="text-destructive">{uiI18n.t('app.minimum_supported_version_aaddabf9')}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="min_version"
                                        value={minVersion}
                                        onChange={(e) => setMinVersion(e.target.value)}
                                        placeholder="e.g. 2.0.0"
                                        className="border-destructive/50 focus-visible:ring-destructive"
                                    />
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleSave('min_supported_version', minVersion)}
                                        disabled={updateConfig.isPending}
                                    >
                                        <Save className="w-4 h-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {uiI18n.t('app.users_with_versions_lower_than_this_will_be_forc_dfa7f34d')}
                                </p>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-white/5">
                            <Button
                                variant="outline"
                                className="w-full gap-2 border-primary/50 hover:bg-primary/10 text-primary"
                                onClick={handleForceUpdate}
                                disabled={updateConfig.isPending}
                            >
                                <AlertTriangle className="w-4 h-4" />
                                {uiI18n.t('app.force_update_to_current_24ba02d8')}{__APP_VERSION__})
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Update Configuration */}
                <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-muted/20 border border-white/5 space-y-4">
                        <h4 className="font-medium flex items-center gap-2 text-sm">
                            <Smartphone className="w-4 h-4 text-blue-400" />
                            {uiI18n.t('app.update_configuration_c67695c4')}
                        </h4>

                        <div className="space-y-3">
                            <div className="grid gap-2">
                                <Label htmlFor="download_url">{uiI18n.t('app.android_download_url_0eaf3743')}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="download_url"
                                        value={updateUrl}
                                        onChange={(e) => setUpdateUrl(e.target.value)}
                                        placeholder="https://..."
                                    />
                                    <Button
                                        size="sm"
                                        onClick={() => handleSave('android_download_url', updateUrl)}
                                        disabled={updateConfig.isPending}
                                    >
                                        <Save className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="update_message">{uiI18n.t('app.update_message_2d2dab5a')}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="update_message"
                                        value={updateMessage}
                                        onChange={(e) => setUpdateMessage(e.target.value)}
                                        placeholder={uiI18n.t('app.message_shown_to_users_ce635228')}
                                    />
                                    <Button
                                        size="sm"
                                        onClick={() => handleSave('force_update_message', updateMessage)}
                                        disabled={updateConfig.isPending}
                                    >
                                        <Save className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

