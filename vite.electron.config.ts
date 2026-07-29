// ─── Vite config for Electron frontend build ──────────────────────────────────
// Uses @vitejs/plugin-react (Babel) instead of plugin-react-swc to avoid a
// Node 24 + Windows ESM path-resolution bug in the SWC native bindings.
// optimizeDeps mirrors the main vite.config.ts so Vite pre-bundles all
// packages before Rollup runs — packages without an `exports` field (e.g.
// jsbarcode) fail Rollup resolution if they are not pre-bundled first.

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
    // Electron renderer targets Node-compatible resolution so that legacy CJS
    // packages (no `exports` field, only `main`) are found by Rollup on Node 24.
    // The ESM resolver introduced in Node 22+ drops the `main`-field fallback
    // for packages without `exports`, breaking packages like jsbarcode.
    conditions: ["browser", "module", "import", "require", "default"],
    mainFields: ["browser", "module", "main", "jsnext:main", "jsnext"],
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      // qz-tray is a CJS-only module loaded via dynamic import at runtime.
      // Rollup cannot bundle it in production; Electron resolves it from
      // node_modules when the dynamic import fires at launch.
      external: ["qz-tray"],
    },
  },
  optimizeDeps: {
    include: [
      // Core React
      "react",
      "react-dom",
      "react-dom/client",
      // Router / query
      "wouter",
      "@tanstack/react-query",
      // Styling utilities
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      // Icons / charts
      "lucide-react",
      "recharts",
      // Forms & validation
      "zod",
      "react-hook-form",
      "@hookform/resolvers/zod",
      // Date / calendar
      "react-day-picker",
      "date-fns",
      // UI primitives
      "cmdk",
      "vaul",
      "input-otp",
      "embla-carousel-react",
      "react-resizable-panels",
      // Payments
      "@stripe/react-stripe-js",
      "@stripe/stripe-js",
      // Barcode / PDF
      "jsbarcode",
      "pdfjs-dist",
      "@zxing/browser",
      // QZ Tray (CJS module — pre-bundle so dynamic import resolves correctly)
      "qz-tray",
      // Radix UI
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-aspect-ratio",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-label",
      "@radix-ui/react-menubar",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
    ],
  },
});
