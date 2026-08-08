import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import Index from "@/pages/base/Index";
import Landingpage from "@/pages/base/LandingPage";

/**
 * `/` — native/desktop gets the full app home; web guests get the marketing landing.
 */
export default function HomeGate() {
  const isNative = useIsNativeApp();
  return isNative ? <Index /> : <Landingpage />;
}
