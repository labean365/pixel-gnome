// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 321Enterprise
/**
 * check-pdf-build.mjs — build-contract smoke test for the PDF feature.
 *
 * Twice during development a change that passed lint + a clean `vite build`
 * still shipped a broken PDF path: once the worker chunk was never emitted, and
 * once MuPDF was pulled in via a static import that put top-level await in the
 * worker's entry graph (which hangs a module worker forever). Neither was caught
 * by any automated check. This asserts the *shape* of the build output so both
 * regressions fail the build instead of reaching production.
 *
 * Usage:
 *   node scripts/check-pdf-build.mjs            # checks dist/ (multi-file build)
 *   node scripts/check-pdf-build.mjs dist
 *   node scripts/check-pdf-build.mjs dist-single --single   # exclusion contract
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const single = args.includes('--single');
const dir = args.find((a) => !a.startsWith('--')) || (single ? 'dist-single' : 'dist');

const failures = [];
const ok = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => {
  failures.push(msg);
  console.log('  ✗ ' + msg);
};

function listAssets() {
  const assets = join(dir, 'assets');
  return existsSync(assets) ? readdirSync(assets) : [];
}

console.log(
  `\n[check-pdf-build] ${single ? 'single-file exclusion' : 'multi-file'} contract on "${dir}"`
);

if (single) {
  // The portable single-file build MUST NOT contain MuPDF (multi-MB wasm can't inline).
  const wasm = listAssets().filter((f) => f.endsWith('.wasm'));
  if (wasm.length === 0) ok('no .wasm assets emitted');
  else fail(`.wasm leaked into single-file build: ${wasm.join(', ')}`);

  const htmlPath = join(dir, 'index.html');
  if (existsSync(htmlPath)) {
    const html = readFileSync(htmlPath, 'utf8');
    if (!html.includes('mupdf-wasm')) ok('index.html has no MuPDF wasm reference');
    else fail('index.html references mupdf-wasm (MuPDF not excluded)');
  } else {
    fail('index.html not found in single-file build');
  }
} else {
  const assets = listAssets();
  const worker = assets.find((f) => /^pdf-worker-.*\.js$/.test(f));
  const mupdfChunk = assets.find((f) => /^mupdf-.*\.js$/.test(f));
  const wasm = assets.find((f) => /^mupdf-wasm-.*\.wasm$/.test(f));

  if (worker) ok(`PDF worker emitted: ${worker}`);
  else fail('pdf-worker chunk NOT emitted (worker would 404 at runtime)');

  if (mupdfChunk) ok(`MuPDF code-split chunk emitted: ${mupdfChunk}`);
  else
    fail(
      'separate mupdf chunk NOT emitted — MuPDF was likely statically imported, which puts top-level await in the worker entry graph and hangs the worker'
    );

  if (wasm) ok(`MuPDF wasm emitted: ${wasm}`);
  else fail('mupdf-wasm .wasm NOT emitted');

  // The worker entry must load MuPDF via a DYNAMIC import of the chunk (keeps the
  // entry TLA-free). If it statically imported MuPDF, the chunk above would be
  // absent; this is the belt-and-suspenders check on the worker entry itself.
  if (worker) {
    const code = readFileSync(join(dir, 'assets', worker), 'utf8');
    if (/import\((["'`])\.\/mupdf-.*\1\)/.test(code) || /import\(["'`]?\.\/mupdf/.test(code)) {
      ok('worker entry dynamically imports the MuPDF chunk (TLA-free entry)');
    } else {
      fail(
        'worker entry does NOT dynamically import the MuPDF chunk — check loadEngine() uses `await import("mupdf")`'
      );
    }
  }
}

if (failures.length) {
  console.error(`\n[check-pdf-build] FAILED (${failures.length}):`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[check-pdf-build] OK\n');
