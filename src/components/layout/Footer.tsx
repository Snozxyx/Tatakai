import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { Link } from 'react-router-dom';
import { Heart, Github, Twitter, MessageCircle, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const SOCIAL_LINKS = [
  { icon: MessageCircle, get label() { return uiI18n.t('app.discord_bccc14ee'); }, url: 'https://discord.gg/Mt2jG5QuGP', color: 'hover:text-[#5865F2]' },
  { icon: Github, get label() { return uiI18n.t('app.github_5442e2b6'); }, url: 'https://github.com/snozxyx/tatakai', color: 'hover:text-[#fff]' },
];

const FOOTER_LINKS = {
  Product: [
    { get label() { return uiI18n.t('app.home_70f8bb9a'); }, path: '/' },
    { get label() { return uiI18n.t('app.collections_4bbb632f'); }, path: '/collections' },
    { get label() { return uiI18n.t('app.trending_8a12d562'); }, path: '/trending' },
    { get label() { return uiI18n.t('app.suggestions_861edba0'); }, path: '/suggestions' },
  ],
  Support: [
    { get label() { return uiI18n.t('app.community_bfd58ee3'); }, path: '/community' },
    { get label() { return uiI18n.t('app.community_guidelines_75343669'); }, path: '/community-guidelines' },
    { get label() { return uiI18n.t('app.terms_of_service_0c8a9a95'); }, path: '/terms' },
    { get label() { return uiI18n.t('app.privacy_policy_9db108ba'); }, path: '/privacy' },
    { get label() { return uiI18n.t('app.dmca_844327d3'); }, path: '/dmca' },
  ],
  Socials: [
    { get label() { return uiI18n.t('app.discord_bccc14ee'); }, path: 'https://discord.gg/Mt2jG5QuGP', isExternal: true },
    { get label() { return uiI18n.t('app.github_c53ced31'); }, path: 'https://github.com/snozxyx/tatakai', isExternal: true },
  ]
};

export function Footer() {
  useUiTranslation();
  const { t } = useTranslation();
  const FOOTER_LINKS = {
    [t('layout.footerProduct')]: [
      { label: t('nav.home'), path: '/' },
      { label: t('layout.footerCollections'), path: '/collections' },
      { label: t('nav.trending'), path: '/trending' },
      { label: t('layout.footerSuggestions'), path: '/suggestions' },
    ],
    [t('layout.footerSupport')]: [
      { label: t('nav.community'), path: '/community' },
      { label: t('layout.footerCommunityGuidelines'), path: '/community-guidelines' },
      { label: t('layout.footerTerms'), path: '/terms' },
      { label: t('layout.footerPrivacy'), path: '/privacy' },
      { label: t('layout.footerDmca'), path: '/dmca' },
    ],
    [t('layout.footerSocials')]: [
      { get label() { return uiI18n.t('app.discord_bccc14ee'); }, path: 'https://discord.gg/Mt2jG5QuGP', isExternal: true },
      { get label() { return uiI18n.t('app.github_c53ced31'); }, path: 'https://github.com/snozxyx/tatakai', isExternal: true },
    ]
  };
  return (
    <footer className="relative  pt-20 pb-10 overflow-hidden border-t border-white/5 bg-black/40 backdrop-blur-xl">
      {/* Background Gradients */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className=" absolute bottom-0 left-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] transform translate-y-1/2 -translate-x-1/2 mix-blend-screen" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] transform translate-y-1/2 translate-x-1/2 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-16">
          {/* Brand Column */}
          <div className="lg:col-span-5 space-y-6">
            <Link to="/" className="block w-fit group">
              <h2 className="text-4xl font-black tracking-tighter text-white font-display group-hover:opacity-80 transition-opacity">
                {uiI18n.t('app.tatakai_72f9bae9')}
              </h2>
            </Link>
            <p className="text-muted-foreground leading-relaxed max-w-md text-lg font-medium">
              {t('layout.footerTagline')}
            </p>
            <div className="flex items-center gap-4">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center transition-all hover:scale-110 hover:bg-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]",
                    social.color
                  )}
                  aria-label={social.label}
                >
                  <social.icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Links Columns */}
          <div className="lg:col-span-7 grid grid-cols-2 md:grid-cols-3 gap-8">
            {Object.entries(FOOTER_LINKS).map(([category, links]) => (
              <div key={category} className="space-y-4">
                <h3 className="font-bold text-lg text-white">{category}</h3>
                <ul className="space-y-3">
                  {links.map((link) => (
                    <li key={link.label}>
                      {link.isExternal ? (
                        <a 
                          href={link.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2 group w-fit"
                        >
                          {link.label}
                          <ExternalLink className="w-3 h-3 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
                        </a>
                      ) : (
                        <Link 
                          to={link.path}
                          className="text-muted-foreground hover:text-primary transition-colors block w-fit"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>{t('layout.footerRights', { year: new Date().getFullYear() })}</p>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 hover:text-red-500 transition-colors cursor-default select-none group">
              {t('layout.footerMadeWith')} <Heart className="w-4 h-4 fill-current group-hover:animate-pulse" /> {t('layout.footerByTeam')}
            </span>
          </div>
        </div>
        
        {/* Simplified Educational Disclaimer for clean look */}
         <div className="mt-8 text-center opacity-40 hover:opacity-100 transition-opacity">
          <p className="text-[10px] text-muted-foreground">
            {t('layout.footerDisclaimer')}
          </p>
        </div>
      </div>
    </footer>
  );
}
