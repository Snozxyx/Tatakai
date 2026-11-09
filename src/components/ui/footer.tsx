import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
"use client";

import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

const footerLinks = {
  Browse: [
    { name: "Browse catalog", href: "/browse" },
    { name: "Community", href: "/community" },
    { name: "Trending", href: "/trending" },
    { name: "Favorites", href: "/favorites" },
  ],
  Support: [
    { name: "Community", href: "/community" },
    { name: "Terms of service", href: "/terms" },
    { name: "Privacy policy", href: "/privacy" },
    { name: "DMCA", href: "/dmca" },
  ],
  FAQ: [
    { name: "Tatakai vs Seanime", href: "/faq/seanime-vs-tatakai" },
    { name: "Extension support", href: "/faq/extension-support" },
  ],
  Apps: [
    { name: "Download apps", href: "/download" },
   { name: "Developer", href: "https://dev.tatakai.app" },

    { name: "Desktop & mobile", href: "/download" },
    { name: "Web version", href: "/browse" },
    { name: "System status", href: "/status" },
  ],

};

const socialLinks = [
  { name: "Discord", href: "https://discord.gg/Mt2jG5QuGP" },
  { name: "GitHub", href: "https://github.com/snozxyx/tatakai" },
];



export function FooterSection() {
  useUiTranslation();
  return (
    <footer className="landing-footer border-t border-white/10 bg-black text-white">
      <div className="mx-auto max-w-[1440px] px-6 pt-16 lg:px-16">
        <div className="grid gap-10 pb-16 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{uiI18n.t('app.tatakai_72f9bae9')}</h2>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">{uiI18n.t('app.landing_footer_description')}</p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3">
              {socialLinks.map(link => <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-white/70 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{link.name}<ArrowUpRight className="h-3.5 w-3.5" /></a>)}
            </div>
          </div>
          {Object.entries(footerLinks).map(([title, links]) => <div key={title}>
            <h3 className="mb-5 text-sm font-medium text-white">{title}</h3>
            <ul className="space-y-3">{links.map(link => <li key={link.name}>
              {/^https?:/.test(link.href) ? <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-sm text-white/70 transition-colors hover:text-white">{link.name}</a> : <Link to={link.href} className="text-sm text-white/70 transition-colors hover:text-white">{link.name}</Link>}
            </li>)}</ul>
          </div>)}
        </div>
        <div className="flex flex-col gap-3 border-t border-white/10 py-6 text-xs text-white/65 sm:flex-row sm:items-center sm:justify-between">
          <p>{uiI18n.t('app.landing_footer_copyright', { year: new Date().getFullYear() })}</p>
          <Link to="/status" className="transition-colors hover:text-white">{uiI18n.t('app.landing_footer_status')}</Link>
        </div>
      </div>
    </footer>
  );
}
