import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import packageJson from "./package.json";
import { seoPreviewPlugin } from "./scripts/seo/vite-seo-preview.mjs";

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
  const apiV3Origin = env.VITE_API_V3_ORIGIN || "https://api.tatakai.me";

  return {
    plugins: [react(), seoPreviewPlugin()],
    // Production console/debugger stripping (terser `drop_console` parity).
    esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
    base: isElectronBuild ? './' : '/',
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      // Guarantee a SINGLE physical copy of React and any library that reads
      // React context. Without this, Vite's dep pre-bundler can emit two copies
      // of @tanstack/react-query bound to two different React instances, so
      // useQuery's `useContext` hits a null dispatcher →
      // "Cannot read properties of null (reading 'useContext')" / "Invalid hook
      // call" and the whole tree unmounts.
      dedupe: [
        'react',
        'react-dom',
        '@tanstack/react-query',
        'react-router',
        'react-router-dom',
      ],
    },
    // Pre-bundle React + the context-bearing libs in the FIRST optimize pass so a
    // lazily-loaded route (e.g. BecauseYouWatched) can't trigger a mid-session
    // re-optimization that spawns a second React instance under a new `?v=` hash.
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        '@tanstack/react-query',
        'react-router-dom',
      ],
    },
    build: {
      // Only generate sourcemaps if explicitly enabled (for debugging)
      sourcemap: mode === 'production' && ((process.env.ENABLE_SOURCEMAPS || env.ENABLE_SOURCEMAPS) === 'true'),
      // Skip the gzip-size pass: it re-compresses every chunk in memory after
      // minify and was a measurable part of peak build memory on this repo's
      // ~5000-module graph. Output files are unchanged.
      reportCompressedSize: false,
      // esbuild minify: terser OOM'd its worker on this graph even with a 6GB
      // heap (worker threads don't inherit NODE_OPTIONS), failing every
      // production build. esbuild is Vite's default minifier, uses a fraction
      // of the memory, and console/debugger stripping is preserved below.
      minify: 'esbuild',
      // Webapp specific build config
      rollupOptions: {
        output: {
          ...(isWebMode ? {
            // Don't generate service worker for webapp
            entryFileNames: 'assets/[name].[hash].js',
            chunkFileNames: 'assets/[name].[hash].js',
            assetFileNames: 'assets/[name].[hash].[ext]',
          } : {}),
          // Split heavy, independently-cacheable vendors out of the main bundle
          // (was one ~2.7MB index chunk). React + router stay together so shared
          // React internals resolve before any consumer chunk evaluates.
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            // React + the whole router stack (incl. @remix-run/router, the core
            // that react-router/react-router-dom re-export) MUST stay together.
            // Splitting @remix-run/router into the catch-all `vendor` chunk while
            // react-vendor imports it creates a react-vendor ↔ vendor cycle:
            // `vendor` then evaluates first and touches `React.createContext`
            // (react-helmet-async) before react-vendor initialises `React` →
            // "Cannot access 'React' before initialization" and a black screen.
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@remix-run[\\/]router)[\\/]/.test(id)) return 'react-vendor';
            if (id.includes('@radix-ui')) return 'radix';
            if (id.includes('framer-motion')) return 'motion';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('hls.js')) return 'hls';
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor';
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('@tanstack')) return 'tanstack';
            if (id.includes('lucide-react')) return 'icons';
            return 'vendor';
          },
        },
      },
    },
    server: {
      host: "::",
      port: isWebMode ? 8081 : 8090, // Standard port for Electron dev
      // Allow Discord Activity iframe to embed the app
      allowedHosts: [
        "tatakai.me",
        "gabhasti.tech",
        "recording-farm-narrow-end.trycloudflare.com",
        ".gabhasti.tech" // The dot allows all subdomains like api.gabhasti.tech
      ],
      hmr: {
        // In local development, let Vite infer the correct WS port.
        // Set VITE_HMR_CLIENT_PORT=443 only when reverse-proxied behind TLS.
        ...(hmrClientPort ? { clientPort: hmrClientPort } : {}),
      },
      proxy: {
        "/api/v3": {
          target: apiV3Origin,
          changeOrigin: true,
          secure: false,
        },
        "/api/proxy": {
          target: apiV3Origin,
          changeOrigin: true,
          secure: false,
        },
        "/api/v3/relay/signal": {
          target: apiV3Origin,
          changeOrigin: true,
          secure: false,
          ws: true,
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
