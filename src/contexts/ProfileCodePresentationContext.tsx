import { createContext, useContext } from 'react';

export const ProfileCodePresentationContext = createContext({ enabled: false, hidden: false, toggle: () => {} });
export function useProfileCodePresentation() { return useContext(ProfileCodePresentationContext); }
