// build-web.mjs: bundle web/main.ts with esbuild and inline it, with the CSS,
// into one self-contained dist/index.html (works opened from disk and as a
// claude.ai artifact).
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const out = await build({
  entryPoints: ["web/main.ts"], bundle: true, write: false, format: "iife",
  target: "es2020", minify: true, legalComments: "none",
});
const js = out.outputFiles[0].text.replace(/<\/(script)/gi, "<\\/$1");
const css = readFileSync("web/style.css", "utf8");
const html = readFileSync("web/index.html", "utf8").split("/*STYLE*/").join(css).split("/*SCRIPT*/").join(js);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
console.log(`dist/index.html ${(html.length / 1024).toFixed(0)} KB`);
