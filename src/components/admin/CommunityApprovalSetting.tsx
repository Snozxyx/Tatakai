import { useTranslation } from 'react-i18next';
import { useAppConfig } from '@/hooks/ui/useAppConfig';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
export function CommunityApprovalSetting() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const config = useAppConfig();
  if (!isAdmin) return null;
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
      <div>
        <label
          htmlFor="community-image-approval"
          className="text-sm font-semibold"
        >
          {t('communityControls.imageApproval')}
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('communityControls.imageApprovalDescription')}
        </p>
      </div>
      <Switch
        id="community-image-approval"
        disabled={config.isLoading || config.updateConfig.isPending}
        checked={
          config.getConfigValue(
            'community_image_approval_required',
            'false'
          ) === 'true'
        }
        onCheckedChange={(value) =>
          config.updateConfig.mutate({
            key: 'community_image_approval_required',
            value: String(value),
          })
        }
      />
    </div>
  );
}
