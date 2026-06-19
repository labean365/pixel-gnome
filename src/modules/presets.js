/**
 * presets.js
 * Built-in preset definitions and localStorage save/load for custom presets.
 */

/**
 * @typedef {Object} Preset
 * @property {string} id
 * @property {string} name
 * @property {'original'|'fit-within'|'max-long-edge'|'exact'} mode
 * @property {number|null} width
 * @property {number|null} height
 * @property {'jpeg'|'png'|'webp'|'avif'|'gif'} format
 * @property {number} quality - 0-1 range (e.g. 0.82)
 * @property {boolean} stripMetadata
 * @property {boolean} [neverUpscale] - clamp to source size (default true)
 * @property {string} pattern - filename pattern e.g. "{name}-web"
 * @property {'Original'|'Web'|'Social'|'Email'} [group] - dropdown optgroup; omit for Custom
 */

// Mode guidance:
//   fit-within / max-long-edge → the number is a CEILING (no crop, aspect preserved).
//   exact                      → the number is a SLOT a platform enforces (center-crop).
// Social presets are 'exact' so the output actually matches the labelled dimensions.
// neverUpscale defaults true everywhere: fit modes never upscale anyway, and for
// exact modes it prevents blowing a small source up into a soft full-size crop.
const BUILT_IN_PRESETS = [
  // --- Original (convert & compress only — no resize) ---
  // This is the first-run default (getDefaultPreset() fetches it by id, so array
  // position doesn't matter); rebuildPresetDropdown() renders the 'Original'
  // group first regardless.
  {
    id: 'original',
    name: 'Original size — convert & compress',
    group: 'Original',
    mode: 'original',
    width: null,
    height: null,
    format: 'webp',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-min',
  },

  // --- Web ---
  {
    id: 'full-hd',
    name: 'Full HD — 1920 × 1080',
    group: 'Web',
    mode: 'fit-within',
    width: 1920,
    height: 1080,
    format: 'jpeg',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-web',
  },
  {
    id: 'large-web',
    name: 'Large Web — 1600 px',
    group: 'Web',
    mode: 'max-long-edge',
    width: 1600,
    height: null,
    format: 'jpeg',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-web',
  },
  {
    id: 'thumbnail',
    name: 'Thumbnail — 800 × 800 (fit)',
    group: 'Web',
    mode: 'fit-within',
    width: 800,
    height: 800,
    format: 'jpeg',
    quality: 0.8,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-thumb',
  },

  // --- Social (exact = center-crop to the labelled size) ---
  {
    id: 'square-social',
    name: 'Social Square — 1080 × 1080',
    group: 'Social',
    mode: 'exact',
    width: 1080,
    height: 1080,
    format: 'jpeg',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-sq',
  },
  {
    id: 'portrait-social',
    name: 'Social Portrait — 1080 × 1350',
    group: 'Social',
    mode: 'exact',
    width: 1080,
    height: 1350,
    format: 'jpeg',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-portrait',
  },
  {
    id: 'story-social',
    name: 'Story / Reel — 1080 × 1920',
    group: 'Social',
    mode: 'exact',
    width: 1080,
    height: 1920,
    format: 'jpeg',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-story',
  },
  {
    id: 'landscape-social',
    name: 'Social Landscape — 1200 × 675',
    group: 'Social',
    mode: 'exact',
    width: 1200,
    height: 675,
    format: 'jpeg',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-landscape',
  },
  {
    id: 'open-graph',
    name: 'Open Graph / Link Preview — 1200 × 630',
    group: 'Social',
    mode: 'exact',
    width: 1200,
    height: 630,
    format: 'jpeg',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-og',
  },
  {
    id: 'youtube-thumb',
    name: 'YouTube Thumbnail — 1280 × 720',
    group: 'Social',
    mode: 'exact',
    width: 1280,
    height: 720,
    format: 'jpeg',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-yt',
  },
  {
    id: 'pinterest-pin',
    name: 'Pinterest Pin — 1000 × 1500',
    group: 'Social',
    mode: 'exact',
    width: 1000,
    height: 1500,
    format: 'jpeg',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-pin',
  },
  {
    id: 'profile-avatar',
    name: 'Profile Avatar — 800 × 800 (crop)',
    group: 'Social',
    mode: 'exact',
    width: 800,
    height: 800,
    format: 'jpeg',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-avatar',
  },

  // --- Email ---
  {
    id: 'email-hero',
    name: 'Email Hero — 600 px wide',
    group: 'Email',
    mode: 'fit-within',
    width: 600,
    height: null,
    format: 'jpeg',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-email',
  },
  {
    id: 'email-retina',
    name: 'Email Retina — 1200 px wide',
    group: 'Email',
    mode: 'fit-within',
    width: 1200,
    height: null,
    format: 'jpeg',
    quality: 0.78,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-email-2x',
  },

  // --- Custom (ungrouped; always last) ---
  {
    id: 'custom',
    name: 'Custom',
    mode: 'fit-within',
    width: 1920,
    height: 1080,
    format: 'jpeg',
    quality: 0.82,
    stripMetadata: true,
    neverUpscale: true,
    pattern: '{name}-web',
  },
];

const STORAGE_KEY = 'pixeldrop-custom-presets';
const SCHEMA_VERSION = 1;

/**
 * Get all built-in presets
 * @returns {Preset[]}
 */
export function getBuiltInPresets() {
  return BUILT_IN_PRESETS;
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Human-readable aspect-ratio label for a width/height, e.g. "1:1", "9:16".
 * Falls back to a decimal form ("1.90:1") when the reduced ratio is unwieldy
 * (e.g. Open Graph 1200×630). Returns '' if either dimension is missing.
 * @param {number} w
 * @param {number} h
 * @returns {string}
 */
export function ratioLabel(w, h) {
  if (!(w > 0) || !(h > 0)) return '';
  const g = gcd(w, h);
  const rw = w / g;
  const rh = h / g;
  if (rw <= 32 && rh <= 32) return `${rw}:${rh}`;
  return (w / h).toFixed(2) + ':1';
}

/**
 * Ratio badge for a preset's dropdown label — only meaningful (and only shown)
 * for 'exact' presets, where the output ratio is actually guaranteed. Fit and
 * long-edge presets keep the source ratio, so a badge there would mislead.
 * @param {Preset} preset
 * @returns {string}
 */
export function getPresetRatioBadge(preset) {
  if (!preset || preset.mode !== 'exact') return '';
  return ratioLabel(preset.width, preset.height);
}

/**
 * Get a preset by ID
 * @param {string} id
 * @returns {Preset|undefined}
 */
export function getPresetById(id) {
  return BUILT_IN_PRESETS.find((p) => p.id === id);
}

/**
 * Get the default preset
 * @returns {Preset}
 */
export function getDefaultPreset() {
  // First-run default is 'original' (convert & compress, no resize) — the most
  // common intent. Falls back to full-hd, then the first built-in.
  return { ...(getPresetById('original') || getPresetById('full-hd') || BUILT_IN_PRESETS[0]) };
}

/**
 * Sanity-check an individual preset. Returns true if it has enough shape to
 * be rendered / applied; callers still run the field-filling migratePreset
 * pass (in settings.js) to fill any newer optional fields.
 */
function isValidPreset(p) {
  return (
    p &&
    typeof p === 'object' &&
    typeof p.id === 'string' &&
    p.id.length > 0 &&
    typeof p.name === 'string' &&
    typeof p.mode === 'string' &&
    typeof p.width === 'number' &&
    typeof p.format === 'string'
  );
}

function migrateCustomPresets(data, fromVersion) {
  void fromVersion;
  if (!Array.isArray(data)) return [];
  // Filter irreparable entries; leave field-filling to migratePreset in settings.js.
  return data.filter(isValidPreset);
}

/**
 * Load saved custom presets from localStorage.
 * v0.17: reads {schemaVersion, data} envelope with graceful legacy fallback.
 * @returns {Preset[]}
 */
export function loadCustomPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);

    // Legacy blob (pre-envelope) — bare array.
    if (Array.isArray(parsed)) {
      return migrateCustomPresets(parsed, 0);
    }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.schemaVersion !== 'number') {
      return [];
    }

    // Future version — preserve, fall back to empty.
    if (parsed.schemaVersion > SCHEMA_VERSION) {
      try {
        localStorage.setItem(`${STORAGE_KEY}.backup`, raw);
      } catch {
        /* best-effort */
      }
      console.warn(
        `PixelGnome: ${STORAGE_KEY} has unsupported schemaVersion ${parsed.schemaVersion}; preserved blob in ${STORAGE_KEY}.backup`
      );
      return [];
    }

    return migrateCustomPresets(parsed.data, parsed.schemaVersion);
  } catch {
    return [];
  }
}

/**
 * Save custom presets to localStorage.
 * v0.17: wraps in {schemaVersion, data} envelope.
 * @param {Preset[]} presets
 */
export function saveCustomPresets(presets) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, data: presets })
    );
  } catch {
    console.warn('PixelGnome: Failed to save custom presets to localStorage');
  }
}

/**
 * Create a settings object from a preset (for passing to image-processor)
 * @param {Preset} preset
 * @returns {import('./image-processor.js').ProcessSettings}
 */
export function presetToSettings(preset) {
  return {
    mode: preset.mode,
    width: preset.width,
    height: preset.height,
    format: preset.format,
    quality: preset.quality,
    stripMetadata: preset.stripMetadata,
  };
}
