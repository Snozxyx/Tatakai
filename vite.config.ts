import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import packageJson from "./package.json";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Keep React dev JSX runtime consistent; production env strips jsxDEV.
  if (mode !== "production") {
    process.env.NODE_ENV = "development";
  }

  const isWebMode = mode === 'web';
  const isElectronBuild = (process.env.ELECTRON_BUILD || env.ELECTRON_BUILD) === 'true';
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT
    ? Number(env.VITE_HMR_CLIENT_PORT)
    : undefined;
  const backendOrigin =
    env.VITE_BACKEND_ORIGIN ||
    env.VITE_LOCAL_HIANIME_ORIGIN ||
    'https://api.tatakai.me';

  return {
    plugins: [react()],
    base: isElectronBuild ? './' : '/',
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      // Only generate sourcemaps if explicitly enabled (for debugging)
      sourcemap: mode === 'production' && ((process.env.ENABLE_SOURCEMAPS || env.ENABLE_SOURCEMAPS) === 'true'),
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: mode === 'production', // Remove console.log in production
          drop_debugger: mode === 'production',
        },
      },
      // Webapp specific build config
      rollupOptions: isWebMode ? {
        output: {
          // Don't generate service worker for webapp
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash].[ext]'
        }
      } : undefined,
    },
    server: {
      host: "::",
      port: isWebMode ? 8081 : 8088, // Standard port for Electron dev
      // Allow Discord Activity iframe to embed the app
      allowedHosts: [
        "tatakai.me",
        "gabhasti.tech",
        ".gabhasti.tech" // The dot allows all subdomains like api.gabhasti.tech
      ],
      hmr: {
        // In local development, let Vite infer the correct WS port.
        // Set VITE_HMR_CLIENT_PORT=443 only when reverse-proxied behind TLS.
        ...(hmrClientPort ? { clientPort: hmrClientPort } : {}),
      },
      proxy: {
        '/api/v2/anime/hianime': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false,
        },
        '/api/v2/hianime': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false,
        },
        // Preferred dev proxy for provider calls
        '/api/v2/anime': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false,
        },
        '/api/v2/manga': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false,
        },
        // Dev proxy for all provider calls → local TatakaiCore (https://api.tatakai.me)
        '/api/providers': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/api\/providers/, ''),
        },
        // Same-origin dev proxy to local HiAnime API (prevents browser CORS errors)
        '/api/tatakai': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/api\/tatakai/, '/api/v2/hianime'),
        },
        '/api/stream': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false,
        },
        '/api/servers': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false,
        },
        '/api/proxy': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false,
        },
        '/api/v1/streamingProxy': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false,
        },
        // Proxy all calls starting with /api/proxy/aniwatch to the third-party API (dev only)
        '/api/proxy/aniwatch': {
          target: 'https://aniwatch-api-taupe-eight.vercel.app',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/api\/proxy\/aniwatch/, '/api/v2/hianime'),
        },
      },
      // Allow embedding in Discord Activity iframe

    },
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __WEBAPP_MODE__: isWebMode,
    },
  }
});
