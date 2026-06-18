/**
 * exif-reader.js
 * Reads EXIF orientation from JPEG files.
 * Returns orientation value (1-8) which maps to rotation/flip needed.
 *
 * Orientation values:
 *   1 = normal
 *   2 = flipped horizontally
 *   3 = rotated 180°
 *   4 = flipped vertically
 *   5 = rotated 90° CW + flipped horizontally
 *   6 = rotated 90° CW
 *   7 = rotated 90° CCW + flipped horizontally
 *   8 = rotated 90° CCW
 */

/**
 * Read EXIF orientation from a File or Blob
 * Only works for JPEG — other formats return 1 (normal).
 * @param {File|Blob} file
 * @returns {Promise<number>} orientation value (1-8)
 */
export async function getExifOrientation(file) {
  // Only JPEG has EXIF in a way we can easily parse
  // HEIC also has EXIF but heic2any handles orientation during decode
  if (!file.type || !file.type.includes('jpeg')) {
    // Check extension as fallback
    if (file.name && !file.name.match(/\.jpe?g$/i)) {
      return 1;
    }
  }

  try {
    const buffer = await readFileSlice(file, 0, 65536); // Read first 64KB (EXIF is in the header)
    return parseOrientation(buffer);
  } catch {
    return 1;
  }
}

/**
 * Read a slice of a file as ArrayBuffer
 */
function readFileSlice(file, start, end) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file.slice(start, end));
  });
}

/**
 * Parse EXIF orientation from an ArrayBuffer of JPEG header bytes
 */
function parseOrientation(buffer) {
  const view = new DataView(buffer);

  // Verify JPEG SOI marker
  if (view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  const length = view.byteLength;

  while (offset < length - 1) {
    const marker = view.getUint16(offset);

    // APP1 marker (EXIF data)
    if (marker === 0xffe1) {
      const exifOffset = offset + 4;

      // Check for "Exif\0\0" header
      if (
        view.getUint32(exifOffset) === 0x45786966 && // "Exif"
        view.getUint16(exifOffset + 4) === 0x0000 // null padding
      ) {
        return parseTiffOrientation(view, exifOffset + 6);
      }
      return 1;
    }

    // Skip non-APP1 markers
    if ((marker & 0xff00) !== 0xff00) break;
    const segmentLength = view.getUint16(offset + 2);
    offset += 2 + segmentLength;
  }

  return 1;
}

/**
 * Parse orientation from TIFF header within EXIF
 */
function parseTiffOrientation(view, tiffStart) {
  // Byte order: 0x4949 = little-endian, 0x4D4D = big-endian
  const byteOrder = view.getUint16(tiffStart);
  const littleEndian = byteOrder === 0x4949;

  // Verify TIFF magic number
  if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002a) return 1;

  // Offset to first IFD
  const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
  const ifdStart = tiffStart + ifdOffset;

  // Number of IFD entries
  const numEntries = view.getUint16(ifdStart, littleEndian);

  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifdStart + 2 + i * 12;

    // Check if this entry overflows our buffer
    if (entryOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(entryOffset, littleEndian);

    // Tag 0x0112 = Orientation
    if (tag === 0x0112) {
      const orientation = view.getUint16(entryOffset + 8, littleEndian);
      return orientation >= 1 && orientation <= 8 ? orientation : 1;
    }
  }

  return 1;
}

/**
 * Apply EXIF orientation transforms to a canvas context
 * Call this BEFORE drawing the image onto the canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width - canvas width
 * @param {number} height - canvas height
 * @param {number} orientation - EXIF orientation (1-8)
 */
export function applyOrientationTransform(ctx, width, height, orientation) {
  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, height, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, height, width);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, width);
      break;
    default:
      break; // orientation 1 = no transform
  }
}

/**
 * Check if orientation swaps width/height
 */
export function orientationSwapsDimensions(orientation) {
  return orientation >= 5 && orientation <= 8;
}
