import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import "./utils/debug-extension"; // Extension debugger for console
import "@/lib/i18n"; // Must be loaded once before React renders
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WebappWrapper } from '@/components/WebappWrapper';
import { initConsoleProtection, logger } from '@/lib/logger';
import { initSentryClient } from '@/lib/sentry';
import { initDiscordActivity } from '@/lib/discordActivity';
import { installGlobalAdminSecretFetchPatch } from '@/lib/api/adminSecret';
import '@/lib/production'; // Suppress console in production

// Initialize Sentry (client) if configured
try {
  initSentryClient();
} catch { }

// Initialize production console protection early
initConsoleProtection();

// X-Admin-Secret injection disabled
// installGlobalAdminSecretFetchPatch();

import { analytics } from '@/core/analytics/AnalyticsService';
analytics.init();

// One-time native setup for the Capacitor mobile shell (status bar, keyboard,
// splash, platform CSS classes). `renderApp` awaits it below so extensions are
// present before the first route/nav query.
import { bootstrapMobile } from '@/lib/mobile/bootstrap';
import { isCapacitor } from '@/lib/platform/platform';

// Initialize Discord Activity SDK when running inside Discord embedded mode.
void initDiscordActivity();

// Global error handlers (captures window errors and unhandled promise rejections)
if (typeof window !== 'undefined') {
  // Check and expose Tauri API
  // if ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) {
  //   console.log('✅ Tauri API detected');
  // } else {
  //   console.log('❌ Tauri API not detected');
  // }

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

  // Capacitor already packages every web asset locally. A service worker in the
  // native WebView can intercept the virtual tatakai.me host (including the
  // Capacitor HTTP bridge), retain stale bundles after an APK update, and delay
  // normal navigation. Remove registrations left by older mobile builds.
  if ('serviceWorker' in navigator && isCapacitor()) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    });
  // Keep development builds free of stale cached bundles.
  } else if ('serviceWorker' in navigator && !import.meta.env.PROD) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    });
  }

  // Register service worker for PWA only in production (non-webapp mode).
  if ('serviceWorker' in navigator && !isCapacitor() && import.meta.env.PROD && import.meta.env.MODE !== 'web') {
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

async function renderApp() {
  // Native source discovery must be ready before routes/nav mount. Otherwise
  // their first React Query request caches an empty extension/custom-source
  // catalogue for five minutes.
  await bootstrapMobile();
  createRoot(document.getElementById("root")!).render(
    <HelmetProvider>
      <ErrorBoundary>
        <WebappWrapper>
          <App />
        </WebappWrapper>
      </ErrorBoundary>
    </HelmetProvider>
  );
}

void renderApp();
