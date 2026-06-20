import { defineConfig } from 'vite';
import { injectVersion } from './scripts/vite-inject-version.js';

export default defineConfig({
  root: 'src',
  plugins: [injectVersion()],
  // Static files (icons, og-image, robots.txt, sitemap.xml) served from the
  // repo-root public/ folder and copied to the dist/ root at build time.
  publicDir: '../public',
  // PDF optimization (MuPDF wasm) IS included in the normal multi-file build.
  // The single-file build flips this to 'false' (see vite.singlefile.config.js).
  define: {
    'import.meta.env.VITE_PDF_ENABLED': JSON.stringify('true'),
  },
  // Build workers as ES modules (not the default IIFE). Required because the PDF
  // worker pulls in MuPDF, which uses top-level await; an IIFE worker can't
  // support that and the worker/wasm silently fail to emit. The image worker is
  // already a `{ type: 'module' }` worker, so this is compatible.
  worker: {
    format: 'es',
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
