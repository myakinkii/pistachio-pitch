// vite.config.ts: the page in web/ builds to one self-contained dist/index.html
// (scripts and styles inlined), which works opened from disk and as a claude.ai artifact.
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: "web",
  plugins: [vue(), viteSingleFile()],
  build: { outDir: "../dist", emptyOutDir: true, target: "es2020" },
});
