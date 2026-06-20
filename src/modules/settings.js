/**
 * settings.js
 * Manages the settings panel DOM and current settings state.
 * When a preset is selected, populates the UI.
 * When the user manually changes a setting, switches to "Custom".
 * Phase 2: Adds save/delete/export/import for custom presets.
 * Phase 5+: Adds neverUpscale toggle and filename pattern system.
 */

import {
  getPresetById,
  getDefaultPreset,
  getBuiltInPresets,
  getPresetRatioBadge,
  loadCustomPresets,
  saveCustomPresets,
} from './presets.js';
import { showToast } from './toast.js';
import { t } from './i18n.js';
import { trackUrl, revokeUrl } from './resource-tracker.js';
import { trackRecipeSelected } from './analytics.js';

/**
 * Recipes (C3): task-oriented entry that maps an intent to sensible Step-2
 * settings for the image pipeline. Image-first — a recipe sets the image
 * settings; PDF cross-type resolution is handled at export (C4) / in the
 * drill-in. `preset` applies a built-in preset by id; `settings` applies a
 * field patch (presetId becomes 'custom').
 */
const RECIPES = {
  compress: { preset: 'original' },
  'email-safe': {
    settings: {
      mode: 'max-long-edge',
      width: 1600,
      height: null,
      format: 'jpeg',
      quality: 0.75,
      stripMetadata: true,
      neverUpscale: true,
      pattern: '{name}-email',
    },
  },
  convert: { settings: { mode: 'original', width: null, height: null }, focusFormat: true },
};

// --- Settings persistence ---
const SETTINGS_STORAGE_KEY = 'pixeldrop-settings';
const SETTINGS_SCHEMA_VERSION = 1;

/**
 * @typedef {Object} SettingsState
 * @property {string} presetId
 * @property {'fit-within'|'max-long-edge'|'exact'} mode
 * @property {number} width
 * @property {number|null} height
 * @property {'jpeg'|'png'|'webp'} format
 * @property {number} quality - 0-1
 * @property {boolean} stripMetadata
 * @property {boolean} neverUpscale
 * @property {string} pattern - filename pattern with tokens like {name}, {width}, etc.
 */

// DOM references
let els = {};
let state = {};
let onChange = null;

// Track user-saved presets separately
let userPresets = [];

/**
 * Initialize the settings panel
 * @param {function(SettingsState): void} onChangeCallback - Called when any setting changes
 */
export function initSettings(onChangeCallback) {
  onChange = onChangeCallback;

  // Grab all DOM elements
  els = {
    presetSelect: document.getElementById('presetSelect'),
    recipeButtons: document.querySelectorAll('[data-recipe]'),
    resizeModes: document.querySelectorAll('input[name="resizeMode"]'),
    targetWidth: document.getElementById('targetWidth'),
    targetHeight: document.getElementById('targetHeight'),
    dimensionsGroup: document.getElementById('dimensionsGroup'),
    dimensionSep: document.getElementById('dimensionSep'),
    outputFormat: document.getElementById('outputFormat'),
    qualitySlider: document.getElementById('qualitySlider'),
    qualityValue: document.getElementById('qualityValue'),
    qualityGroup: document.getElementById('qualityGroup'),
    neverUpscale: document.getElementById('neverUpscale'),
    stripMetadata: document.getElementById('stripMetadata'),
    filenamePattern: document.getElementById('filenamePattern'),
    patternPreview: document.getElementById('patternPreview'),
    savePresetBtn: document.getElementById('savePresetBtn'),
    deletePresetBtn: document.getElementById('deletePresetBtn'),
    exportPresetsBtn: document.getElementById('exportPresetsBtn'),
    importPresetsBtn: document.getElementById('importPresetsBtn'),
    importPresetsFile: document.getElementById('importPresetsFile'),
    resetSettingsBtn: document.getElementById('resetSettingsBtn'),
    // Phase 9: Smart compression
    targetSizeEnabled: document.getElementById('targetSizeEnabled'),
    targetSizeRow: document.getElementById('targetSizeRow'),
    targetSizeKB: document.getElementById('targetSizeKB'),
    targetSizeGroup: document.getElementById('targetSizeGroup'),
    // Phase 9: Responsive export
    responsiveEnabled: document.getElementById('responsiveEnabled'),
    responsiveOptions: document.getElementById('responsiveOptions'),
    responsivePreset: document.getElementById('responsivePreset'),
    responsiveCustomRow: document.getElementById('responsiveCustomRow'),
    responsiveCustomSizes: document.getElementById('responsiveCustomSizes'),
    // Phase 2 (guided workflow): the "Customize" disclosure under Step 2
    customizePanel: document.getElementById('customizePanel'),
  };

  // Load saved presets and rebuild the dropdown
  // Migrate legacy "suffix" → "pattern" on user presets
  userPresets = loadCustomPresets().map(migratePreset);
  rebuildPresetDropdown();

  // Restore persisted settings if available, otherwise use default preset
  const savedSettings = loadSettingsFromStorage();
  if (savedSettings) {
    state = { ...savedSettings };
    // Ensure neverUpscale and pattern have fallbacks
    if (state.neverUpscale === undefined) state.neverUpscale = true;
    if (!state.pattern) state.pattern = '{name}-web';
    // Remember-last-preset: the whole state (including presetId) is restored
    // above. Guard against a persisted presetId that no longer resolves — e.g.
    // a deleted custom preset or a built-in renamed across versions — so the
    // dropdown never points at a phantom option. The restored dimensions stay;
    // we just relabel the selection as "custom".
    const presetExists =
      state.presetId === 'custom' ||
      !!getPresetById(state.presetId) ||
      userPresets.some((p) => p.id === state.presetId);
    if (!presetExists) state.presetId = 'custom';
  } else {
    const defaultPreset = getDefaultPreset();
    applyPresetToState(defaultPreset);
  }
  syncUIFromState();

  // --- Event listeners ---

  // Preset selection
  els.presetSelect.addEventListener('change', () => {
    const id = els.presetSelect.value;
    const preset = getPresetById(id) || userPresets.find((p) => p.id === id);
    if (preset) {
      applyPresetToState(preset);
      syncUIFromState();
      updateDeleteBtnVisibility();
      // Picking "Custom" — or the convert-only "Original size" preset — reveals
      // the advanced controls. For "Original" this surfaces Format + Quality
      // (the whole point of that preset) without the user hunting for them.
      if ((id === 'custom' || id === 'original') && els.customizePanel) {
        els.customizePanel.open = true;
      }
      emitChange();
    }
  });

  // Recipes (C3): task-oriented chips above the preset selector.
  els.recipeButtons.forEach((btn) => {
    btn.addEventListener('click', () => applyRecipe(btn.dataset.recipe));
  });

  // Customize disclosure: always start collapsed on load for a clean first view.
  // The user can expand it any time; selecting the "Custom" preset auto-opens it
  // (above), since the width/height fields live inside.
  if (els.customizePanel) {
    els.customizePanel.open = false;
  }

  // Resize mode
  els.resizeModes.forEach((radio) => {
    radio.addEventListener('change', () => {
      state.mode = radio.value;
      switchToCustom();
      updateDimensionsVisibility();
      emitChange();
    });
  });

  // Dimensions
  els.targetWidth.addEventListener('input', () => {
    state.width = parseInt(els.targetWidth.value, 10) || 0;
    switchToCustom();
    updatePatternPreview();
    emitChange();
  });

  els.targetHeight.addEventListener('input', () => {
    state.height = parseInt(els.targetHeight.value, 10) || null;
    switchToCustom();
    updatePatternPreview();
    emitChange();
  });

  // Output format
  els.outputFormat.addEventListener('change', () => {
    state.format = els.outputFormat.value;
    updateQualityVisibility();
    switchToCustom();
    updatePatternPreview();
    emitChange();
  });

  // Quality slider
  els.qualitySlider.addEventListener('input', () => {
    const val = parseInt(els.qualitySlider.value, 10);
    state.quality = val / 100;
    els.qualityValue.textContent = val;
    els.qualitySlider.setAttribute('aria-valuenow', val);
    switchToCustom();
    emitChange();
  });

  // Never upscale
  els.neverUpscale.addEventListener('change', () => {
    state.neverUpscale = els.neverUpscale.checked;
    switchToCustom();
    emitChange();
  });

  // Metadata
  els.stripMetadata.addEventListener('change', () => {
    state.stripMetadata = els.stripMetadata.checked;
    switchToCustom();
    emitChange();
  });

  // Filename pattern
  els.filenamePattern.addEventListener('input', () => {
    state.pattern = els.filenamePattern.value;
    switchToCustom();
    updatePatternPreview();
    // Don't trigger reprocessing, but do persist
    saveSettingsToStorage();
  });

  // Phase 9: Target file size toggle
  if (els.targetSizeEnabled) {
    els.targetSizeEnabled.addEventListener('change', () => {
      state.targetSizeEnabled = els.targetSizeEnabled.checked;
      if (els.targetSizeRow) els.targetSizeRow.hidden = !state.targetSizeEnabled;
      switchToCustom();
      emitChange();
    });
  }
  if (els.targetSizeKB) {
    els.targetSizeKB.addEventListener('input', () => {
      state.targetSizeKB = parseInt(els.targetSizeKB.value, 10) || 0;
      switchToCustom();
      emitChange();
    });
  }

  // Phase 9: Responsive export toggle
  if (els.responsiveEnabled) {
    els.responsiveEnabled.addEventListener('change', () => {
      state.responsiveEnabled = els.responsiveEnabled.checked;
      if (els.responsiveOptions) els.responsiveOptions.hidden = !state.responsiveEnabled;
      // Show/hide the responsive ZIP button
      const respBtn = document.getElementById('exportResponsiveBtn');
      if (respBtn) respBtn.hidden = !state.responsiveEnabled;
      saveSettingsToStorage();
    });
  }
  if (els.responsivePreset) {
    els.responsivePreset.addEventListener('change', () => {
      state.responsivePreset = els.responsivePreset.value;
      if (els.responsiveCustomRow) {
        els.responsiveCustomRow.hidden = state.responsivePreset !== 'custom-bp';
      }
      saveSettingsToStorage();
    });
  }
  if (els.responsiveCustomSizes) {
    els.responsiveCustomSizes.addEventListener('input', () => {
      state.responsiveCustomSizes = els.responsiveCustomSizes.value;
      saveSettingsToStorage();
    });
  }

  // --- Preset management buttons ---

  els.savePresetBtn.addEventListener('click', handleSavePreset);
  els.deletePresetBtn.addEventListener('click', handleDeletePreset);
  els.exportPresetsBtn.addEventListener('click', handleExportPresets);
  els.importPresetsBtn.addEventListener('click', () => els.importPresetsFile.click());
  els.importPresetsFile.addEventListener('change', handleImportPresets);

  // Reset settings button (Phase 8.7)
  if (els.resetSettingsBtn) {
    els.resetSettingsBtn.addEventListener('click', handleResetSettings);
  }
}

/**
 * Get the current settings state
 * @returns {SettingsState}
 */
export function getSettings() {
  return { ...state };
}

/**
 * Get just the processing-relevant settings (for image-processor)
 */
export function getProcessSettings() {
  return {
    mode: state.mode,
    width: state.width,
    height: state.height,
    format: state.format,
    quality: state.quality,
    stripMetadata: state.stripMetadata,
    neverUpscale: state.neverUpscale,
    presetId: state.presetId,
    targetSizeKB: state.targetSizeEnabled ? state.targetSizeKB || 0 : 0,
  };
}

/**
 * Get responsive export settings.
 * @returns {{ enabled: boolean, breakpoints: number[] }}
 */
export function getResponsiveSettings() {
  if (!state.responsiveEnabled) return { enabled: false, breakpoints: [] };

  const presetMap = {
    'web-standard': [320, 640, 1024, 1920],
    'retina-web': [640, 1280, 1920, 2560],
    thumbnails: [100, 200, 400, 800],
    'social-media': [400, 800, 1080, 1200],
  };

  if (state.responsivePreset === 'custom-bp') {
    const raw = state.responsiveCustomSizes || '';
    const sizes = raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => n > 0);
    return { enabled: true, breakpoints: sizes.length > 0 ? sizes : [640, 1024, 1920] };
  }

  return {
    enabled: true,
    breakpoints: presetMap[state.responsivePreset] || presetMap['web-standard'],
  };
}

/**
 * Get the filename pattern
 */
export function getPattern() {
  return state.pattern;
}

/**
 * Programmatically set the output dimensions and mode.
 * Used by the crop modal's "Export Size" feature to tie crop + resize together.
 *
 * @param {number} width - Target output width in pixels
 * @param {number} height - Target output height in pixels
 */
export function applyExportSize(width, height) {
  state.mode = 'exact';
  state.width = width;
  state.height = height;
  syncUIFromState();
  emitChange();
}

// --- Preset management handlers ---

function handleSavePreset() {
  const name = prompt('Preset name:');
  if (!name || !name.trim()) return;

  const id =
    'user-' +
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');

  // Check for duplicate
  if (userPresets.find((p) => p.id === id)) {
    if (!confirm(`A preset named "${name.trim()}" already exists. Overwrite?`)) return;
    userPresets = userPresets.filter((p) => p.id !== id);
  }

  const preset = {
    id,
    name: name.trim(),
    mode: state.mode,
    width: state.width,
    height: state.height,
    format: state.format,
    quality: state.quality,
    stripMetadata: state.stripMetadata,
    neverUpscale: state.neverUpscale,
    pattern: state.pattern,
    isUserPreset: true,
  };

  userPresets.push(preset);
  saveCustomPresets(userPresets);
  rebuildPresetDropdown();

  // Select the new preset
  state.presetId = id;
  els.presetSelect.value = id;
  updateDeleteBtnVisibility();

  showToast(t('toast.presetSaved', { name: name.trim() }), 'success');
}

function handleDeletePreset() {
  const id = state.presetId;
  const preset = userPresets.find((p) => p.id === id);
  if (!preset) return;

  if (!confirm(`Delete preset "${preset.name}"?`)) return;

  userPresets = userPresets.filter((p) => p.id !== id);
  saveCustomPresets(userPresets);
  rebuildPresetDropdown();

  // Revert to default
  const defaultPreset = getDefaultPreset();
  applyPresetToState(defaultPreset);
  syncUIFromState();
  updateDeleteBtnVisibility();
  emitChange();

  showToast(t('toast.presetDeleted', { name: preset.name }), 'info');
}

function handleExportPresets() {
  if (userPresets.length === 0) {
    showToast(t('toast.noPresetsExport'), 'warning');
    return;
  }

  const json = JSON.stringify(userPresets, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = trackUrl(URL.createObjectURL(blob));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pixelgnome-presets.json';
  a.click();
  revokeUrl(url);

  showToast(t('toast.presetsExported', { count: userPresets.length }), 'success');
}

function handleImportPresets() {
  const file = els.importPresetsFile.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error('Invalid format');

      // Validate each preset has required fields
      const valid = imported
        .filter((p) => p.id && p.name && p.mode && typeof p.width === 'number')
        .map(migratePreset);

      if (valid.length === 0) {
        showToast(t('toast.noValidPresets'), 'error');
        return;
      }

      // Mark as user presets and merge (overwrite duplicates)
      for (const preset of valid) {
        preset.isUserPreset = true;
        const existingIdx = userPresets.findIndex((p) => p.id === preset.id);
        if (existingIdx >= 0) {
          userPresets[existingIdx] = preset;
        } else {
          userPresets.push(preset);
        }
      }

      saveCustomPresets(userPresets);
      rebuildPresetDropdown();

      showToast(t('toast.presetsImported', { count: valid.length }), 'success');
    } catch {
      showToast(t('toast.importFailed'), 'error');
    }
  };
  reader.readAsText(file);

  // Reset input so the same file can be imported again
  els.importPresetsFile.value = '';
}

// --- Internal helpers ---

/**
 * Migrate a preset from legacy "suffix" to "pattern" format.
 * If a preset has "suffix" but no "pattern", convert it.
 */
function migratePreset(preset) {
  if (preset.suffix !== undefined && preset.pattern === undefined) {
    preset.pattern = `{name}${preset.suffix}`;
  }
  if (preset.neverUpscale === undefined) {
    preset.neverUpscale = true;
  }
  return preset;
}

function applyPresetToState(preset) {
  const migrated = migratePreset({ ...preset });
  state = {
    presetId: migrated.id,
    recipeId: null,
    mode: migrated.mode,
    width: migrated.width,
    height: migrated.height,
    format: migrated.format,
    quality: migrated.quality,
    stripMetadata: migrated.stripMetadata,
    neverUpscale: migrated.neverUpscale !== undefined ? migrated.neverUpscale : true,
    pattern: migrated.pattern || '{name}-web',
    // Phase 9 defaults
    targetSizeEnabled: false,
    targetSizeKB: 500,
    responsiveEnabled: false,
    responsivePreset: 'web-standard',
    responsiveCustomSizes: '',
  };
}

/**
 * Apply a recipe (C3): map a task intent to Step-2 image settings, then mark the
 * chip active. `compress` applies the 'original' preset; the others apply a field
 * patch on top of the current state (presetId → 'custom'). PDFs resolve later
 * (C4 / drill-in) — this is the image-first slice.
 * @param {'compress'|'email-safe'|'convert'} id
 */
function applyRecipe(id) {
  const recipe = RECIPES[id];
  if (!recipe) return;

  if (recipe.preset) {
    const preset = getPresetById(recipe.preset);
    if (preset) applyPresetToState(preset);
  } else if (recipe.settings) {
    // Patch the current state, then relabel the preset as Custom.
    state = { ...state, ...recipe.settings, presetId: 'custom' };
  }
  state.recipeId = id;

  syncUIFromState();
  updateDeleteBtnVisibility();
  // Surface Format + Quality so the recipe's effect (esp. Convert) is visible.
  if (els.customizePanel) els.customizePanel.open = true;
  if (recipe.focusFormat && els.outputFormat) els.outputFormat.focus();

  emitChange();
  trackRecipeSelected({ recipe: id });
}

/** Toggle the `.active` class on recipe chips to match state.recipeId. */
function renderRecipeActive() {
  if (!els.recipeButtons) return;
  els.recipeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.recipe === state.recipeId);
    if (btn.dataset.recipe === state.recipeId) {
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.removeAttribute('aria-pressed');
    }
  });
}

function syncUIFromState() {
  els.presetSelect.value = state.presetId;
  renderRecipeActive();

  // Resize mode radios
  els.resizeModes.forEach((radio) => {
    radio.checked = radio.value === state.mode;
  });

  // Dimensions
  els.targetWidth.value = state.width || '';
  els.targetHeight.value = state.height || '';
  updateDimensionsVisibility();

  // Format
  els.outputFormat.value = state.format;
  updateQualityVisibility();

  // Quality
  const qualityInt = Math.round(state.quality * 100);
  els.qualitySlider.value = qualityInt;
  els.qualityValue.textContent = qualityInt;

  // Never upscale
  els.neverUpscale.checked = state.neverUpscale;

  // Metadata
  els.stripMetadata.checked = state.stripMetadata;

  // Pattern
  els.filenamePattern.value = state.pattern;
  updatePatternPreview();

  // Phase 9: Target file size
  if (els.targetSizeEnabled) {
    els.targetSizeEnabled.checked = !!state.targetSizeEnabled;
    if (els.targetSizeRow) els.targetSizeRow.hidden = !state.targetSizeEnabled;
  }
  if (els.targetSizeKB) {
    els.targetSizeKB.value = state.targetSizeKB || 500;
  }
  updateTargetSizeVisibility();

  // Phase 9: Responsive export
  if (els.responsiveEnabled) {
    els.responsiveEnabled.checked = !!state.responsiveEnabled;
    if (els.responsiveOptions) els.responsiveOptions.hidden = !state.responsiveEnabled;
  }
  if (els.responsivePreset) {
    els.responsivePreset.value = state.responsivePreset || 'web-standard';
    if (els.responsiveCustomRow) {
      els.responsiveCustomRow.hidden = state.responsivePreset !== 'custom-bp';
    }
  }
  if (els.responsiveCustomSizes) {
    els.responsiveCustomSizes.value = state.responsiveCustomSizes || '';
  }
  // Show/hide responsive ZIP button
  const respBtn = document.getElementById('exportResponsiveBtn');
  if (respBtn) respBtn.hidden = !state.responsiveEnabled;
}

function rebuildPresetDropdown() {
  const select = els.presetSelect;
  const currentValue = select.value;

  // Clear existing options
  select.innerHTML = '';

  const makeOption = (preset) => {
    const opt = document.createElement('option');
    opt.value = preset.id;
    const badge = getPresetRatioBadge(preset);
    opt.textContent = badge ? `${preset.name} · ${badge}` : preset.name;
    return opt;
  };

  // Built-in presets, bucketed into optgroups by their `group` field.
  // Order is fixed; ungrouped built-ins (e.g. Custom) render at the top level last.
  const builtIns = getBuiltInPresets();
  const GROUP_ORDER = ['Original', 'Web', 'Social', 'Email'];
  for (const groupName of GROUP_ORDER) {
    const inGroup = builtIns.filter((p) => p.group === groupName);
    if (inGroup.length === 0) continue;
    const optgroup = document.createElement('optgroup');
    optgroup.label = groupName;
    for (const preset of inGroup) optgroup.appendChild(makeOption(preset));
    select.appendChild(optgroup);
  }
  // Ungrouped built-ins (Custom) at the top level, after the groups.
  for (const preset of builtIns.filter((p) => !p.group)) {
    select.appendChild(makeOption(preset));
  }

  // User presets in their own group.
  if (userPresets.length > 0) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = 'Saved Presets';
    for (const preset of userPresets) optgroup.appendChild(makeOption(preset));
    select.appendChild(optgroup);
  }

  // Restore selection if possible
  if (select.querySelector(`option[value="${currentValue}"]`)) {
    select.value = currentValue;
  }
}

function switchToCustom() {
  // A manual edit means the settings no longer match the recipe's intent —
  // clear the chip highlight (even when presetId is already 'custom').
  if (state.recipeId) {
    state.recipeId = null;
    renderRecipeActive();
  }
  if (state.presetId !== 'custom') {
    state.presetId = 'custom';
    els.presetSelect.value = 'custom';
    updateDeleteBtnVisibility();
  }
}

function updateDeleteBtnVisibility() {
  // Only show delete button for user-saved presets
  const isUserPreset = userPresets.some((p) => p.id === state.presetId);
  els.deletePresetBtn.hidden = !isUserPreset;
}

function updateDimensionsVisibility() {
  const isOriginal = state.mode === 'original';
  const isMaxLongEdge = state.mode === 'max-long-edge';
  // 'original' keeps the source pixel dimensions, so the width/height inputs
  // have nothing to control — hide the whole group.
  if (els.dimensionsGroup) els.dimensionsGroup.style.display = isOriginal ? 'none' : '';
  els.targetHeight.parentElement.style.display = isMaxLongEdge ? 'none' : '';
  els.dimensionSep.style.display = isMaxLongEdge ? 'none' : '';
}

function updateQualityVisibility() {
  // Quality slider doesn't apply to PNG (lossless) or GIF (palette-based)
  const hideQuality = state.format === 'png' || state.format === 'gif';
  els.qualityGroup.style.display = hideQuality ? 'none' : '';
  updateTargetSizeVisibility();
}

function updateTargetSizeVisibility() {
  // Target file size only works with lossy formats (not PNG or GIF)
  const hideSizeTarget = state.format === 'png' || state.format === 'gif';
  if (els.targetSizeGroup) {
    els.targetSizeGroup.style.display = hideSizeTarget ? 'none' : '';
  }
}

/**
 * Show a live preview of the filename pattern result
 */
function updatePatternPreview() {
  if (!els.patternPreview) return;
  const example = resolvePattern(state.pattern, 'photo', {
    width: state.width || 1920,
    height: state.height || 1080,
    preset: state.presetId,
    format: state.format,
  });
  const ext = state.format === 'jpeg' ? '.jpg' : `.${state.format}`;
  els.patternPreview.textContent = `→ ${example}${ext}`;
}

/**
 * Resolve a filename pattern by replacing tokens.
 * @param {string} pattern
 * @param {string} baseName - original filename without extension
 * @param {Object} meta - { width, height, preset, format }
 * @returns {string} Resolved filename (without extension)
 */
function resolvePattern(pattern, baseName, meta) {
  return pattern
    .replace(/\{name\}/gi, baseName)
    .replace(/\{width\}/gi, String(meta.width || ''))
    .replace(/\{height\}/gi, String(meta.height || ''))
    .replace(/\{preset\}/gi, meta.preset || 'custom')
    .replace(/\{format\}/gi, meta.format || '');
}

/**
 * Save current settings to localStorage for persistence across sessions.
 * Phase 8.7: Settings survive page refresh.
 * v0.17: wraps state in {schemaVersion, data} envelope.
 */
function saveSettingsToStorage() {
  try {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: SETTINGS_SCHEMA_VERSION, data: state })
    );
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

/**
 * Fill in any missing fields on a settings payload from the default preset.
 * This is the migration target — any legacy or current-version blob with
 * missing fields gets its gaps filled instead of being thrown away.
 */
function fillSettingsDefaults(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const defaults = getDefaultPreset();
  return {
    presetId: saved.presetId ?? defaults.id,
    recipeId: saved.recipeId ?? null,
    mode: saved.mode ?? defaults.mode,
    width: typeof saved.width === 'number' ? saved.width : defaults.width,
    height: saved.height !== undefined ? saved.height : defaults.height,
    format: saved.format ?? defaults.format,
    quality: typeof saved.quality === 'number' ? saved.quality : defaults.quality,
    stripMetadata: saved.stripMetadata ?? defaults.stripMetadata,
    neverUpscale: saved.neverUpscale ?? true,
    pattern: saved.pattern || defaults.pattern || '{name}-web',
    // Phase 9 fields (optional)
    targetSizeEnabled: saved.targetSizeEnabled ?? false,
    targetSizeKB: saved.targetSizeKB ?? 0,
    responsiveEnabled: saved.responsiveEnabled ?? false,
    responsivePreset: saved.responsivePreset ?? 'default',
    responsiveCustomSizes: saved.responsiveCustomSizes ?? '',
  };
}

/**
 * Migrate a settings payload from `fromVersion` to the current schema.
 * v0 = legacy (no envelope). Today v0→v1 is additive: fill missing fields.
 * Future breaking migrations would add cases here.
 */
function migrateSettings(data, fromVersion) {
  // Currently additive only — fill-forward is safe for all known historical shapes.
  void fromVersion;
  return fillSettingsDefaults(data);
}

/**
 * Load saved settings from localStorage.
 * Returns null if nothing is saved, parse fails, or blob is from a future
 * schema version (which gets preserved in `${key}.backup`).
 * @returns {SettingsState|null}
 */
function loadSettingsFromStorage() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // Legacy blob (pre-envelope) — the whole parsed object IS the payload.
    if (parsed && typeof parsed === 'object' && parsed.schemaVersion === undefined) {
      return migrateSettings(parsed, 0);
    }
    if (!parsed || typeof parsed.schemaVersion !== 'number') return null;

    // Future version we don't understand — preserve, fall back to defaults.
    if (parsed.schemaVersion > SETTINGS_SCHEMA_VERSION) {
      try {
        localStorage.setItem(`${SETTINGS_STORAGE_KEY}.backup`, raw);
      } catch {
        /* best-effort */
      }
      console.warn(
        `PixelGnome: ${SETTINGS_STORAGE_KEY} has unsupported schemaVersion ${parsed.schemaVersion}; preserved blob in ${SETTINGS_STORAGE_KEY}.backup`
      );
      return null;
    }

    return migrateSettings(parsed.data, parsed.schemaVersion);
  } catch {
    // Corrupted data — ignore
  }
  return null;
}

/**
 * Clear persisted settings and revert to defaults.
 *
 * Phase 3a: offers Undo via a toast action button (5s window). A blocking
 * `confirm()` would break flow; a one-shot "Reset to defaults." toast is
 * too easy to miss when the user meant to click something else. The snapshot
 * is a shallow copy of `state` — that's fine because every field is a
 * primitive or replaced wholesale by `applyPresetToState`.
 *
 * On undo, the captured state is re-applied and `emitChange()` triggers
 * `saveSettingsToStorage` to persist it again. If the user ignores the
 * toast, it auto-dismisses after 5s and the reset stands.
 */
function handleResetSettings() {
  // Snapshot BEFORE mutating so Undo can restore verbatim.
  const snapshot = { ...state };

  localStorage.removeItem(SETTINGS_STORAGE_KEY);
  const defaultPreset = getDefaultPreset();
  applyPresetToState(defaultPreset);
  syncUIFromState();
  updateDeleteBtnVisibility();
  emitChange();

  showToast(t('toast.settingsReset'), 'info', 5000, {
    action: {
      label: t('toast.undo'),
      onClick: () => {
        state = { ...snapshot };
        syncUIFromState();
        updateDeleteBtnVisibility();
        emitChange();
        showToast(t('toast.settingsRestored'), 'success', 3000);
      },
    },
  });
}

function emitChange() {
  saveSettingsToStorage();
  if (onChange) onChange(getSettings());
}
