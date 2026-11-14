import type { ReactNode } from 'react';
import { Header, type HeaderProps } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import '@/pages/adult/adult-surfaces.css';

/** The layout owns the desktop rail, so adult pages only supply their content gutter. */
export function AdultPageShell({ children, className = '', header }: { children: ReactNode; className?: string; header?: HeaderProps | false }) {
  const desktop = useIsDesktopApp();
  return <div className={'adult-page min-h-screen bg-background ' + className}>
    <main className="app-page adult-page-content" data-desktop={desktop}>
      {header !== false && <Header alignWithPage {...header} />}
      {children}
    </main>
    <MobileNav />
  </div>;
}
