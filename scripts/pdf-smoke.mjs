// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 321Enterprise
/**
 * pdf-smoke.mjs — quick local check of the real PDF optimization adapter.
 *
 * Exercises src/modules/pdf/pdf-engine.js (the same code the app uses) in Node,
 * so you can confirm MuPDF optimization works and see the size reduction before
 * any UI is wired up.
 *
 * Prereq:  npm install mupdf
 * Usage:   node scripts/pdf-smoke.mjs <input.pdf> [output.pdf] [quality 0-1]
 * Example: node scripts/pdf-smoke.mjs ~/Desktop/big.pdf optimized.pdf 0.72
 */
import * as fs from 'node:fs';
import { getInfo, optimize } from '../src/modules/pdf/pdf-engine.js';

const [, , inPath, outPath = 'optimized.pdf', quality = '0.72'] = process.argv;
if (!inPath) {
  console.error('usage: node scripts/pdf-smoke.mjs <input.pdf> [output.pdf] [quality 0-1]');
  process.exit(1);
}

const MB = (n) => (n / 1048576).toFixed(2) + ' MB';
const bytes = new Uint8Array(fs.readFileSync(inPath));

const info = await getInfo(bytes);
console.log('info:', info);

const t = Date.now();
const out = await optimize(bytes, {
  imageQuality: Number(quality),
  onProgress: (d, n) => process.stdout.write(`\r  recompressing image ${d}/${n}`),
});
process.stdout.write('\n');

fs.writeFileSync(outPath, out);
const pct = (100 - (out.length / bytes.length) * 100).toFixed(1);
console.log(`in:  ${MB(bytes.length)}`);
console.log(`out: ${MB(out.length)}  (${pct}% smaller)  ->  ${outPath}`);
console.log(`time: ${Date.now() - t}ms`);
