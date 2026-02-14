import { useEffect } from 'react';

interface WebappWrapperProps {
  children: React.ReactNode;
}

export function WebappWrapper({ children }: WebappWrapperProps) {
  useEffect(() => {
    // Disable PWA features for webapp
    if ('serviceWorker' in navigator && import.meta.env.MODE === 'web') {
      // Unregister any existing service workers
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          registration.unregister();
        });
      });
    }

    // Disable deep linking for webapp
    if (import.meta.env.MODE === 'web') {
      // Remove any deep link handling
      localStorage.removeItem('tatakai_deep_link');
    }
  }, []);

  return <>{children}</>;
}
