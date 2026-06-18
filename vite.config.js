import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  // Static files (icons, og-image, robots.txt, sitemap.xml) served from the
  // repo-root public/ folder and copied to the dist/ root at build time.
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
