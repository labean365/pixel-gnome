/**
 * responsive-export.js
 * Multi-size export — generates multiple size variants from a single
 * source image and bundles them into a ZIP.
 *
 * Phase 9: Responsive Export (Multi-Size Generator).
 *
 * Breakpoint sets define the target long-edge sizes. For each image,
 * the pipeline runs once per breakpoint, using "max-long-edge" mode
 * to maintain aspect ratio.
 */

import { processImage } from './image-processor.js';
import JSZip from 'jszip';
import { buildOutputFilename, downloadBlob } from './exporter.js';

/**
 * @typedef {Object} BreakpointSet
 * @property {string} name — e.g. "Web Standard"
 * @property {number[]} sizes — long-edge px values, e.g. [320, 640, 1024, 1920]
 */

/** Built-in breakpoint presets */
export const BREAKPOINT_PRESETS = [
  {
    name: 'Web Standard',
    sizes: [320, 640, 1024, 1920],
  },
  {
    name: 'Retina Web',
    sizes: [640, 1280, 1920, 2560],
  },
  {
    name: 'Thumbnails',
    sizes: [100, 200, 400, 800],
  },
  {
    name: 'Social Media',
    sizes: [400, 800, 1080, 1200],
  },
];

/**
 * Generate multiple size variants for a single image.
 *
 * @param {File} file — the original image file
 * @param {import('./image-processor.js').ProcessSettings} baseSettings — base settings (format, quality, etc.)
 * @param {number[]} breakpoints — array of long-edge pixel sizes
 * @param {import('./editor.js').ImageEdits} [edits] — optional per-image edits
 * @param {function(number, number): void} [onProgress] — (completed, total) callback
 * @returns {Promise<Array<{ breakpoint: number, result: import('./image-processor.js').ProcessResult }>>}
 */
export async function generateMultiSize(file, baseSettings, breakpoints, edits, onProgress) {
  const sorted = [...breakpoints].sort((a, b) => a - b);
  const results = [];
  let completed = 0;

  for (const bp of sorted) {
    // Override settings to use max-long-edge mode at this breakpoint
    const sizeSettings = {
      ...baseSettings,
      mode: 'max-long-edge',
      width: bp,
      height: null,
    };

    const result = await processImage(file, sizeSettings, edits);
    result.originalSize = file.size;
    result.breakpoint = bp;
    results.push({ breakpoint: bp, result });

    completed++;
    if (onProgress) onProgress(completed, sorted.length);
  }

  return results;
}

/**
 * Export multiple size variants for multiple images as a ZIP.
 * Organizes files in folders per image, or flat with breakpoint in the name.
 *
 * @param {Array<{ file: File, edits?: Object, id: string }>} items
 * @param {import('./image-processor.js').ProcessSettings} baseSettings
 * @param {string} pattern — filename pattern (supports {breakpoint} token)
 * @param {number[]} breakpoints
 * @param {function(number, number): void} [onProgress]
 * @returns {Promise<void>}
 */
export async function exportMultiSizeZip(items, baseSettings, pattern, breakpoints, onProgress) {
  const zip = new JSZip();
  const usedNames = new Map();
  const totalOps = items.length * breakpoints.length;
  let completed = 0;

  for (const item of items) {
    const variants = await generateMultiSize(
      item.file,
      baseSettings,
      breakpoints,
      item.edits,
      (done, total) => {
        if (onProgress) onProgress(completed + done, totalOps);
      }
    );

    for (const { breakpoint, result } of variants) {
      // Build filename with {breakpoint} token support
      const patternWithBp = pattern.replace(/\{breakpoint\}/gi, String(breakpoint));
      let filename = buildOutputFilename(item.file.name, patternWithBp, baseSettings.format, {
        width: result.outputWidth,
        height: result.outputHeight,
        preset: baseSettings.presetId,
      });

      // Handle collisions
      if (usedNames.has(filename)) {
        const count = usedNames.get(filename) + 1;
        usedNames.set(filename, count);
        const lastDot = filename.lastIndexOf('.');
        const base = filename.substring(0, lastDot);
        const ext = filename.substring(lastDot);
        filename = `${base}-${count}${ext}`;
      } else {
        usedNames.set(filename, 1);
      }

      zip.file(filename, result.blob);
    }

    completed += breakpoints.length;
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  downloadBlob(zipBlob, `pixelgnome-responsive-${timestamp}.zip`);
}
