import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { Button } from '@/components/ui/button';
export function ExtensionsPanel() {
  const navigate = useNavigate(); const { t } = useTranslation(); const { closeSettings } = useSettingsModal();
  const go = (path: string) => { closeSettings(); navigate(path); };
  return <div className="space-y-4"><p className="text-muted-foreground">{t('feedback.extensionsDescription')}</p><div className="flex flex-wrap gap-3"><Button onClick={() => go('/extensions/manage')}>{t('feedback.manageExtensions')}</Button><Button variant="outline" onClick={() => go('/extensions')}>{t('feedback.discoverExtensions')}</Button></div></div>;
}
