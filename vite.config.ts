import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // This repository is hosted at /Stellar-Dex/ on GitHub Pages.
  base: "/Stellar-Dex/",
  plugins: [react()],
});
