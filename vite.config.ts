import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
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
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  optimizeDeps: {
    // List every package the client imports so Vite pre-bundles them all at
    // startup instead of discovering them lazily (which triggers mid-session
    // "optimized dependencies changed. reloading" cascades).
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
