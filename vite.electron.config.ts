// ─── Vite config for Electron frontend build ──────────────────────────────────
// Uses @vitejs/plugin-react (Babel) instead of plugin-react-swc to avoid a
// Node 24 + Windows ESM path-resolution bug in the SWC native bindings.
// The output is identical to the main build; only the toolchain differs.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      // qz-tray is loaded via dynamic import at runtime — Rollup can't bundle
      // it because the package uses a CJS module format that differs between
      // browser and Node. Leave it as an external so Electron resolves it from
      // node_modules at launch.
      external: ["qz-tray"],
    },
  },
  optimizeDeps: {
    include: [
      "react", "react-dom", "react-dom/client",
      "wouter", "@tanstack/react-query",
      "clsx", "tailwind-merge", "class-variance-authority",
      "lucide-react", "recharts",
      "zod", "react-hook-form", "@hookform/resolvers/zod",
      "react-day-picker", "date-fns",
    ],
    // qz-tray is CJS and loaded dynamically at runtime — exclude from pre-bundling.
    exclude: ["qz-tray"],
  },
});
