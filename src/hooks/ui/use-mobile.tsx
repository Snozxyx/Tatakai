import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

/**
 * True on phone-width viewports only (< 768px) — the phone bottom navigation bar
 * lives below this line; at the tablet breakpoint and above the app uses the web
 * floating sidebar instead, so tablets get the desktop layout rather than a
 * stretched bottom bar.
 */
export function useIsPhone() {
  return useIsMobile();
}
