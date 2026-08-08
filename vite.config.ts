import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { visualizer } from "rollup-plugin-visualizer";
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
  const apiV3Origin = env.VITE_API_V3_ORIGIN || "http://localhost:4001";

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
      port: isWebMode ? 8081 : 8090, // Standard port for Electron dev
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
