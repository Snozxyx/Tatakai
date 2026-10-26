import { CosmeticAvatar, CosmeticName } from '@/components/profile/IdentityCosmetics';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
"use client";

import { useState, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const navLinks = [
  { labelKey: 'app.browse_2f3b5c55', href: '/browse' },
  { labelKey: 'nav.favorites', href: '/favorites' },
  { labelKey: 'nav.community', href: '/community' },
  { labelKey: 'nav.calendar', href: '/calendar' },
  { labelKey: 'app.download_a479c9c3', href: '/download' },
];

export function Navigation() {
  useUiTranslation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setIsMobileMenuOpen(false);
    navigate("/welcome");
  };

  // Full-screen mobile menu. Rendered through a portal to `document.body` for
  // two reasons.
  //
  // 1. Containing block: some layout ancestors (the `main` in MainLayout) carry
  //    `transform` and `will-change: scroll-position`, which makes them the
  //    containing block for `position: fixed`. Anchored there, `inset-0`
  //    stretched this overlay to the full *document* height (~11.5kpx) instead
  //    of the viewport, and the links' `justify-center` parked them 5.7kpx
  //    below the fold. Tapping the hamburger opened onto a black screen.
  // 2. Stacking: portalling out keeps it above the page's decorative layers.
  //    The hero's blurred orbs are `position: fixed`, so they are painted on top
  //    of the first viewport of a body-anchored overlay; `overflow-hidden` while
  //    open clips that bleed.
  const renderMobileMenu = () => {
    const overlay = (
      <DialogPrimitive.Content aria-describedby={undefined}
        className={`lg:hidden fixed inset-0 z-[55] bg-background overflow-hidden transition-[background-color,border-color,opacity,transform] duration-200 ${isMobileMenuOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"}`}
      >
        <DialogPrimitive.Title className="sr-only">{uiI18n.t('app.navigation_cf03cf2e')}</DialogPrimitive.Title>
        {/* Overlay close button */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 h-20">
          <Link
            to={user ? "/browse" : "/welcome"}
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-2 group"
          >
            <span className="font-display tracking-tight text-2xl text-foreground">{uiI18n.t('app.tatakai_72f9bae9')}</span>
            <span className="font-mono text-xs mt-1 text-muted-foreground">{uiI18n.t('app.anime_80b75c1a')}</span>
          </Link>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="min-h-11 min-w-11 p-2 text-foreground"
            aria-label={uiI18n.t('app.close_menu_6c9fc990')}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col h-full px-8 pt-28 pb-8">
          {/* Navigation Links */}
          <div className="flex-1 flex flex-col justify-center gap-6">
            {navLinks.map((link, i) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`text-4xl font-display text-foreground hover:text-muted-foreground transition-[background-color,border-color,opacity,transform] duration-200 ${isMobileMenuOpen
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4"}`}
                style={{ transitionDelay: isMobileMenuOpen ? `${i * 60}ms` : "0ms" }}
              >
                {uiI18n.t(link.labelKey)}
              </Link>
            ))}
          </div>

          {/* Bottom CTAs */}
          <div className={`flex gap-4 pt-8 border-t border-foreground/10 transition-[background-color,border-color,opacity,transform] duration-200 ${isMobileMenuOpen
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"}`}
          style={{ transitionDelay: isMobileMenuOpen ? "250ms" : "0ms" }}
          >
            {user ? (
              <Button
                variant="outline"
                className="flex-1 rounded-full h-14 text-base gap-2"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4" />
                {uiI18n.t('app.sign_out_61fd08ff')}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="flex-1 rounded-full h-14 text-base"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  navigate("/auth");
                }}
              >
                {uiI18n.t('app.sign_in_ada2e9e9')}
              </Button>
            )}

            <Button
              className="flex-1 bg-foreground text-background rounded-full h-14 text-base"
              onClick={() => {
                setIsMobileMenuOpen(false);
                navigate(user ? "/browse" : "/auth");
              }}
            >
              {user ? uiI18n.t('app.watch_now_fe70cb6e') : uiI18n.t('app.get_started_bd2cb051')}
            </Button>
          </div>
        </div>
      </DialogPrimitive.Content>
    );

    return <DialogPrimitive.Portal>{overlay}</DialogPrimitive.Portal>;
  };

  return (
    <DialogPrimitive.Root open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
      {renderMobileMenu()}

      <header
        className={`fixed z-50 transition-[background-color,border-color,opacity,transform] duration-200 ${isScrolled
            ? "top-4 left-4 right-4"
            : "top-0 left-0 right-0"}`}
      >
        <nav
          className={`mx-auto transition-[background-color,border-color,opacity,transform] duration-200 ${isScrolled || isMobileMenuOpen
              ? "bg-background/80 backdrop-blur-xl border border-foreground/10 rounded-2xl shadow-lg max-w-[1200px]"
              : "bg-transparent max-w-[1400px]"}`}
        >
          <div
            className={`flex items-center justify-between transition-[background-color,border-color,opacity,transform] duration-200 px-6 lg:px-8 ${isScrolled ? "h-14" : "h-20"}`}
          >
            {/* Logo */}
            <Link to={user ? "/browse" : "/welcome"} className="flex items-center gap-2 group">
              <span className={`font-display tracking-tight transition-[background-color,border-color,opacity,transform] duration-200 ${isScrolled ? "text-xl text-foreground" : "text-2xl text-white"}`}>{uiI18n.t('app.tatakai_72f9bae9')}</span>
              <span className={`font-mono transition-[background-color,border-color,opacity,transform] duration-200 ${isScrolled ? "text-[10px] mt-0.5 text-muted-foreground" : "text-xs mt-1 text-white/60"}`}>{uiI18n.t('app.anime_80b75c1a')}</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-4 xl:gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`text-sm transition-colors duration-300 relative group ${isScrolled ? "text-foreground/70 hover:text-foreground" : "text-white/70 hover:text-white"}`}
                >
                  {uiI18n.t(link.labelKey)}
                  <span className={`absolute -bottom-1 left-0 w-0 h-px transition-[background-color,border-color,opacity,transform] duration-300 group-hover:w-full ${isScrolled ? "bg-foreground" : "bg-white"}`} />
                </Link>
              ))}
            </div>

            {/* Desktop CTA */}
            <div className="hidden lg:flex items-center gap-4">
              {user ? (
                <div className="flex items-center gap-3">
                  <Link
                    to="/profile"
                    className={`flex items-center gap-2 text-sm transition-[background-color,border-color,opacity,transform] duration-200 ${isScrolled ? "text-foreground/80 hover:text-foreground" : "text-white/80 hover:text-white"}`}
                  >
                    <CosmeticAvatar userId={profile?.user_id} className="h-7 w-7 border border-white/20">
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                        {(profile?.display_name || user.email || "U")[0].toUpperCase()}
                      </AvatarFallback>
                    </CosmeticAvatar>
                    <span className="font-medium text-xs max-w-[100px] truncate">
                      <CosmeticName userId={profile?.user_id}>{profile?.display_name || user.email?.split('@')[0]}</CosmeticName>
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSignOut}
                    className={`h-8 w-8 rounded-full ${isScrolled ? "text-foreground/70 hover:text-foreground hover:bg-foreground/10" : "text-white/70 hover:text-white hover:bg-white/10"}`}
                    title={uiI18n.t('app.sign_out_dc1649a1')}
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Link
                  to="/auth"
                  className={`transition-[background-color,border-color,opacity,transform] duration-200 font-medium ${isScrolled ? "text-xs text-foreground/70 hover:text-foreground" : "text-sm text-white/70 hover:text-white"}`}
                >
                  {uiI18n.t('app.sign_in_ada2e9e9')}
                </Link>
              )}

              <Button
                size="sm"
                onClick={() => navigate(user ? "/browse" : "/auth")}
                className={`rounded-full transition-[background-color,border-color,opacity,transform] duration-200 font-medium ${isScrolled ? "bg-foreground hover:bg-foreground/90 text-background px-4 h-8 text-xs" : "bg-white hover:bg-white/90 text-black px-6"}`}
              >
                {user ? uiI18n.t('app.watch_now_fe70cb6e') : uiI18n.t('app.get_started_bd2cb051')}
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <DialogPrimitive.Trigger asChild>
            <button
              className={`lg:hidden min-h-11 min-w-11 p-2 transition-colors duration-200 relative z-[60] ${isScrolled || isMobileMenuOpen ? "text-foreground" : "text-white"}`}
              aria-label={uiI18n.t('app.toggle_menu_52092247')}
              aria-expanded={isMobileMenuOpen}
              aria-haspopup="dialog"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
            </DialogPrimitive.Trigger>
          </div>
        </nav>
      </header>
    </DialogPrimitive.Root>
  );
}
