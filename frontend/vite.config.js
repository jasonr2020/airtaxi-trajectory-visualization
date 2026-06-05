import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

// The dev server proxies /api → FastAPI backend on :8000, so the frontend can
// call the API with same-origin paths and no CORS fuss.
export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      // Cesium 1.131 imports a path that newer @zip.js/zip.js (2.8+) no longer
      // exports. We don't use KML, so redirect it to the package's main entry
      // (which exposes the full zip API) to satisfy the import in dev + build.
      "@zip.js/zip.js/lib/zip-no-worker.js": "@zip.js/zip.js",
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
