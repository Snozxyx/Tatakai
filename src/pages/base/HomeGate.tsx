import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import { lazy } from 'react';
const Index = lazy(() => import('@/pages/base/Index'));
const Landingpage = lazy(() => import('@/pages/base/LandingPage'));

/**
 * `/` — native/desktop gets the full app home; web guests get the marketing landing.
 */
export default function HomeGate() {
  const isNative = useIsNativeApp();
  return isNative ? <Index /> : <Landingpage />;
}
