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
      '*.tatakai.me',
      'tatakaicore.vercel.app',
      '*.tatakaicore.vercel.app',
      '*.supabase.co',
      '*.supabase.in',
      '*.consumet.org',
      '*.gogoanime.com.pe',
      '*.ani-x.top',
      '*.watchanimeworld.site',
      '*.github.com',
      '*.githubusercontent.com',
      '*.megacloud.blog',
      '*.rabbitstream.net'
    ]
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false, // Disable for production
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
      style: 'dark',
      backgroundColor: '#09090b',
      overlaysWebView: false
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true
    },
    CapacitorHttp: {
      enabled: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#a855f7',
      sound: 'notification.wav'
    }
  }
};

export default config;
