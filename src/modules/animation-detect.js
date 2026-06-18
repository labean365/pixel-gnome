/**
 * animation-detect.js
 * Magic-byte detection for animated raster formats that PixelGnome's pipeline
 * currently flattens to a single frame:
 *  - APNG (Animated PNG) — detected via the `acTL` chunk present before IDAT
 *  - Animated WebP       — detected via the `ANIM` chunk inside the RIFF container
 *
 * Reasoning: the Canvas API decodes the first frame only for both formats,
 * so PixelGnome silently drops animation. We want to warn the user with a
 * toast that mirrors the existing animated-GIF UX rather than surprise them
 * with a static export.
 *
 * Only reads the first ~64 KB of each file to keep the detection cheap on
 * large inputs.
 */

const SNIFF_BYTES = 64 * 1024;

/** @param {File} file @returns {boolean} */
export function isPngFile(file) {
  if (file.type === 'image/png') return true;
  return !!file.name && file.name.toLowerCase().endsWith('.png');
}

/** @param {File} file @returns {boolean} */
export function isWebpFile(file) {
  if (file.type === 'image/webp') return true;
  return !!file.name && file.name.toLowerCase().endsWith('.webp');
}

/**
 * Read the first N bytes of a file as a Uint8Array.
 * @param {File} file
 * @param {number} maxBytes
 * @returns {Promise<Uint8Array>}
 */
async function readHead(file, maxBytes) {
  const slice = file.slice(0, Math.min(file.size, maxBytes));
  const buf = await slice.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Search `bytes` for the 4-byte ASCII marker. Returns the index or -1.
 * @param {Uint8Array} bytes
 * @param {string} marker - exactly 4 ASCII chars
 * @param {number} [from=0]
 * @returns {number}
 */
function findAsciiMarker(bytes, marker, from = 0) {
  const a = marker.charCodeAt(0);
  const b = marker.charCodeAt(1);
  const c = marker.charCodeAt(2);
  const d = marker.charCodeAt(3);
  for (let i = from; i < bytes.length - 3; i++) {
    if (bytes[i] === a && bytes[i + 1] === b && bytes[i + 2] === c && bytes[i + 3] === d) {
      return i;
    }
  }
  return -1;
}

/**
 * Detect whether a file is an APNG (Animated PNG).
 *
 * APNG spec: the `acTL` (Animation Control) chunk MUST appear before the
 * first `IDAT` chunk. If we find `acTL` at all and it precedes `IDAT`, it's
 * animated. (Bare PNGs have no `acTL` chunk.)
 *
 * Also verifies the 8-byte PNG signature so we don't mis-detect on files
 * with a .png extension but a non-PNG body.
 *
 * @param {File} file
 * @returns {Promise<boolean>}
 */
export async function isAnimatedPng(file) {
  if (!isPngFile(file)) return false;

  const bytes = await readHead(file, SNIFF_BYTES);
  if (bytes.length < 8) return false;

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const sigOk =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (!sigOk) return false;

  const acTLIdx = findAsciiMarker(bytes, 'acTL', 8);
  if (acTLIdx === -1) return false;

  const idatIdx = findAsciiMarker(bytes, 'IDAT', 8);
  // acTL must precede IDAT for the PNG to be considered animated.
  // If IDAT isn't in the first SNIFF_BYTES, acTL alone is a strong enough
  // signal (APNG files always put acTL early).
  return idatIdx === -1 || acTLIdx < idatIdx;
}

/**
 * Detect whether a file is an animated WebP.
 *
 * WebP is a RIFF container: `RIFF` + 4-byte size + `WEBP` + chunks.
 * Animated WebPs contain an `ANIM` chunk (and per-frame `ANMF` chunks).
 * The presence of `ANIM` in the first 64 KB is the signal.
 *
 * @param {File} file
 * @returns {Promise<boolean>}
 */
export async function isAnimatedWebp(file) {
  if (!isWebpFile(file)) return false;

  const bytes = await readHead(file, SNIFF_BYTES);
  if (bytes.length < 12) return false;

  // Verify RIFF/WEBP container.
  const riffOk = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const webpOk = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (!riffOk || !webpOk) return false;

  return findAsciiMarker(bytes, 'ANIM', 12) !== -1;
}
