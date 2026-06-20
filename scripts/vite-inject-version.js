import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Vite plugin: replace the `__APP_VERSION__` placeholder in index.html with the
 * `version` field from package.json at build (and dev-serve) time.
 *
 * Why: the visible footer version used to be a hardcoded string in index.html
 * that had to be bumped by hand every release — it silently drifted (shipped
 * v0.24.0 in the footer through the v0.25.0 and v0.26.0 releases). Injecting it
 * from the single source of truth means it can never go stale again. The
 * `build:single` footer-vs-package.json check (cleanup-singlefile.mjs) still
 * passes because the built HTML now contains the resolved version.
 */
export function injectVersion() {
  const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
  return {
    name: 'inject-app-version',
    transformIndexHtml(html) {
      return html.replace(/__APP_VERSION__/g, version);
    },
  };
}
