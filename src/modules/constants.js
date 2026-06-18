/**
 * constants.js
 * Single source of truth for performance guard constants.
 *
 * Imported by main.js (runtime warning thresholds) and help-modal.js
 * (user-facing Pro Tips copy), so changing a value here flows to both
 * the warning logic and the help text in one edit.
 */

/** Warn above this many megapixels per image — raster ops get slow above this. */
export const MAX_MEGAPIXELS = 30;

/** Warn above this many files dropped in one batch — UI stays responsive, just sluggish. */
export const MAX_BATCH_SIZE = 50;
