import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.tatakai.me',
  appName: 'Tatakai',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    hostname: 'tatakai.me',
    allowNavigation: [
      '*'
    ]
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    // WebView remote debugging is a dev-only escape hatch: leaving it on in
    // release builds exposes the app's WebView to any USB-connected debugger
    // and costs runtime overhead on low-end phones.
    webContentsDebuggingEnabled: false,
    backgroundColor: '#09090b',
    buildOptions: {
      releaseType: 'APK'
    }
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    scrollEnabled: true,
    backgroundColor: '#09090b',
    preferredContentMode: 'mobile'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: '#09090b',
      showSpinner: true,
      spinnerColor: '#a855f7',
      spinnerStyle: 'large',
      splashFullScreen: true,
      splashImmersive: true,
      androidScaleType: 'CENTER_CROP'
    },
    StatusBar: {
      // `light` in Capacitor means light *icons*, which is what the dark
      // Tatakai chrome needs. `dark` asks Android for a light status bar with
      // dark icons, causing the white strip seen above the WebView.
      style: 'light',
      backgroundColor: '#09090b',
      overlaysWebView: false
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true
    },
    CapacitorHttp: {
      // Keep the native client available for explicit high-value requests, but
      // do not monkey-patch every fetch/XHR in the WebView. The global patch
      // serializes ordinary API/Supabase traffic through an internal
      // `*capacitor_http_interceptor*` route and made navigation feel stalled.
      enabled: false,
    },
    LocalNotifications: {
      // Monochrome status-bar glyph (white kanji on transparent); Android tints it
      // with iconColor. The full-colour rounded logo is used per-notification as
      // `largeIcon: 'ic_notification_large'`. No custom `sound` → system default.
      smallIcon: 'ic_notification',
      iconColor: '#a855f7'
    }
  }
};

export default config;
