import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'fs';
import path from 'path';

// Belt-and-suspenders to the VITE_PDF_ENABLED flag below: physically keep the
// PDF engine and the `mupdf` wasm out of the single-file bundle by replacing
// those modules with empty stubs. The runtime flag stops the code being
// reached; this stops the wasm being bundled/inlined in the first place. It is
// applied to BOTH the main graph and the worker sub-build (Vite builds workers
// in a separate pipeline via `worker.plugins`), because the engine + `mupdf`
// live inside the worker graph (pdf-worker.js → pdf-engine.js → import('mupdf')).
function excludePdfPlugin() {
  return {
    name: 'exclude-pdf-from-singlefile',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'mupdf') return '\0pdf-stub';
      return null;
    },
    load(id) {
      if (id === '\0pdf-stub') return 'export default {};';
      if (id.endsWith('/pdf/pdf-worker.js') || id.endsWith('/pdf/pdf-engine.js')) {
        return '/* PDF feature excluded from the single-file build */\nexport {};';
      }
      return null;
    },
  };
}

export default defineConfig({
  root: 'src',
  // The portable build must stay a single self-contained HTML file, so skip
  // copying the public/ folder (icons, og-image, robots.txt, sitemap.xml) —
  // those are server-root concepts that don't apply to a file opened from disk.
  publicDir: false,
  // Force the GTM container id empty in the portable build regardless of the
  // build environment. The inline GTM loader is stripped below, so this build is
  // network-silent anyway; this also keeps the id string out of the bundled JS.
  define: {
    'import.meta.env.VITE_GTM_ID': JSON.stringify(''),
    // The portable single-file build EXCLUDES the PDF feature: its engine is
    // multiple MB of MuPDF WebAssembly that cannot be inlined into one HTML
    // file. pdf-ui.js reads this flag (isPdfSupported()) and shows a graceful
    // "not available in this build" message instead of opening the optimizer.
    'import.meta.env.VITE_PDF_ENABLED': JSON.stringify('false'),
  },
  // Apply the PDF exclusion to the worker sub-build too (see excludePdfPlugin).
  worker: {
    plugins: () => [excludePdfPlugin()],
  },
  plugins: [
    excludePdfPlugin(),
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
