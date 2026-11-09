import { lazy, Suspense } from 'react';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CustomizationScopeProvider, useCustomization } from '@/hooks/ui/useCustomization';
import { useSystemDark } from '@/hooks/ui/useTheme';
import { getThemeCustomization } from '@/lib/customization';
import { resolveThemeSelection } from '@/lib/themeSelection';
import { readTVAppearance } from '@/core/tv/appearance';
import { resolveTVTheme, tvThemeStyle } from '@/core/tv/themes';
import { AppearanceBackground } from '@/components/settings/BackgroundEditor';
import { TVLoadingScreen } from '@/components/tv/TVLoadingScreen';
import '@/layouts/tv.css';
import '@/layouts/tv-atmosphere.css';
import '@/layouts/tv-refined.css';
import '@/layouts/tv-reference.css';

const TVHome = lazy(() => import('./TVHomePage'));
const TVBooks = lazy(() => import('./TVBooksPage'));

/** Render actual TV sections inside a local preview without changing device mode. */
export default function TVLayoutCustomizationPage() {
  const { page } = useParams();
  const location = useLocation();
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const { settings } = useCustomization();
  const systemDark = useSystemDark();
  const theme = resolveTVTheme(params.get('customizationTheme') || (settings.tvSelection ? resolveThemeSelection(settings.tvSelection, systemDark) : readTVAppearance().theme));
  const config = getThemeCustomization(settings, theme);
  if (!['home', 'manga', 'novel'].includes(page || '')) return <Navigate to={`/customize-tv/home${location.search}`} replace />;
  const label = page === 'home' ? 'animeHome' : page === 'manga' ? 'mangaHome' : 'novelHome';
  return <CustomizationScopeProvider target="tv" themeId={theme}><section className="tatakai-tv tv-layout-customization" aria-label={t('customization.tvIndependent')}>
    <div className="tv-shell" style={{ ...tvThemeStyle(theme, config.palette), height: 'auto', minHeight: '100vh', overflow: 'visible', padding: '1.5rem 2vw 3rem', position: 'relative' }}>
      <AppearanceBackground background={config.background} />
      <div className="relative z-10"><h1 className="mb-4">{t('customization.tv')} · {t(`customization.${label}`)}</h1>
        <Suspense fallback={<TVLoadingScreen />}>{page === 'home' ? <TVHome /> : <TVBooks key={page} kind={page as 'manga' | 'novel'} />}</Suspense>
      </div>
    </div>
  </section></CustomizationScopeProvider>;
}
