import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WebappWrapper } from '@/components/WebappWrapper';
import { initConsoleProtection, logger } from '@/lib/logger';
import { initSentryClient } from '@/lib/sentry';
import { initDiscordActivity } from '@/lib/discordActivity';
import '@/lib/production'; // Suppress console in production

// Initialize Sentry (client) if configured
try {
  initSentryClient();
} catch { }

// Initialize production console protection early
initConsoleProtection();

// Production mode: suppress console in production (already handled by production.ts import)

import { analytics } from '@/services/AnalyticsService';
analytics.init();

// Global error handlers (captures window errors and unhandled promise rejections)
if (typeof window !== 'undefined') {
  // Check and expose Tauri API
  if ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) {
    console.log('✅ Tauri API detected');
  } else {
    console.log('❌ Tauri API not detected');
  }

  window.addEventListener('error', (event) => {
    try {
      const payload = (event && (event as ErrorEvent).error) || event.message || 'window.error';
      void logger.error(payload);
    } catch { }
  });

  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const reason = (ev && (ev as PromiseRejectionEvent).reason) || 'unhandledrejection';
      void logger.error(reason);
    } catch { }
  });

  // Register service worker for PWA (only in non-webapp mode)
  if ('serviceWorker' in navigator && import.meta.env.MODE !== 'web') {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration.scope);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    });
  }
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <ErrorBoundary>
      <WebappWrapper>
        <App />
      </WebappWrapper>
    </ErrorBoundary>
  </HelmetProvider>
);
