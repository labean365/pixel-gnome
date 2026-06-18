/**
 * exporter.js
 * Handles downloading processed images.
 * Phase 5+: Pattern-based filenames with token replacement.
 */

import { trackUrl, revokeUrl } from './resource-tracker.js';

/**
 * Strip characters that are unsafe in download filenames across platforms.
 * - Windows reserves: \ / : * ? " < > |
 * - Control chars (0x00-0x1F, 0x7F) cause varied problems across OSes.
 * - Leading dots hide files on Unix and are reserved (.DS_Store, etc).
 * - Trailing dots and whitespace are stripped by Windows on save.
 * Unicode characters are preserved — modern download UIs handle them fine.
 *
 * @param {string} part - A filename component (without extension).
 * @returns {string} Sanitized part. Empty string if every char was stripped.
 */
function sanitizeFilenamePart(part) {
  if (typeof part !== 'string') return '';
  return (
    part
      // Windows reserved chars + control chars
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_')
      // Collapse runs of underscores from the replace above
      .replace(/_+/g, '_')
      // Trim leading dots, whitespace, and underscores
      .replace(/^[\s._]+/, '')
      // Trim trailing dots, whitespace, and underscores
      .replace(/[\s._]+$/, '')
  );
}

/**
 * Build the output filename from a pattern, original name, and metadata.
 * Pattern tokens: {name}, {width}, {height}, {preset}, {format}
 * If the pattern contains no tokens, it's treated as a literal
 * filename stem (backward compatible with the old suffix approach).
 *
 * All user-controlled token values are sanitized before substitution, so a
 * dropped file named `../evil.jpg` produces `_evil-web.jpg`, not a path-traversal
 * output name.
 *
 * @param {string} originalName - e.g. "IMG_4832.jpg"
 * @param {string} pattern - e.g. "{name}-web" or "{name}-{width}"
 * @param {string} format - e.g. "jpeg"
 * @param {Object} [meta] - Optional metadata for token replacement
 * @param {number} [meta.width]
 * @param {number} [meta.height]
 * @param {string} [meta.preset]
 * @returns {string} e.g. "IMG_4832-web.jpg" or "IMG_4832-1920.jpg"
 */
export function buildOutputFilename(originalName, pattern, format, meta) {
  // Extract base name (without extension), then sanitize — the filename is
  // attacker-controllable since users drop files with arbitrary names.
  const safeOriginal = String(originalName || '');
  const lastDot = safeOriginal.lastIndexOf('.');
  const rawBaseName = lastDot > 0 ? safeOriginal.substring(0, lastDot) : safeOriginal;
  const baseName = sanitizeFilenamePart(rawBaseName) || 'image';

  // Preset ID is user-set (can be imported from arbitrary JSON) — sanitize too.
  const presetToken = sanitizeFilenamePart(meta?.preset || '') || 'custom';

  // Map format to extension
  const extMap = {
    jpeg: '.jpg',
    png: '.png',
    webp: '.webp',
    avif: '.avif',
    gif: '.gif',
  };
  const ext = extMap[format] || '.jpg';

  // Resolve the pattern — pattern itself is user-configured settings (not
  // adversarial) but the substituted values above ARE sanitized.
  let resolved = pattern || '{name}';
  resolved = resolved
    .replace(/\{name\}/gi, baseName)
    .replace(/\{width\}/gi, String(meta?.width || ''))
    .replace(/\{height\}/gi, String(meta?.height || ''))
    .replace(/\{preset\}/gi, presetToken)
    .replace(/\{format\}/gi, format || '');

  // If pattern didn't contain {name} and result is empty-ish, prepend baseName
  if (!resolved || resolved === baseName) {
    resolved = baseName;
  }

  // Defense-in-depth: sanitize the assembled stem before appending the ext,
  // in case the user's pattern contains literal unsafe characters.
  const safeResolved = sanitizeFilenamePart(resolved) || 'image';

  return `${safeResolved}${ext}`;
}

/**
 * Download a single blob as a file
 * @param {Blob} blob - The processed image blob
 * @param {string} filename - The output filename
 */
export function downloadBlob(blob, filename) {
  const url = trackUrl(URL.createObjectURL(blob));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup after a short delay to ensure download starts
  setTimeout(() => {
    revokeUrl(url);
    a.remove();
  }, 100);
}
