// Compilación estática (SPA) para GitHub Pages: usa index.html + src/main.tsx.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: { outDir: "dist", emptyOutDir: true },
});
