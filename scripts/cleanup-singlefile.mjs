#!/usr/bin/env node
/**
 * cleanup-singlefile.mjs
 *
 * Post-processing step for the single-file build.
 *
 * `vite-plugin-singlefile` inlines all JS and CSS into `dist-single/index.html`,
 * but Vite still emits the source JS chunks alongside it. For the single-file
 * distribution we only want the one self-contained HTML file, so this script:
 *
 *   1. Removes every `.js` file from `dist-single/` after the build completes.
 *   2. Runs post-build sanity checks against the inlined `dist-single/index.html`:
 *      a. Confirms no real `crossorigin` attribute survives on `<script>` or
 *         `<style>` tags (the `singlefile-fixes` hook in
 *         `vite.singlefile.config.js` is responsible for stripping them).
 *         A naive grep can't tell an attribute from documentation text — we
 *         match the *attribute* form so the help/changelog modal's own
 *         `<code>crossorigin</code>` strings don't trigger a false positive.
 *      b. Confirms the `#footerVersion` value in the built HTML matches
 *         `package.json`'s `version` field, so the visible app version never
 *         drifts from the package metadata between releases.
 *
 *   Both checks fail loud (`process.exit(1)`) so a regression is caught before
 *   anyone uploads `dist-single/index.html` anywhere.
 *
 * Run via: `npm run build:single` (chained after `vite build --config vite.singlefile.config.js`).
 */

import { readdirSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DIR = 'dist-single';
const HTML_PATH = join(DIST_DIR, 'index.html');
const LOG_PREFIX = '[cleanup-singlefile]';

if (!existsSync(DIST_DIR)) {
  console.error(`${LOG_PREFIX} ${DIST_DIR}/ does not exist — did the build run?`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Strip stray .js chunks left behind by Vite
// ---------------------------------------------------------------------------
const removed = [];
for (const entry of readdirSync(DIST_DIR)) {
  if (entry.endsWith('.js')) {
    unlinkSync(join(DIST_DIR, entry));
    removed.push(entry);
  }
}

if (removed.length === 0) {
  console.log(`${LOG_PREFIX} No stray .js files in ${DIST_DIR}/ — nothing to do.`);
} else {
  console.log(
    `${LOG_PREFIX} Removed ${removed.length} file(s) from ${DIST_DIR}/: ${removed.join(', ')}`
  );
}

// ---------------------------------------------------------------------------
// 2. Post-build sanity checks
// ---------------------------------------------------------------------------
if (!existsSync(HTML_PATH)) {
  console.error(`${LOG_PREFIX} FAIL: ${HTML_PATH} not found — build did not produce HTML output.`);
  process.exit(1);
}

const html = readFileSync(HTML_PATH, 'utf8');
let failures = 0;

// 2a. No `crossorigin` attribute on real <script> or <style> tags.
// Anchors on the tag name + word boundary so documentation text like
// `<code>crossorigin</code>` inside the changelog modal does not match.
const crossoriginAttrRe = /<(script|style)\b[^>]*\bcrossorigin\b[^>]*>/i;
const crossoriginHit = html.match(crossoriginAttrRe);
if (crossoriginHit) {
  console.error(`${LOG_PREFIX} FAIL: leftover crossorigin attribute in ${HTML_PATH}:`);
  console.error(`  ${crossoriginHit[0]}`);
  console.error(
    `  → The singlefile-fixes hook in vite.singlefile.config.js likely needs updating.`
  );
  failures += 1;
} else {
  console.log(`${LOG_PREFIX} OK: no crossorigin attribute on <script>/<style> tags.`);
}

// 2b. Visible version badge matches package.json.
const pkgVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const badgeRe = /id="footerVersion"[\s\S]*?>\s*v([^\s<]+)\s*</;
const badgeMatch = html.match(badgeRe);
if (!badgeMatch) {
  console.error(`${LOG_PREFIX} FAIL: could not locate #footerVersion in ${HTML_PATH}.`);
  console.error(`  → Did the version element in src/index.html change?`);
  failures += 1;
} else if (badgeMatch[1] !== pkgVersion) {
  console.error(
    `${LOG_PREFIX} FAIL: version badge "v${badgeMatch[1]}" does not match package.json (v${pkgVersion}).`
  );
  console.error(`  → Update src/index.html's #footerVersion and rebuild.`);
  failures += 1;
} else {
  console.log(`${LOG_PREFIX} OK: version badge matches package.json (v${pkgVersion}).`);
}

if (failures > 0) {
  console.error(`${LOG_PREFIX} ${failures} check(s) failed — see messages above.`);
  process.exit(1);
}

console.log(`${LOG_PREFIX} All checks passed.`);
