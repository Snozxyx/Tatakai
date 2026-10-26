import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

interface ProfilePresentationState {
  fullPage: boolean;
  register: (locationKey: string, token: symbol) => () => void;
}

const ProfilePresentationContext = createContext<ProfilePresentationState>({
  fullPage: false,
  register: () => () => {},
});

/** A custom profile owns navigation only while its route is mounted. */
export function ProfilePresentationProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [surface, setSurface] = useState<{ locationKey: string; token: symbol } | null>(null);
  const register = useCallback((locationKey: string, token: symbol) => {
    setSurface({ locationKey, token });
    return () => setSurface(current => current?.token === token ? null : current);
  }, []);
  const value = useMemo<ProfilePresentationState>(() => ({
    fullPage: surface?.locationKey === location.key,
    register,
  }), [location.key, surface, register]);
  return <ProfilePresentationContext.Provider value={value}>{children}</ProfilePresentationContext.Provider>;
}

export function useProfilePresentation() {
  return useContext(ProfilePresentationContext);
}

export function FullPageProfileSurface({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { register } = useProfilePresentation();
  useLayoutEffect(() => register(location.key, Symbol('profile-theme')), [location.key, register]);
  return <>{children}</>;
}
