import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  // Static files (icons, og-image, robots.txt, sitemap.xml) served from the
  // repo-root public/ folder and copied to the dist/ root at build time.
  publicDir: '../public',
  // PDF optimization (MuPDF wasm) IS included in the normal multi-file build.
  // The single-file build flips this to 'false' (see vite.singlefile.config.js).
  define: {
    'import.meta.env.VITE_PDF_ENABLED': JSON.stringify('true'),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
