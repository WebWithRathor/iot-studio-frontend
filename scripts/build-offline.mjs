/**
 * Offline single-file build (no Vite needed). Bundles the app with esbuild and
 * inlines JS + CSS into one HTML file:
 *   dist-single/index.html     full document — open directly in a browser
 *   dist-single/artifact.html  body fragment — for hosts that add their own <head>
 *
 * Usage: node scripts/build-offline.mjs
 * Set ESBUILD_PATH if esbuild is not resolvable from this project.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_PATH ?? 'esbuild');

const out = resolve(root, 'dist-single');
mkdirSync(out, { recursive: true });

const result = await esbuild.build({
  entryPoints: [resolve(root, 'src/main.tsx')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020'],
  jsx: 'automatic',
  outdir: resolve(out, 'tmp'),
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'css' },
  logLevel: 'warning',
});

let js = '';
let css = '';
for (const f of result.outputFiles) {
  if (f.path.endsWith('.js')) js += f.text;
  if (f.path.endsWith('.css')) css += f.text;
}
// Never let bundled code close the inline <script>.
js = js.replace(/<\/script/gi, '<\\/script');

const fonts =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@300;400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap">';

const fragment = `<title>Kokoon IoT Studio</title>
${fonts}
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;

writeFileSync(resolve(out, 'artifact.html'), fragment);
writeFileSync(
  resolve(out, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${fragment.replace('<div id="root"></div>', '</head><body><div id="root"></div>')}</body></html>`,
);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`built dist-single/index.html (js ${kb(js.length)}, css ${kb(css.length)})`);
void readFileSync;
