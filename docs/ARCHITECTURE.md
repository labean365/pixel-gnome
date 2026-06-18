# PixelDrop — Architecture Reference

**Last updated:** April 22, 2026

PixelDrop is a client-only image resizer, converter, and batch compressor. No backend, no uploads — everything happens in the browser. This document describes the current module layout, data flow, and conventions so a new contributor (or a future Alex) can find their way around quickly.

---

## Project Structure

```
pixel-drop/
├── docs/
│   ├── ARCHITECTURE.md        # This file — structure, patterns, conventions
│   └── releases/              # Release notes and tag messages
│
├── src/
│   ├── index.html             # Main HTML shell — drop zone, panels, modals
│   ├── main.js                # Entry point — wires modules, owns the queue
│   ├── style.css              # All styles — layout, components, dark mode
│   │
│   └── modules/
│       ├── drop-zone.js           # Drag-and-drop + file picker input
│       ├── batch-manager.js       # Queue, progress, concurrency gate
│       ├── image-processor.js     # Main-thread pipeline (EXIF, edits, resize, encode)
│       ├── process-worker.js      # Web Worker — fast path for common formats
│       ├── smart-compress.js      # Binary-search quality targeting (shared main/worker)
│       ├── heic-decoder.js        # HEIC → canvas via heic-to (main thread only)
│       ├── exif-reader.js         # EXIF orientation + metadata extraction/stripping
│       ├── gif-detect.js          # Sniff GIF animated vs static
│       ├── gif-decoder.js         # Animated GIF → frames + delays
│       ├── gif-encoder.js         # Frames → animated GIF writer
│       ├── editor.js              # Per-image edit state (crop/rotate/flip)
│       ├── crop-modal.js          # Edit modal shell — pointer, layout, wiring
│       ├── crop-engine.js         # Pure crop geometry + overlay rendering
│       ├── crop-colors.js         # Eyedropper + palette controller (stateful)
│       ├── crop-history.js        # Undo/redo ring buffer controller
│       ├── color-tools.js         # Color math (rgba→hex/hsl/cmyk, median cut)
│       ├── preview.js             # Preview cards, thumbnails, per-image stats
│       ├── presets.js             # Built-in + user presets, localStorage persistence
│       ├── settings.js            # Settings panel DOM + state
│       ├── exporter.js            # Single download, ZIP export, filename builder
│       ├── responsive-export.js   # Multi-size breakpoint export → ZIP
│       ├── history.js             # Processing history drawer (metadata only)
│       ├── help-modal.js          # Help + changelog tabs
│       ├── changelog-modal.js     # Standalone changelog modal (version badge)
│       ├── keyboard-shortcuts.js  # Global shortcuts (Ctrl+O, Delete, Esc)
│       ├── theme.js               # Light/dark toggle with system fallback
│       ├── toast.js               # Transient notifications
│       ├── tooltip.js             # Delegated [data-tooltip] tooltips
│       ├── announcer.js           # ARIA live-region screen reader hook
│       ├── resource-tracker.js    # Centralized blob-URL + canvas GC
│       ├── constants.js           # Perf thresholds (MAX_MEGAPIXELS, MAX_BATCH_SIZE)
│       └── shared/
│           └── dimensions.js      # Pure math — imported by main AND worker
│
├── public/
│   └── favicon.svg
│
├── sample-images/                 # Fixtures for manual QA
├── dist/                          # Production build (multi-file)
├── dist-single/                   # Self-contained single-file build
├── eslint.config.js               # Flat ESLint 9 config (with worker/node overrides)
├── vite.config.js                 # Default multi-file build
├── vite.singlefile.config.js      # vite-plugin-singlefile inline build
├── package.json
└── README.md
```

---

## Module Responsibilities

Each module has one job. Communication is explicit — callbacks, `postMessage`, and plain function calls. No framework, no observable store.

### Entry and orchestration

**main.js** is the controller. It initializes every module, owns the queue of `File` objects, and routes events between them. It is the only file that imports from all the others.

**drop-zone.js** handles `dragover` / `dragleave` / `drop` on the drop target and the hidden file `<input>` fallback. It validates MIME types, emits a callback with the accepted `File[]`, and manages hover highlight + invalid-file rejection feedback.

**batch-manager.js** orchestrates batch processing. It maintains a queue, dispatches files to the pipeline with a concurrency gate, updates the preview panel with progress, and handles per-image errors (skip and continue). Exposes "remove from batch" and "clear all" controls.

### Processing pipeline

**image-processor.js** is the main-thread pipeline. It wraps the full flow: format detection, HEIC decode (via heic-decoder), EXIF orientation correction, applying user edits (crop/rotate/flip), resizing via `<canvas>`, and encoding. Animated GIFs and SVGs flow through here because they need DOM APIs. It also decides whether to hand the file off to the worker for the fast path.

**process-worker.js** is the Web Worker fast path. Uses `OffscreenCanvas` + `createImageBitmap` for resize and encode of common raster formats. Does NOT handle SVG, HEIC, animated GIF, or EXIF — those need DOM APIs or multi-stage pipelines and fall back to the main thread. The worker reuses `smart-compress.js` and `shared/dimensions.js` so both runtimes share the same math.

**smart-compress.js** implements binary-search quality targeting for JPEG / WebP / AVIF. Feature-detects `canvas.convertToBlob` vs `canvas.toBlob` so the same module works on both `HTMLCanvasElement` (main thread) and `OffscreenCanvas` (worker).

**heic-decoder.js** wraps `heic-to`. Takes a HEIC `File`/`Blob`, returns a decoded canvas + metadata. Isolated so swapping libraries only touches this file.

**exif-reader.js** reads EXIF orientation (rotation + flip) for JPEG/HEIC, and exposes metadata extraction (camera, dimensions) and metadata-stripping helpers used on export.

**gif-detect.js / gif-decoder.js / gif-encoder.js** handle animated GIFs. `gif-detect` sniffs the binary for multi-frame signatures. `gif-decoder` unpacks frames + delays. `gif-encoder` writes frames back out preserving timing.

**shared/dimensions.js** — the only module imported by both main thread AND worker. Contains the pure helpers `calculateDimensions(srcW, srcH, settings)`, `getMimeType(format)`, and `isFormatMatch(blobType, format)`. No DOM, no canvas — just math and lookup tables. Duplicating these across main/worker was the single biggest source of drift before Phase 2; consolidating them into `shared/` makes this a genuine single source of truth.

### Editor

**editor.js** owns per-image edit state: `{ rotation, flipH, flipV, crop }`. Pure state — no DOM.

**crop-modal.js** is the edit-modal shell. Responsibilities: opening/closing, keyboard handling, pointer plumbing, canvas sizing, and wiring the three controllers below. It does not contain color logic, undo/redo logic, or crop geometry — those are delegated.

**crop-engine.js** is a pure utility module (no factory, no state). Exports `buildTransformedCanvas`, `computeLayout`, `getHandlePositions`, `getPointerAction`, `resolveDrag`, `applyLockedAspect`, `cursorForAction`, `drawOverlay`, plus constants (`HANDLE_SIZE`, `MIN_CROP_FRAC`, `GRID_COLORS`). Every function is deterministic on its inputs.

**crop-colors.js** is a factory controller: `createColorController({ modalEl, overlayCanvas, ... })`. Owns eyedropper mode, picked-color history, and extracted palette state. Handles loupe rendering and wires copy-format / copy-all / clear-history / clear-palette DOM.

**crop-history.js** is a factory controller: `createHistoryController({ modalEl, snapshot, restore })`. Owns a 50-deep undo/redo ring buffer. Caller supplies `snapshot()` / `restore(snap)` callbacks so the controller stays ignorant of snapshot shape. Wires `[data-action="undo"]` / `[data-action="redo"]` automatically.

**color-tools.js** is pure color math — `rgbaToColorInfo`, palette extraction (median cut), loupe sampling. Zero DOM state; the modal owns the UI, this module provides helpers.

### UI surfaces

**preview.js** renders the preview panel. For each image: thumbnail (small canvas), original stats, processed stats, processing/error visual states. Exports `formatBytes` (re-used by `history.js`).

**presets.js** defines built-in presets and handles localStorage for custom presets. Each preset is a plain object with `{ name, mode, width, height, format, quality, stripMetadata, suffix, ... }`.

**settings.js** manages the settings panel DOM (sliders, dropdowns, radios). Reads/writes the current settings object. When a preset is selected, populates the UI. When the user manually edits, flips to "Custom" mode.

**exporter.js** triggers downloads. Single-file via `<a download>` + `URL.createObjectURL`; batch via JSZip with filename collision handling. Also exports `buildOutputFilename` (shared with responsive-export).

**responsive-export.js** is the multi-size generator. Given a breakpoint set (e.g. `[320, 640, 1024, 1920]`), runs the pipeline once per breakpoint in `max-long-edge` mode and bundles all outputs into a ZIP.

**history.js** is the processing-history drawer. Stores metadata only (filenames, sizes, settings, timestamps — never image blobs) in localStorage with a schema-versioned key.

**help-modal.js / changelog-modal.js** are tabbed help + changelog surfaces. `help-modal.js` imports from `constants.js` so Pro Tips copy stays in lockstep with runtime thresholds.

### Cross-cutting utilities

**keyboard-shortcuts.js** — global shortcuts (Ctrl/Cmd+O, Delete/Backspace on focused card, Esc to close modal). Suppresses when a modal is open or focus is in a text field.

**theme.js** — manual light/dark toggle, localStorage-persisted, system-preference fallback for first load. Two-state toggle only (no silent "system" third state).

**toast.js** — bottom-right transient messages via an `aria-live="polite"` container.

**tooltip.js** — single reusable tooltip element on `<body>` for `[data-tooltip]` elements. Positioned above by default; flips below if there's no room; horizontally clamped to viewport.

**announcer.js** — screen-reader ARIA live region (`#srAnnouncer`, `aria-live="assertive"`). Uses a clear-then-set pattern so repeated announcements fire reliably.

**resource-tracker.js** — centralized GC for blob URLs and temporary canvases. All `URL.createObjectURL` calls should flow through it so `releaseAll()` on clear/remove fully frees resources. Prevents leaks on large batches.

**constants.js** — `MAX_MEGAPIXELS = 30`, `MAX_BATCH_SIZE = 50`. Imported by `main.js` (runtime warning thresholds) and `help-modal.js` (user-facing Pro Tips copy).

---

## Data Flow

```
User drops files
       │
       ▼
  drop-zone.js ──→ main.js receives File[]
                         │
                         ▼
                  batch-manager.js queues files (concurrency gate)
                         │
                         ▼
         ┌───────────────┴────────────────┐
         │ Fast path (raster,             │ Slow path (SVG, HEIC,
         │ no edits, common formats)      │  animated GIF, with edits)
         ▼                                ▼
 process-worker.js                 image-processor.js (main thread)
  (OffscreenCanvas)                  ├─ heic-decoder.js  (if HEIC)
  ├─ shared/dimensions.js            ├─ exif-reader.js   (orientation)
  └─ smart-compress.js               ├─ gif-decoder / -encoder  (if animated)
                                     ├─ editor.js state (crop/rotate/flip)
                                     ├─ shared/dimensions.js
                                     └─ smart-compress.js
         │                                │
         └───────────────┬────────────────┘
                         ▼
                  Blob returned to batch-manager
                         │
                    ┌────┴────┬──────────────┐
                    ▼         ▼              ▼
              preview.js  history.js    exporter.js /
           (show stats) (metadata log)  responsive-export.js
                                        (download / ZIP)
```

The worker message protocol is a simple request/response:

```js
// Main thread → Worker
worker.postMessage({ type: 'process', id, blob, settings, edits }, [blob]);

// Worker → Main thread (success)
self.postMessage({ type: 'result', id, blob, outputWidth, outputHeight, outputSize }, [blob]);

// Worker → Main thread (failure)
self.postMessage({ type: 'error', id, message });
```

`id` ties responses back to queue items in the batch manager.

---

## Key Patterns and Conventions

### No framework reactivity
UI updates are explicit DOM manipulation. When state changes, the responsible module calls a render function. Data changes → call function → DOM updates. No observables, no diffing.

### Pure modules vs. factory controllers
Two shapes show up deliberately:

- **Pure utility modules** (`crop-engine.js`, `color-tools.js`, `shared/dimensions.js`, `smart-compress.js`) export functions. Stateless, deterministic on inputs, easy to test and share across runtimes.
- **Factory controllers** (`crop-colors.js`, `crop-history.js`) export a `createXController({ ...deps })` function that returns a closure-scoped API. Used when a feature owns state AND DOM bindings. Creates a new instance per modal-open so there's no leaking module-scope state.

Module-scope `let` is avoided for per-instance state. If opening/closing a modal should reset state, the closure pattern makes that automatic.

### Shared code for main thread + worker
`shared/dimensions.js` is the only module imported by both `image-processor.js` (main) and `process-worker.js` (worker). `smart-compress.js` is runtime-neutral via `canvas.convertToBlob` feature detection. The ESLint flat config applies a `worker-globals` override to `*-worker.js` files so `self`, `OffscreenCanvas`, and `createImageBitmap` resolve in both scopes.

### Settings as a plain object
The current settings state is a single plain JS object passed by reference. Modules that need settings receive it at initialization. No pub/sub — just a shared object and explicit calls when it changes.

### Error handling philosophy
- **Input errors** (bad file type, corrupt image) — error state on the specific preview card, batch continues.
- **Processing errors** (canvas failure, HEIC decode failure) — same, card-level error, batch continues.
- **System errors** (Worker crash, OOM) — global error banner, offer retry or clear.

### Resource hygiene
`ImageBitmap` buffers can be 100+ MB on high-megapixel photos and leak fast at 50-file batches. The pipeline explicitly closes bitmaps after `drawImage` with a `try/finally` safety net. Blob URLs are routed through `resource-tracker.js` so `releaseAll()` can free the whole batch on clear.

### CSS conventions
CSS custom properties (variables) for colors, spacing, typography — dark mode is a single variable swap. No CSS framework. Mobile-first responsive: base styles for small screens, `min-width` media queries for larger.

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| heic-to | ^1.4.2 | HEIC → canvas/blob decode |
| jszip | ^3.10.1 | ZIP archive generation for batch + responsive exports |
| vite | ^8.0.0 | Dev server + production bundler (dev only) |
| vite-plugin-singlefile | ^2.3.0 | Inlines the build into a single HTML file (dev only) |
| eslint + @eslint/js + eslint-config-prettier | 9.x / 10.x | Linting (dev only) |
| prettier | ^3.8.3 | Formatting (dev only) |
| globals | ^17.5.0 | ESLint globals presets (dev only) |

Two runtime dependencies. Everything else is dev-time tooling.

---

## Build Outputs

Two build configs ship from one codebase:

- `npm run build` → `dist/` — normal multi-file build, produced by `vite.config.js`.
- `npm run build:single` → `dist-single/` — self-contained `index.html` with JS/CSS inlined, produced by `vite.singlefile.config.js` and cleaned up by `scripts/cleanup-singlefile.mjs` so only the final HTML is left. Intended for drop-in use on static servers without module support or for offline/local use.
- `npm run build:all` — runs both builds back to back.

---

## Getting Started (Dev Setup)

```bash
# Install
npm install

# Dev server with hot reload at http://localhost:5173
npm run dev

# Production builds
npm run build           # multi-file → dist/
npm run build:single    # single-file → dist-single/
npm run build:all       # both

# Quality gates
npm run lint            # ESLint (flat config)
npm run format          # Prettier write
npm run format:check    # Prettier check (CI-friendly)
```

Requires Node `>=20.19`.

---

## Hosting Options

The `dist/` folder from `vite build` is static — serve it from anywhere:

- Internal static file server (Nginx/Apache doc root)
- S3 + CloudFront
- GitHub Pages
- Netlify / Vercel

Or hand someone the `dist-single/index.html` and they can open it locally with no server at all.

No backend. No API keys. No auth. Just static files.
