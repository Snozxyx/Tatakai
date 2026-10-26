import { BRAND_ASSET_BASE } from '@/lib/assets';
import { Link } from 'react-router-dom';
import { FileInput, Languages, Layers, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/ui/Reveal';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import uiI18n from '@/lib/uiI18n';

export function Translate() {
  useUiTranslation();
  const steps = [
    { icon: FileInput, title: 'translateImportTitle', body: 'translateImportBody' },
    { icon: Languages, title: 'translateEditTitle', body: 'translateEditBody' },
    { icon: Layers, title: 'translateExportTitle', body: 'translateExportBody' },
  ];
  return (
    <section className="border-t border-border py-16 lg:py-28" aria-labelledby="translate-heading">
      <Reveal>
        <div className="mb-10 flex max-w-3xl flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Tatakai Translate</p>
          <h2 id="translate-heading" className="font-display text-3xl font-bold tracking-tight sm:text-5xl">{uiI18n.t('extensionUpdate.translateTitle')}</h2>
          <p className="text-lg text-muted-foreground">{uiI18n.t('extensionUpdate.translateBody')}</p>
        </div>
        <img
          src={`${BRAND_ASSET_BASE}/translate-workspace.png`}
          alt="Tatakai Translate desktop workspace with page thumbnails, editing tools, and text layer properties"
          className="mb-10 w-full rounded-2xl border border-border"
          width={1920}
          height={1020}
          loading="lazy"
          decoding="async"
        />
        <ol className="grid gap-6 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="flex flex-col gap-3 border-t border-border pt-6">
              <div className="flex items-center gap-3 text-primary"><Icon className="size-6" aria-hidden="true" /><span className="text-xs font-bold">0{index + 1}</span></div>
              <h3 className="text-lg font-bold">{uiI18n.t(`extensionUpdate.${title}`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{uiI18n.t(`extensionUpdate.${body}`)}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-col items-start gap-4">
          <Button asChild><Link to="/download">{uiI18n.t('extensionUpdate.translateDownload')}<ArrowRight className="ml-2 size-4" aria-hidden="true" /></Link></Button>
          <p className="max-w-3xl text-sm text-muted-foreground">{uiI18n.t('extensionUpdate.translateRequirements')}</p>
        </div>
      </Reveal>
    </section>
  );
}
