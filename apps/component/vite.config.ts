import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: {
    cssCodeSplit: false,
    emptyOutDir: true,
    lib: {
      entry: "src/main.tsx",
      formats: ["iife"],
      name: "OdpMarketStewardComponent",
      fileName: () => "component.js",
    },
    outDir: "dist",
  },
});
