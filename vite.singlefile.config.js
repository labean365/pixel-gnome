import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  root: 'src',
  // The portable build must stay a single self-contained HTML file, so skip
  // copying the public/ folder (icons, og-image, robots.txt, sitemap.xml) —
  // those are server-root concepts that don't apply to a file opened from disk.
  publicDir: false,
  plugins: [
    viteSingleFile(),
    {
      name: 'singlefile-fixes',
      enforce: 'post',
      generateBundle(_, bundle) {
        // Read the favicon SVG so we can inline it as a data URI
        let faviconDataUri = '';
        try {
          const svgContent = fs.readFileSync(path.resolve(__dirname, 'src/favicon.svg'), 'utf8');
          faviconDataUri = 'data:image/svg+xml,' + encodeURIComponent(svgContent);
        } catch {
          /* favicon not found — skip */
        }

        for (const [name, file] of Object.entries(bundle)) {
          if (file.type === 'asset' && file.fileName.endsWith('.html')) {
            let html = file.source;

            // Remove crossorigin from script tag (CORS fails on file://)
            html = html.replace('<script type="module" crossorigin>', '<script type="module">');

            // Remove crossorigin from inlined <style> tag — it's a no-op on inline
            // styles but Vite carries it over from the original <link rel="stylesheet" crossorigin>.
            // Stripped for a tidy single-file output.
            html = html.replace(/<style\b([^>]*?)\s+crossorigin\b([^>]*)>/g, '<style$1$2>');

            // Inline the favicon as a data URI so no external file is needed
            if (faviconDataUri) {
              html = html.replace(/href="[^"]*favicon[^"]*\.svg"/, `href="${faviconDataUri}"`);
            }

            // Strip the analytics blocks (Consent Mode default + GTM snippet +
            // GTM noscript) so the portable single-file build stays
            // network-silent — it's opened from disk / used offline, where
            // phoning home to GTM would be wrong and break the self-contained
            // property. The consent banner and custom-event pushes are gated on
            // window.gtag / window.dataLayer (both absent once this is removed),
            // so they no-op automatically — no JS changes needed here.
            // Markers are authored in src/index.html.
            html = html.replace(
              /[ \t]*<!-- BEGIN analytics-noscript[\s\S]*?<!-- END analytics-noscript -->\n?/g,
              ''
            );
            html = html.replace(/[ \t]*<!-- BEGIN analytics[\s\S]*?<!-- END analytics -->\n?/g, '');

            file.source = html;
          }

          // Remove the favicon SVG asset from the bundle (now inlined)
          if (
            file.type === 'asset' &&
            file.fileName.includes('favicon') &&
            file.fileName.endsWith('.svg')
          ) {
            delete bundle[name];
          }
        }
      },
    },
  ],
  build: {
    outDir: '../dist-single',
    emptyOutDir: true,
    assetsInlineLimit: Infinity,
    modulePreload: false,
  },
});
