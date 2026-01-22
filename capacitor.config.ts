import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'gabhasti.tatakai.tech',
  appName: 'Tatakai',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    hostname: 'tatakai.app',
    allowNavigation: [
      '*.tatakai.app',
      'tatakaicore.vercel.app',
      '*.tatakaicore.vercel.app',
      '*.supabase.co',
      '*.supabase.in',
      '*.consumet.org',
      '*.gogoanime.com.pe',
      '*.ani-x.top',
      '*.watchanimeworld.site'
    ]
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
      channel: 'production',
      stats: true,
      resetWhenUpdateFailed: true
    },
    CapacitorHttp: {
      enabled: true,
    }
  }
};

export default config;
