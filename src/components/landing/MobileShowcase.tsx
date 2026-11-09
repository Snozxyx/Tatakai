import { BRAND_ASSET_BASE } from '@/lib/assets';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Smartphone, SlidersHorizontal, Check } from 'lucide-react';

const phones = [
  { file: 'mobile_home.jpg', key: 'home' },
  { file: 'mobile_watch.jpg', key: 'watch' },
  { file: 'mobile_animeinfo.jpg', key: 'details' },
  { file: 'mobile_mangahome.jpg', key: 'manga' },
  { file: 'mobile_mangaread.jpg', key: 'reader' },
  { file: 'mobile_community.jpg', key: 'community' },
  { file: 'mobile_download.jpg', key: 'downloads' },
  { file: 'mobile_profile.jpg', key: 'profile' },
] as const;

export function MobileShowcase() {
  useUiTranslation();
  const [active, setActive] = useState(0);
  const shot = phones[active];
  return <section data-landing-mobile className="relative" aria-labelledby="mobile-heading">
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)] lg:gap-16">
      <div>
        <p className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-white/65"><Smartphone aria-hidden className="size-4" />{uiI18n.t('app.mobile_app_cd39eab7')}</p>
        <h2 id="mobile-heading" className="max-w-xl font-display text-white">{uiI18n.t('landingMobile.title')}</h2>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">{uiI18n.t('landingMobile.description')}</p>
        <div role="group" aria-label={uiI18n.t('landingMobile.chooseScreen')} className="mt-8 grid grid-cols-2 gap-2">
          {phones.map((item, index) => <button key={item.key} type="button" aria-pressed={active === index} aria-controls="mobile-screen-preview" onClick={() => setActive(index)}
            className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors duration-150 sm:min-h-16 sm:px-4 ${active === index ? 'border-primary/40 bg-white/[.06]' : 'border-white/10 bg-transparent hover:bg-white/[.035]'}`}>
            <span className="min-w-0"><span className="block text-sm font-medium text-white">{uiI18n.t(`landingMobile.${item.key}Title`)}</span>
              <span className="mt-1 hidden text-xs text-white/60 sm:block">{uiI18n.t(`landingMobile.${item.key}Line`)}</span></span>
            {active === index && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
          </button>)}
        </div>
        <Link to="/download" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-medium text-black hover:bg-white/90">
          {uiI18n.t('landingMobile.download')}<ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <figure id="mobile-screen-preview" className="mx-auto w-full max-w-[280px] lg:max-w-[300px]">
        <div data-phone-frame className="overflow-hidden rounded-3xl border border-white/15 bg-[#111011] p-2">
          <img src={`${BRAND_ASSET_BASE}/${shot.file}`} alt={uiI18n.t(`landingMobile.${shot.key}Title`)} width={1080} height={2400}
            className="block aspect-[9/20] h-auto w-full rounded-2xl object-cover object-top" loading="lazy" decoding="async" draggable={false} />
        </div>
        <figcaption className="mt-4 text-center text-sm text-white/65" aria-live="polite">{uiI18n.t(`landingMobile.${shot.key}Line`)}</figcaption>
      </figure>
    </div>
    <article className="mt-10 grid overflow-hidden rounded-2xl border border-white/10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.7fr)]">
      <img src={`${BRAND_ASSET_BASE}/mobile_playersetting.jpg`} alt={uiI18n.t('app.player_settings_c1823e10')} loading="lazy" decoding="async"
        className="aspect-[16/9] h-full w-full object-cover object-center" />
      <div className="flex flex-col justify-center p-6 lg:p-8"><SlidersHorizontal aria-hidden className="mb-4 size-[18px] text-white/60" />
        <h3 className="font-display text-2xl font-medium text-white">{uiI18n.t('app.fine_tuned_playback_afe69d95')}</h3>
        <p className="mt-3 text-sm leading-relaxed text-white/70">{uiI18n.t('landingMobile.playback')}</p>
      </div>
    </article>
  </section>;
}
