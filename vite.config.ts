import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import packageJson from "./package.json";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isWebMode = mode === 'web';

  return {
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      // Relative base so Electron can load via file:// without broken asset paths
      base: process.env.ELECTRON_BUILD === 'true' ? './' : '/',
      // Only generate sourcemaps if explicitly enabled (for debugging)
      sourcemap: mode === 'production' && process.env.ENABLE_SOURCEMAPS === 'true',
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
      hmr: {
        clientPort: 443,
      },
      proxy: {
        // Proxy all calls starting with /api/proxy/aniwatch to the third-party API (dev only)
        '/api/proxy/aniwatch': {
          target: 'https://aniwatch-api-taupe-eight.vercel.app',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/api\/proxy\/aniwatch/, '/api/v2/hianime'),
        },
      },
      // Allow embedding in Discord Activity iframe
      headers: {
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __WEBAPP_MODE__: isWebMode,
    },
  }
});
