import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { detectGeneralCommunityLanguage } from '@/lib/community/generalLanguage';

export function GeneralCommunityLanguageWarning({ content, enabled = true }: { content: string; enabled?: boolean }) {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState<string | null>(null);
  useEffect(() => {
    setLanguage(null);
    if (!enabled) return;
    const timer = setTimeout(() => setLanguage(detectGeneralCommunityLanguage(content)), 600);
    return () => clearTimeout(timer);
  }, [content, enabled]);
  if (!enabled || !language) return null;
  const name = new Intl.DisplayNames([i18n.resolvedLanguage || 'en'], { type: 'language' }).of(language) || language;
  return <div role="status" className="my-3 flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm text-foreground">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
    <div className="min-w-0 space-y-1">
      <p>{t('community.generalLanguage.warning', { language: name, defaultValue: 'Please write in English in the general community. If you prefer to write in {{language}}, use your language’s community. If there isn’t one yet, let an admin know so they can create it for you.' })}</p>
      <Link to="/community#communities" className="font-medium text-primary underline underline-offset-2">{t('community.generalLanguage.browse', { defaultValue: 'Browse communities' })}</Link>
    </div>
  </div>;
}
