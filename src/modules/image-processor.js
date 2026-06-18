/**
 * image-processor.js
 * Canvas-based image resize engine.
 * Takes a decoded image + settings + optional edits, returns a Blob.
 *
 * Phase 5: Added edits parameter (rotate, flip, crop) applied after
 * EXIF correction but before the resize step.
 */

import {
  getExifOrientation,
  applyOrientationTransform,
  orientationSwapsDimensions,
} from './exif-reader.js';
import { isHeicFile, decodeHeic } from './heic-decoder.js';
import { hasEdits, applyEditsToCanvas, getEditedDimensions } from './editor.js';
import { compressToTarget } from './smart-compress.js';
import { isGifFile, isAnimatedGif } from './gif-detect.js';
import { decodeGifFrames } from './gif-decoder.js';
import { encodeAnimatedGif } from './gif-encoder.js';
import { trackUrl, revokeUrl } from './resource-tracker.js';
import { calculateDimensions, getMimeType, isFormatMatch } from './shared/dimensions.js';

/**
 * Check if a file is an SVG image
 */
function isSvgFile(file) {
  if (file.type === 'image/svg+xml') return true;
  return file.name && file.name.toLowerCase().endsWith('.svg');
}

/**
 * Sanitize SVG markup using a DOM-based parser.
 * Removes dangerous elements and attributes that could execute scripts.
 *
 * Phase 8.7: Replaces regex-based stripping which had known bypasses
 * (malformed tags, foreignObject, animate, javascript: URIs, etc.).
 */
function sanitizeSvg(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;

  // Check for parse errors (DOMParser wraps errors in a parsererror element)
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    // Fall back to regex strip on malformed SVG so rasterization can still attempt
    let cleaned = svgText.replace(/<script[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
    cleaned = cleaned.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
    return cleaned;
  }

  // Remove dangerous elements
  const dangerousTags = [
    'script',
    'foreignObject',
    'set',
    'animate',
    'animateTransform',
    'animateMotion',
  ];
  dangerousTags.forEach((tag) => {
    svg.querySelectorAll(tag).forEach((el) => el.remove());
  });

  // Strip dangerous attributes from all elements
  const allEls = svg.querySelectorAll('*');
  allEls.forEach((el) => {
    const attrs = [...el.attributes];
    attrs.forEach((attr) => {
      // Remove event handlers (onclick, onload, onerror, etc.)
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name);
      }
      // Remove javascript: URIs in any attribute
      if (typeof attr.value === 'string' && attr.value.match(/^\s*javascript\s*:/i)) {
        el.removeAttribute(attr.name);
      }
      // Remove data: URIs on xlink:href and href that embed scripts
      if (
        (attr.name === 'href' || attr.name === 'xlink:href') &&
        typeof attr.value === 'string' &&
        attr.value.match(/^\s*data\s*:\s*text\/html/i)
      ) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return new XMLSerializer().serializeToString(svg);
}

/**
 * Parse width and height from SVG text
 */
function parseSvgDimensions(svgText) {
  const result = { width: 0, height: 0 };

  // Try explicit width/height attributes
  const wMatch = svgText.match(/<svg[^>]*\swidth\s*=\s*["']?(\d+(?:\.\d+)?)/i);
  const hMatch = svgText.match(/<svg[^>]*\sheight\s*=\s*["']?(\d+(?:\.\d+)?)/i);
  if (wMatch) result.width = Math.round(parseFloat(wMatch[1]));
  if (hMatch) result.height = Math.round(parseFloat(hMatch[1]));

  // If both found, use them
  if (result.width > 0 && result.height > 0) return result;

  // Fall back to viewBox
  const vbMatch = svgText.match(
    /<svg[^>]*\sviewBox\s*=\s*["']?\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i
  );
  if (vbMatch) {
    if (!result.width) result.width = Math.round(parseFloat(vbMatch[1]));
    if (!result.height) result.height = Math.round(parseFloat(vbMatch[2]));
  }

  return result;
}

/**
 * Rasterize an SVG file to an Image element
 */
async function rasterizeSvg(file, targetSize) {
  const text = await file.text();
  // Sanitize: strip script tags and event handlers
  let sanitized = sanitizeSvg(text);

  // Ensure xmlns is present — required for standalone SVG rendering via data URI.
  // Inline SVGs in HTML inherit the namespace from the parser, but when loaded
  // as an image source the browser uses an XML parser which needs it explicit.
  if (/<svg\b/i.test(sanitized) && !/<svg[^>]*\sxmlns\s*=/i.test(sanitized)) {
    sanitized = sanitized.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  // Replace currentColor — it has no inherited value in a standalone image context
  // (no parent CSS cascade), so strokes/fills referencing it would be invisible.
  sanitized = sanitized.replace(/currentColor/g, '#000000');

  // Parse dimensions from SVG
  const dims = parseSvgDimensions(sanitized);
  const w = dims.width || targetSize || 1024;
  const h = dims.height || targetSize || 1024;

  // Create image from data URI
  const encoded = encodeURIComponent(sanitized);
  const dataUri = `data:image/svg+xml;charset=utf-8,${encoded}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Attach the parsed SVG dimensions directly — naturalWidth/naturalHeight
      // can be unreliable for SVGs loaded as data URIs across browsers (some
      // return viewBox dimensions, some return 0, some echo back the attribute).
      img._svgWidth = w;
      img._svgHeight = h;
      resolve(img);
    };
    img.onerror = () => reject(new Error('Failed to rasterize SVG'));
    img.width = w;
    img.height = h;
    img.src = dataUri;
  });
}

/**
 * @typedef {Object} ProcessSettings
 * @property {'fit-within'|'max-long-edge'|'exact'} mode
 * @property {number} width - target width (px)
 * @property {number|null} height - target height (px), null for max-long-edge
 * @property {'jpeg'|'png'|'webp'} format
 * @property {number} quality - 0-1 (e.g. 0.82)
 * @property {boolean} stripMetadata
 */

/**
 * @typedef {Object} ProcessResult
 * @property {Blob} blob - The processed image blob
 * @property {number} outputWidth
 * @property {number} outputHeight
 * @property {number} outputSize - Blob size in bytes
 */

/**
 * Load an image from a File or Blob into an HTMLImageElement
 * @param {File|Blob} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = trackUrl(URL.createObjectURL(file));

    img.onload = () => {
      revokeUrl(url);
      resolve(img);
    };
    img.onerror = () => {
      revokeUrl(url);
      reject(new Error(`Failed to load image: ${file.name || 'unknown'}`));
    };
    img.src = url;
  });
}

// calculateDimensions + getMimeType + isFormatMatch live in shared/dimensions.js
// (single source of truth — also imported by process-worker.js).

/**
 * Get the EXIF-corrected image as a canvas at native resolution
 */
function getExifCorrectedCanvas(img, srcWidth, srcHeight, orientation) {
  const canvas = document.createElement('canvas');
  canvas.width = srcWidth;
  canvas.height = srcHeight;
  const ctx = canvas.getContext('2d');

  if (orientation !== 1) {
    applyOrientationTransform(ctx, srcWidth, srcHeight, orientation);
    if (orientationSwapsDimensions(orientation)) {
      ctx.drawImage(img, 0, 0, img.naturalHeight, img.naturalWidth);
    } else {
      ctx.drawImage(img, 0, 0);
    }
  } else {
    ctx.drawImage(img, 0, 0);
  }

  return canvas;
}

/**
 * Process a single image file
 * @param {File} file - The input image file
 * @param {ProcessSettings} settings - Processing settings
 * @param {import('./editor.js').ImageEdits} [edits] - Optional per-image edits
 * @returns {Promise<ProcessResult>}
 */
export { isSvgFile, rasterizeSvg };

export async function processImage(file, settings, edits) {
  // 0a. Animated GIF → GIF: frame-by-frame resize preserving animation
  if (isGifFile(file) && settings.format === 'gif') {
    const animated = await isAnimatedGif(file);
    if (animated) {
      const result = await processAnimatedGif(file, settings, edits);
      if (result) return result;
      // Decoder failed — fall through to static first-frame path
    }
    // Static GIF with GIF output — fall through to normal first-frame path
  }

  // 0. If HEIC, decode to JPEG first; if SVG, rasterize it
  let imageFile = file;
  let skipExif = false;

  if (isSvgFile(file)) {
    const svgImg = await rasterizeSvg(file);
    // Use parsed SVG dimensions (reliable) over naturalWidth/Height (browser-dependent)
    const srcWidth = svgImg._svgWidth || svgImg.naturalWidth || svgImg.width;
    const srcHeight = svgImg._svgHeight || svgImg.naturalHeight || svgImg.height;

    const editedW =
      edits && hasEdits(edits) ? getEditedDimensions(srcWidth, srcHeight, edits).width : srcWidth;
    const editedH =
      edits && hasEdits(edits) ? getEditedDimensions(srcWidth, srcHeight, edits).height : srcHeight;

    let editedSource = null;
    if (edits && hasEdits(edits)) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = srcWidth;
      tempCanvas.height = srcHeight;
      const tmpCtx = tempCanvas.getContext('2d');
      // White background for SVGs (prevents black-on-transparent issues)
      tmpCtx.fillStyle = '#ffffff';
      tmpCtx.fillRect(0, 0, srcWidth, srcHeight);
      tmpCtx.drawImage(svgImg, 0, 0, srcWidth, srcHeight);
      editedSource = applyEditsToCanvas(tempCanvas, srcWidth, srcHeight, edits);
    }

    const target = calculateDimensions(editedW, editedH, settings);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');

    // White background for non-transparent output formats
    if (settings.format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, target.width, target.height);
    }

    if (editedSource) {
      if (settings.mode === 'exact' && (editedW !== target.width || editedH !== target.height)) {
        // Center-crop from the edited SVG canvas (same logic as non-SVG path)
        const srcAspect = editedW / editedH;
        const targetAspect = target.width / target.height;
        let cX, cY, cW, cH;

        if (srcAspect > targetAspect) {
          cH = editedH;
          cW = editedH * targetAspect;
          cX = (editedW - cW) / 2;
          cY = 0;
        } else {
          cW = editedW;
          cH = editedW / targetAspect;
          cX = 0;
          cY = (editedH - cH) / 2;
        }

        ctx.drawImage(editedSource, cX, cY, cW, cH, 0, 0, target.width, target.height);
      } else {
        ctx.drawImage(editedSource, 0, 0, target.width, target.height);
      }
    } else {
      if (settings.mode === 'exact' && (srcWidth !== target.width || srcHeight !== target.height)) {
        // Center-crop from the rasterized SVG — need to draw via an intermediate
        // canvas because drawImage's 9-arg source-crop form uses the <img>'s
        // intrinsic pixel grid, which for SVG data URIs may not match srcWidth×srcHeight.
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = srcWidth;
        tmpCanvas.height = srcHeight;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.fillStyle = '#ffffff';
        tmpCtx.fillRect(0, 0, srcWidth, srcHeight);
        tmpCtx.drawImage(svgImg, 0, 0, srcWidth, srcHeight);

        const srcAspect = srcWidth / srcHeight;
        const targetAspect = target.width / target.height;
        let cropX, cropY, cropW, cropH;

        if (srcAspect > targetAspect) {
          cropH = srcHeight;
          cropW = srcHeight * targetAspect;
          cropX = (srcWidth - cropW) / 2;
          cropY = 0;
        } else {
          cropW = srcWidth;
          cropH = srcWidth / targetAspect;
          cropX = 0;
          cropY = (srcHeight - cropH) / 2;
        }

        ctx.drawImage(tmpCanvas, cropX, cropY, cropW, cropH, 0, 0, target.width, target.height);
      } else {
        ctx.drawImage(svgImg, 0, 0, target.width, target.height);
      }
    }

    const result = await encodeCanvas(canvas, settings);
    return { ...result, outputWidth: target.width, outputHeight: target.height };
  }

  if (isHeicFile(file)) {
    imageFile = await decodeHeic(file);
    skipExif = true;
  }

  // 1. Read EXIF orientation
  const orientation = skipExif ? 1 : await getExifOrientation(imageFile);

  // 2. Load image into memory
  const img = await loadImage(imageFile);

  // 3. Determine source dimensions after EXIF correction
  let srcWidth = img.naturalWidth;
  let srcHeight = img.naturalHeight;

  if (orientationSwapsDimensions(orientation)) {
    [srcWidth, srcHeight] = [srcHeight, srcWidth];
  }

  // 4. If we have edits, build an intermediate corrected+edited canvas
  let editedSource = null;
  let editedW = srcWidth;
  let editedH = srcHeight;

  if (edits && hasEdits(edits)) {
    // Get EXIF-corrected canvas at native resolution
    const corrected = getExifCorrectedCanvas(img, srcWidth, srcHeight, orientation);

    // Apply edits (crop → rotate → flip) using the corrected canvas as image source
    editedSource = applyEditsToCanvas(corrected, srcWidth, srcHeight, edits);
    const dims = getEditedDimensions(srcWidth, srcHeight, edits);
    editedW = dims.width;
    editedH = dims.height;
  }

  // 5. Calculate target output dimensions
  const target = calculateDimensions(editedW, editedH, settings);

  // 6. Create final output canvas
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');

  if (editedSource) {
    // Draw from edited canvas
    if (settings.mode === 'exact' && (editedW !== target.width || editedH !== target.height)) {
      // Center-crop from the edited source
      const srcAspect = editedW / editedH;
      const targetAspect = target.width / target.height;
      let cX, cY, cW, cH;

      if (srcAspect > targetAspect) {
        cH = editedH;
        cW = editedH * targetAspect;
        cX = (editedW - cW) / 2;
        cY = 0;
      } else {
        cW = editedW;
        cH = editedW / targetAspect;
        cX = 0;
        cY = (editedH - cH) / 2;
      }

      ctx.drawImage(editedSource, cX, cY, cW, cH, 0, 0, target.width, target.height);
    } else {
      ctx.drawImage(editedSource, 0, 0, target.width, target.height);
    }
  } else {
    // No edits — original path with direct EXIF handling
    if (settings.mode === 'exact' && (srcWidth !== target.width || srcHeight !== target.height)) {
      const srcAspect = srcWidth / srcHeight;
      const targetAspect = target.width / target.height;
      let cropW, cropH, cropX, cropY;

      if (srcAspect > targetAspect) {
        cropH = srcHeight;
        cropW = srcHeight * targetAspect;
        cropX = (srcWidth - cropW) / 2;
        cropY = 0;
      } else {
        cropW = srcWidth;
        cropH = srcWidth / targetAspect;
        cropX = 0;
        cropY = (srcHeight - cropH) / 2;
      }

      if (orientation !== 1) {
        const tmpCanvas = getExifCorrectedCanvas(img, srcWidth, srcHeight, orientation);
        ctx.drawImage(tmpCanvas, cropX, cropY, cropW, cropH, 0, 0, target.width, target.height);
      } else {
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, target.width, target.height);
      }
    } else {
      if (orientation !== 1) {
        applyOrientationTransform(ctx, target.width, target.height, orientation);
        if (orientationSwapsDimensions(orientation)) {
          ctx.drawImage(img, 0, 0, target.height, target.width);
        } else {
          ctx.drawImage(img, 0, 0, target.width, target.height);
        }
      } else {
        ctx.drawImage(img, 0, 0, target.width, target.height);
      }
    }
  }

  // 7. Lossless pass-through check:
  // If no edits, no resize, and same format family → return original file as-is
  if (
    !editedSource &&
    target.width === srcWidth &&
    target.height === srcHeight &&
    isFormatMatch(file.type, settings.format)
  ) {
    const blob = file.slice(0, file.size, file.type);
    return {
      blob,
      outputWidth: target.width,
      outputHeight: target.height,
      outputSize: blob.size,
      lossless: true,
    };
  }

  // 8. Export canvas to blob (smart compression or standard)
  const result = await encodeCanvas(canvas, settings);
  return {
    ...result,
    outputWidth: target.width,
    outputHeight: target.height,
  };
}

/**
 * Encode a canvas to a blob, using smart compression when targetSizeKB is set.
 * @param {HTMLCanvasElement} canvas
 * @param {ProcessSettings} settings
 * @returns {Promise<{ blob: Blob, outputSize: number, achievedQuality?: number, smartCompress?: boolean }>}
 */
async function encodeCanvas(canvas, settings) {
  const mimeType = getMimeType(settings.format);

  // GIF output: use our encoder for consistent cross-browser support
  // (canvas.toBlob('image/gif') isn't supported in all browsers)
  if (settings.format === 'gif') {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const blob = encodeAnimatedGif([{ imageData, delay: 0 }], canvas.width, canvas.height, {
      loop: 0,
    });
    return { blob, outputSize: blob.size };
  }

  // Smart compression: target a file size (JPEG/WebP/AVIF only, not PNG)
  if (settings.targetSizeKB && settings.targetSizeKB > 0 && settings.format !== 'png') {
    const targetBytes = settings.targetSizeKB * 1024;
    const result = await compressToTarget(canvas, mimeType, targetBytes);
    return {
      blob: result.blob,
      outputSize: result.blob.size,
      achievedQuality: result.quality,
      smartCompress: true,
      belowTarget: result.belowTarget !== false,
    };
  }

  // Standard encoding
  const quality = settings.format === 'png' ? undefined : settings.quality;
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });

  return { blob, outputSize: blob.size };
}

/**
 * Process an animated GIF: decode all frames, resize each, re-encode.
 * Preserves animation timing and frame count.
 *
 * @param {File} file
 * @param {ProcessSettings} settings
 * @param {import('./editor.js').ImageEdits} [edits]
 * @returns {Promise<ProcessResult>}
 */
async function processAnimatedGif(file, settings, edits) {
  const gif = await decodeGifFrames(file);

  // If decoder returned no usable frames, fall back to static processing
  if (!gif.frames || gif.frames.length === 0) {
    console.warn('Animated GIF decoder returned 0 frames — falling back to static path');
    return null; // Caller will continue with normal static processing
  }

  const srcWidth = gif.width;
  const srcHeight = gif.height;

  // Apply edits to get effective source dimensions
  const editedW =
    edits && hasEdits(edits) ? getEditedDimensions(srcWidth, srcHeight, edits).width : srcWidth;
  const editedH =
    edits && hasEdits(edits) ? getEditedDimensions(srcWidth, srcHeight, edits).height : srcHeight;

  // Calculate target output size
  const target = calculateDimensions(editedW, editedH, settings);

  // Determine if we need center-crop (exact mode with different aspect ratio)
  const needsCrop =
    settings.mode === 'exact' && (editedW !== target.width || editedH !== target.height);

  let cropX = 0,
    cropY = 0,
    cropW = editedW,
    cropH = editedH;
  if (needsCrop) {
    const srcAspect = editedW / editedH;
    const targetAspect = target.width / target.height;
    if (srcAspect > targetAspect) {
      cropH = editedH;
      cropW = editedH * targetAspect;
      cropX = (editedW - cropW) / 2;
      cropY = 0;
    } else {
      cropW = editedW;
      cropH = editedW / targetAspect;
      cropX = 0;
      cropY = (editedH - cropH) / 2;
    }
  }

  // Process each frame
  const resizedFrames = [];
  const scratchCanvas = document.createElement('canvas');
  scratchCanvas.width = target.width;
  scratchCanvas.height = target.height;
  const scratchCtx = scratchCanvas.getContext('2d');

  for (const frame of gif.frames) {
    // Create a canvas from the frame's composited ImageData
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = srcWidth;
    frameCanvas.height = srcHeight;
    const frameCtx = frameCanvas.getContext('2d');
    frameCtx.putImageData(frame.imageData, 0, 0);

    // Apply per-image edits (rotate/flip/crop) if any
    let sourceCanvas = frameCanvas;
    if (edits && hasEdits(edits)) {
      sourceCanvas = applyEditsToCanvas(frameCanvas, srcWidth, srcHeight, edits);
    }

    // Draw to output size (with center-crop if needed)
    scratchCtx.clearRect(0, 0, target.width, target.height);
    if (needsCrop) {
      scratchCtx.drawImage(
        sourceCanvas,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        target.width,
        target.height
      );
    } else {
      scratchCtx.drawImage(sourceCanvas, 0, 0, target.width, target.height);
    }

    resizedFrames.push({
      imageData: scratchCtx.getImageData(0, 0, target.width, target.height),
      delay: frame.delay,
    });
  }

  // Re-encode as animated GIF
  const blob = encodeAnimatedGif(resizedFrames, target.width, target.height, { loop: 0 });

  return {
    blob,
    outputWidth: target.width,
    outputHeight: target.height,
    outputSize: blob.size,
    animatedGif: true,
    frameCount: resizedFrames.length,
  };
}

/**
 * Generate a small thumbnail blob for preview
 * @param {File} file
 * @param {number} maxSize - max dimension for thumbnail
 * @returns {Promise<string>} data URL for the thumbnail
 */
export async function generateThumbnail(file, maxSize = 200) {
  let imageFile = file;
  let skipExif = false;

  if (isSvgFile(file)) {
    const svgImg = await rasterizeSvg(file);
    // Prefer the parsed SVG dimensions attached by rasterizeSvg — these come
    // straight from the SVG markup and are immune to browser quirks with
    // naturalWidth/naturalHeight on SVG data-URI images.
    const srcW = svgImg._svgWidth || svgImg.naturalWidth || svgImg.width || 1024;
    const srcH = svgImg._svgHeight || svgImg.naturalHeight || svgImg.height || 1024;
    const ratio = Math.min(maxSize / srcW, maxSize / srcH, 1);
    const w = Math.round(srcW * ratio);
    const h = Math.round(srcH * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // JPEG has no transparency — fill white so SVG content isn't black-on-black
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(svgImg, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.6);
  }

  if (isHeicFile(file)) {
    imageFile = await decodeHeic(file);
    skipExif = true;
  }

  const img = await loadImage(imageFile);
  const orientation = skipExif ? 1 : await getExifOrientation(imageFile);

  let srcW = img.naturalWidth;
  let srcH = img.naturalHeight;

  if (orientationSwapsDimensions(orientation)) {
    [srcW, srcH] = [srcH, srcW];
  }

  const ratio = Math.min(maxSize / srcW, maxSize / srcH, 1);
  const w = Math.round(srcW * ratio);
  const h = Math.round(srcH * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (orientation !== 1) {
    applyOrientationTransform(ctx, w, h, orientation);
    if (orientationSwapsDimensions(orientation)) {
      ctx.drawImage(img, 0, 0, h, w);
    } else {
      ctx.drawImage(img, 0, 0, w, h);
    }
  } else {
    ctx.drawImage(img, 0, 0, w, h);
  }

  return canvas.toDataURL('image/jpeg', 0.6);
}
