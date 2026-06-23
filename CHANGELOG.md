# PixelGnome — Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

## [v0.30.0] — 2026-06-23

### PDF first-class polish — UX review fixes (Tier H, H1–H6)

A focused round addressing the majors from a full UX/UI review (PDF focus): the PDF side now behaves consistently with the image side in editing, output, parity, mobile, and accessibility.

#### Fixed

- **Page edits now compose with the drill-in tools (H1).** Compress, Split, To-Images, Extract, and Remove previously ran on the _original_ PDF, so staged page changes were silently dropped — e.g. rotating a page then compressing produced an un-rotated file. They now run on the edited document (rotations / reorder / deletes baked in first), and Compress measures savings against the edited input so deleting pages isn't miscredited as compression.
- **Drill-in toolbars wrap on phones (H5).** `.pdf-select-toolbar` (select / clear / count + rotate / delete / extract / remove) and the edit bar no longer overflow at narrow widths — they wrap, with comfortable tap sizing and the flex spacers neutralized below 768px.

#### Added

- **Per-card Download + savings on PDF cards (H4).** PDF cards now have their own Download button (previously you had to open the editor) and show a before→after savings line after an in-place optimize, mirroring the image cards. (A per-card Copy was intentionally not added — browsers don't allow writing `application/pdf` to the clipboard.)
- **Recipes act on PDFs (H2).** The Step-2 recipes are no longer image-only: **Compress / optimize** and **Make email-safe** now optimize the PDFs in the workspace (the selected ones, or all when none are selected), and **Convert format** points you to a PDF's "To Images" tool. Images continue to work exactly as before.

#### Changed

- **Drill-in tools are now a single, tidy set (H3).** Compress / Split / To-Images behave as a mutually-exclusive accordion — opening one closes the others, and a tool's result + readout clears when it's collapsed or another is opened, so a finished "17% smaller" + Download no longer lingers detached from its control. A new **"Create a new file"** heading separates these (which produce a new file) from the page edits above (which change the document). EN + IT.

#### Accessibility

- **Focus trap on the editors (H6).** The PDF drill-in and the image crop modal now keep keyboard focus inside while open and restore it to the control that opened them on close (new `src/modules/shared/focus-trap.js`, shared by both).

## [v0.29.0] — 2026-06-22

### PDF page-range export + batch optimize (Tier D)

Two PDF workflow features that build on the unified workspace.

#### Added

- **Page-range in "To Images" (D2).** The drill-in's page grid now drives rasterizing: a new **All pages / Selected (N)** toggle in To Images lets you render just the pages you select in the grid (instead of always all of them). Output filenames keep the original page numbers. Selecting "Selected" needs a grid selection; clearing it falls back to All.
- **Batch optimize selected PDFs (D6).** With 2+ cards in the workspace, selecting one or more PDFs reveals an **Optimize PDFs** button in the bulk toolbar. It compresses each selected PDF in place (same structural optimization as the in-modal Compress — recompress images, strip bloat, keep text selectable), one at a time with progress, and reports the total space saved. PDFs that can't be made smaller are left untouched.

## [v0.28.1] — 2026-06-22

### PDF robustness + privacy copy (hardening)

A small hardening round from a pre-feature health check — no new features, just sturdier edges and clearer privacy wording now that PDFs are first-class.

#### Added

- **PDF tool watchdog.** Each PDF worker request now has a 60s no-response watchdog that re-arms on every progress update, so a long multi-page render is never cut off, but a worker that fails to start (or wedges) no longer leaves the editor spinning forever — it surfaces a clear "stopped responding, please try again" message and resets the engine.
- **Invalid-PDF guard on drop.** Files that only *claim* to be a PDF (wrong contents behind a `.pdf` name) are now rejected up front by checking the `%PDF-` signature, instead of becoming a broken card that only failed when clicked.
- **Empty-PDF message.** Opening a valid PDF with zero pages now shows "This PDF has no pages." instead of a blank editor.

#### Changed

- **Privacy copy now covers PDFs, not just images.** The privacy panel, cookie-consent banner, and analytics description were image-only; they now state that your images **and PDFs** are processed locally and never uploaded (EN + IT).

## [v0.28.0] — 2026-06-20

### PDF polish + transparency fix (Tier D)

A small polish round on the PDF pipelines, plus a transparency bug fix found during testing.

#### Added

- **JPEG quality slider in PDF → Images.** When you choose JPEG output, a quality slider appears (it was previously fixed at 85). PNG output is unaffected (it's lossless), so the slider only shows for JPEG. (D1)

#### Fixed

- **Transparent images no longer get a black background when converted to JPEG.** Converting an image with transparency (e.g. a transparent PNG) to JPEG — which has no alpha channel — previously filled the transparent areas with black. They now flatten to **white**, matching other image tools. This also fixes black backgrounds in **Images → PDF** (the PDF embeds the converted image). Alpha-capable outputs (PNG/WebP/AVIF) keep their transparency.
- **Hidden controls that could stay visible.** Added a `[hidden]` safety rule so attribute-hidden rows always hide — fixes the To-Images quality slider showing under PNG and the split "custom ranges" row.

## [v0.27.0] — 2026-06-20

### Mixed-selection export — work with images and PDFs together (Tier C, C4)

The multi-select workspace now spans **both** images and PDFs, and the bulk actions understand mixed selections. This completes the Tier C unified file-utility arc: drop anything, select across types, and export them together.

#### Added

- **PDF cards are selectable.** The per-card select toggle, Select all / Deselect all, click / Shift-range / Cmd-click, and the bulk toolbar now include PDF cards alongside images. The count reads naturally for mixed sets (e.g. "3 images, 1 PDF").
- **Selection-aware export actions** in the bulk toolbar:
  - **Download** — each selected file in place (images as their processed output, PDFs as-is).
  - **Combine to PDF** — append-merge the whole selection into one PDF in list order: images become pages, selected PDFs' pages are inserted in place. (Shown only where the PDF feature is available.)
  - **ZIP** — everything together in a single archive (images + PDFs).
- **Mixed delete** removes images (with the usual Undo) and PDFs in one action.

#### Changed

- Rotate / flip bulk buttons disable automatically when the selection contains a PDF (they apply to images only); delete and the export actions stay available.
- All-image selections are unchanged — they take the exact same paths as before.

#### Engineering

- New `combineMixedToPdf` / `mergePdfBlobs` helpers (reusing the existing MuPDF worker `pdf-merge` op and `imagesToPdfBlob`); `exportAsZip` gained an optional `extraFiles` parameter so PDFs ride the single ZIP path. Content-free analytics reuse the existing `export` / `pdf_merged` events.
- **Footer version is now injected from `package.json` at build time** (a small Vite plugin), replacing the hand-edited string that had silently drifted (the footer showed v0.24.0 through the v0.25.0 and v0.26.0 releases). It can no longer go stale.

## [v0.26.0] — 2026-06-20

### Recipes — a task-oriented entry to Step 2 (Tier C, C3)

Step 2 now leads with **"What do you want to do?"** — a row of one-tap recipes above the size presets, so the front door is the task, not the dimensions. This is the C3 slice of the unified file-utility direction; it's **image-first** (recipes drive the image pipeline now, and PDFs pick up the matching defaults when you act on them — the cross-type export work is C4).

#### Added

- **Recipes row in Step 2** with three intents, each applying sensible defaults and revealing the relevant controls:
  - **Compress / optimize** — keep the original dimensions, just shrink (applies the "Original size — convert & compress" preset).
  - **Make email-safe** — resize to a small, widely-compatible size (max long edge 1600 px, JPEG, quality 75, metadata stripped).
  - **Convert format** — change the format without resizing; opens Customize and focuses the format picker so you can choose the target.
- The chosen recipe stays highlighted and clears automatically when you pick a preset or change any setting by hand (the settings no longer match the intent). The familiar size presets and Customize panel remain unchanged beneath it.
- Content-free `recipe_selected` analytics event (records only which recipe was chosen) and Italian translations for all recipe strings.

#### Notes

- Next in this arc: **C4 mixed-selection export bar** (Download / Combine-to-PDF / ZIP across images and PDFs together), where recipes will also resolve for PDFs.

## [v0.25.0] — 2026-06-20

### Unified file utility — PDFs flow through the same intake → drill-in → edit experience as images

This release closes the seam between the image and PDF pipelines. Until now a dropped PDF jumped into a separate full-screen modal with its own tabs — a different layout and mental model that made the toolkit feel bolted on. PDFs now come in through the **same front door** as images, appear as cards in the **same workspace**, and open into a drill-in editor that mirrors the image editor. This is the first slice of the "local-first file utility for images **and** PDFs" direction: the center of gravity is the task, not the file type.

#### Unified intake (C1)

- **A dropped PDF is now a card in the shared workspace**, alongside images, instead of routing straight to a separate tab. The card shows a first-page thumbnail, a `PDF · {n}p` badge, and filename + page-count + size — a visual sibling of the image cards, with the same select / remove / clear behaviour. One drop zone, mixed file types welcome.
- The first-page thumbnail and page count are read headlessly via the same lazy MuPDF worker the editor uses (no UI, no modal state touched); the thumbnail object URL is tracked and revoked per-card on remove and globally on Clear All.

#### PDF drill-in editor (C2)

- **Click a PDF card to drill into a full editing surface** whose primary content is a **page-thumbnail grid** (rendered lazily on scroll). Pages support multi-select, **drag-to-reorder** (plus `Alt`+`←`/`→` keyboard reorder), **rotate ±90°**, **delete**, **extract**, and **remove** — the direct analogue of the image editor's per-item transforms.
- **Edits batch and stay non-destructive until you commit them.** A bottom edit bar shows a preflight summary (`7 of 8 pages · 2 rotated · original unchanged`) with **Apply** (bake the edits back onto the card), **Export** (download the edited PDF without changing the card), and **Reset**.
- **Compress, Split, and To-Images are now collapsible panels inside the drill-in** rather than separate top-level tabs — Compress (presets + advanced quality/recompress/strip-metadata/subset-fonts/garbage-collect), Split (every page or custom ranges → ZIP), and To-Images (PNG/JPEG at 96/150/300 DPI → ZIP, or send the pages into the image queue).

#### Consistency pass (C5)

- **The PDF drill-in is now a full-screen editing surface** that mirrors the image editor (`.crop-modal`) — app background, surface-colored header, content centered in a comfortable reading column — instead of a small card floating on a dark backdrop, so the two editors read as one app.
- **Aligned details with the image side:** the filename renders in the same monospace face, preset chips pick up the image editor's accent-tint hover treatment (was border-only), and the page grid grows to use the full-screen height.
- **Copy aligned:** the drill-in's primary action is now **Apply** (matching the image editor) and its dialog label is **Edit PDF** (mirroring **Edit Image**). EN and IT updated together.

#### Notes

- The standalone PDF modal/tablist is retired in favour of the card + drill-in flow. Recipes / task-oriented entry (C3) and the mixed-selection export bar (C4) are the next steps in this arc.

## [v0.24.0] — 2026-06-19

### PDF toolkit — compress, organize, merge, and convert PDFs, all client-side

The headline feature: PixelGnome now handles **PDFs** end to end, entirely in the browser via a lazily-loaded MuPDF (WebAssembly) engine. Nothing is uploaded — the same privacy promise as the image tools. The engine runs in a dedicated Web Worker off the main thread, and the whole PDF feature is excluded from the portable single-file build (the multi-MB wasm can't be inlined). This is also the first release to drop the `-rc` label — promoting the build from release-candidate to stable.

#### Landing & defaults

- **Tagline now reflects both toolsets** — "Private, in-browser image & PDF tools — nothing leaves your device" (was images-only); meta/OG/Twitter descriptions and titles updated to match.
- **"Optimize a PDF" quick-pick** added to the empty-state landing so the PDF toolkit is discoverable on first visit (shown only where the PDF feature is available).
- **Default preset is now "Original size — convert & compress"** (no resize) — the most common intent — instead of Full HD.
- **"Get in touch"** footer link now points to the 321Enterprise contact form (`/index.html#contact`).

#### Added

- **Compress / Optimize (P1).** Drop a PDF to shrink it via true structural optimization (Approach B): recompress embedded raster images, strip metadata, subset fonts, and garbage-collect — while **preserving the selectable text layer and vector content** (never rasterized). Presets (Email / Web / Max) plus an Advanced panel (quality slider + per-step toggles), a multi-page preview, and an honest before/after size readout.
- **Organize (P2).** From a page-thumbnail selection grid: **extract** selected pages to a new PDF, **remove** selected pages (keep the rest), or **split** into multiple files (every page, or custom ranges like `1-3, 5, 8-10`) delivered as a ZIP.
- **Merge (P2).** Combine multiple PDFs into one with a reorderable file list (move up/down, remove); dropping several PDFs at once opens Merge with them preloaded.
- **Images → PDF (P3).** Combine your processed images into a single PDF (one image per page, at each image's size) straight from the export bar.
- **PDF → images (P4).** Rasterize every page to PNG or JPEG at a chosen resolution (Screen 96 / Standard 150 / Print 300 DPI) — download as a ZIP, or send the pages into the editor queue for further resizing/converting, closing the round-trip between the PDF and image pipelines.
- Italian (it) translations for all PDF strings; content-free, consent-gated analytics events (`pdf_optimized`, `pdf_organized`, `pdf_merged`, `pdf_rasterized`) carrying only coarse, non-identifying values.

#### Engineering / hardening

- New module boundary `src/modules/pdf/`: a thin `pdf-engine.js` adapter (the only file that imports MuPDF) behind `pdf-worker.js`, driven by `pdf-ui.js`. Swapping the backend means rewriting one file.
- Build-contract smoke test (`scripts/check-pdf-build.mjs`, wired into `npm run verify`, the pre-push hook, and CI) asserts the production build emits the worker + a separate MuPDF code-split chunk + the wasm, and that the single-file build excludes all of it — guarding the two outage classes hit during P1 (an undetected worker chunk; top-level await in the worker entry graph).
- `NOTICE` file credits Artifex/MuPDF (AGPL); README documents the runtime dependency and the new features.

#### Fixed

- PDF **Merge** tab label showed the raw i18n key (`pdf.mode.merge`) because the string was never added; the label (and the new To-Images label) are now present in English and Italian.

## [v0.23.0-rc] — 2026-06-16

### Continuous deployment, build/CI fixes, caching, and an editor polish

A maintenance / infrastructure release candidate. The core image workflow is unchanged; there is one visible editor fix.

#### Deployment & CI

- **Continuous deployment.** pixelgnome.com now builds and deploys automatically from the GitHub repo on every push to `main` (GitHub Actions → `npm ci` → `npm run build` → publish `dist/`), replacing the previous manual `dist/` upload. A **Deployment** section in `README.md` documents the build.
- **CI build pipeline fixes.** The generated build workflow had no dependency-install step (`vite: not found`); added `npm ci` plus npm caching. `npm ci` then surfaced a pre-existing peer conflict — `@eslint/js@^10` against `eslint@9` — fixed by pinning `@eslint/js` to `^9` (resolves to 9.39.4) and regenerating the lockfile, so the install runs clean without `--legacy-peer-deps`.

#### Fixes

- **Editor toolbars wrap at tight widths.** The crop editor's Aspect Ratio / Quick Crop / Export Size toolbars previously scrolled horizontally on narrow windows; they now wrap onto extra rows instead, so no controls are hidden behind a scrollbar. No change on wide screens (`src/style.css`: `.aspect-toolbar` / `.aspect-toolbar-presets` now `flex-wrap: wrap`; the phone-only scroll-shadow affordance is removed as moot).
- **`build:single` version check repaired.** The single-file post-build validator (`scripts/cleanup-singlefile.mjs`) looked for the old `#versionBadge` id (renamed to `#footerVersion` back in v0.19), so `build:single` / `build:all` always exited 1; the check now targets `#footerVersion`.

#### Performance

- **Cache-control headers.** A new `public/.htaccess` sets `Cache-Control: no-cache, must-revalidate` on the HTML entry point — so new deploys reach returning visitors immediately, no hard refresh — while content-hashed JS/CSS get a one-year `immutable` cache; images get a day, `robots.txt`/`sitemap.xml` an hour. (Previously no explicit cache headers were sent.)

#### Housekeeping

- `.prettierignore` extended to skip the generated Deploy Now workflows, `deploy-*/`, and throwaway mockups; source files run through Prettier. Removed stale local build-artifact folders.

## [v0.22.0-rc] — 2026-06-16

### Convert & compress without resizing — a first-class "keep original size" path

- **New "Original size — convert & compress" preset.** The most common reason to reach for the tool — "change the format and/or shrink the file, but leave the dimensions alone" — had no direct path: every built-in preset resized, and keeping dimensions meant faking it with an oversized target box plus the *Never upscale* guard. There's now a dedicated preset, surfaced in its own **Original** group pinned to the **top** of the preset dropdown, plus a **Convert & compress** chip on the empty-state landing. It defaults to WebP output at quality 0.82 (the format is freely changeable). Its filename pattern is `{name}-min` so a same-format recompress doesn't collide with the source file.
- **Real no-resize mode in the engine.** `calculateDimensions()` (`src/modules/shared/dimensions.js`) gains an explicit `original` mode that returns the source dimensions untouched, rather than leaning on oversized targets + the upscale clamp. A matching **"Keep original size (no resize)"** radio is now the first option in the **Mode** group (`index.html`), so the no-resize choice is reachable manually as well as via the preset.
- **Format & Quality surfaced for this path.** Picking the Original preset auto-expands the **Customize** panel and hides the now-irrelevant Width/Height inputs (`settings.js` `updateDimensionsVisibility()`), so **Format**, **Quality**, and **Target file size** are the visible controls instead of being folded away — which is the whole point of the preset. Single source of truth: the existing controls are reused, not duplicated.
- **First-run default hardening.** `getDefaultPreset()` returned `BUILT_IN_PRESETS[0]`; adding the new preset to the top of the array would have silently changed the first-run default. It's now pinned explicitly to `full-hd`, so the array order is free to change without side effects. `rebuildPresetDropdown()` renders the new **Original** optgroup first via `GROUP_ORDER`.
- **i18n.** New `mode.original` / `mode.originalTip` and `empty.chipConvert` strings added to both `src/locales/en.js` and `src/locales/it.js`; the `Preset` typedef and dimensions doc unions now include `original`.

### Italian copy refinements (still draft, pending native review)

- **Naturalness pass over `src/locales/it.js`** from a QA punch list. Most flagged "feels untranslated" items were already fixed in v0.21.0-rc; the remaining changes are wording improvements: tagline → "Ridimensiona le immagini direttamente nel browser"; drop-zone hint → "clicca per selezionarle"; privacy note "memorizzato" → "salvato"; "Incolla codice SVG" → "Incolla SVG"; "Dimensioni esatte (ritaglio)" → "…con ritaglio"; "Non ingrandire mai" → "Non ingrandire"; target size → "Peso file desiderato"; "Esportazione multi-dimensione" → "Esporta in più dimensioni"; export helper "Pronto…" → "Disponibile dopo il passaggio 1"; Clear-all → "Rimuovi tutto"; preview stats Size → "Peso" and Saved → "Risparmio"; footer → "Creato da 321Enterprise. Hai bisogno di uno strumento web su misura? Contattaci."
- **Deferred:** the Output section heading was intentionally left as "Output" (translating it to "Esportazione" would collide with the Export step), and Italian comma-decimal number formatting (e.g. "1,39 MB") is a separate locale-aware formatting change in JS, not a dictionary swap.

## [v0.21.0-rc] — 2026-06-07

### Multi-language support — Italian (it), with a globe-icon language switcher

- **PixelGnome is now bilingual (English + Italian).** A new globe-icon dropdown in the header lets the visitor switch language; on first visit the language is auto-detected from `navigator.language` (an Italian browser starts in Italian, everything else in English). The choice is remembered in `localStorage` (`pixelgnome-lang`). A small inline `<head>` script sets `<html lang>` before first paint so there's no flash of the wrong language — and it lives outside the analytics markers so it survives the portable single-file build's strip step.
- **Framework-free i18n layer.** A ~50-line runtime (`src/modules/i18n.js`) provides `t(key, vars)` with `{placeholder}` interpolation, `{one/other}` pluralization, and English fallback for any missing key. Strings live in plain dictionaries (`src/locales/en.js` — source of truth — and `src/locales/it.js`), bundled at build time so the single-file build stays self-contained and offline. Adding another language is "drop in `locales/<code>.js` + two lines."
- **Static markup is translated via `data-i18n` / `data-i18n-attr` / `data-i18n-html` hooks** scanned on load (`index.html`), with the English text retained inline as the SEO default. Dynamic strings — toasts, screen-reader announcements, and JS-built templates — call `t()` directly.
- **Coverage.** The entire main screen and resize → export workflow (`main.js`, `settings.js`, `preview.js`), the crop / image editor (`crop-modal.js`, `crop-colors.js`), and the Help, Privacy, cookie-consent, and History surfaces are all translated. The **Changelog** entries are intentionally kept in English as a historical dev record (the tab label itself is translated).
- **SEO unchanged for now.** This release is a client-side language toggle only — discovery stays English-focused. Per-locale `/it/` URLs + `hreflang` remain a deferred, no-rework follow-up (the dictionaries already exist).
- **Italian copy is a careful draft pending a native-speaker review.**
- **Known limitation:** switching language mid-session re-translates the static chrome and re-rendered modals immediately, but preview cards already on screen keep their original-language labels until reprocessed. First-load detection (the common case) is fully correct.

## [v0.20.0-rc] — 2026-06-07

### Mobile & small-window responsiveness — phones, tablets, dynamic viewport

- **Phone sidebar no longer crushes the sizing controls.** When the layout stacks (`@media (max-width: 768px)`), the settings sidebar was capped at `max-height: 40vh` with `overflow: hidden`, which squeezed the inner `.settings-scroll` region (`flex: 1`) down to ~32px — leaving the **Choose a size** preset selector, Save Preset, and the Customize size/format/quality accordion (~228px of content) trapped in a tiny scroll sliver. The cap and inner scroller are now removed on phones (`max-height: none`, `overflow: visible`, and `.app-layout` / `.content-area` set to `overflow: visible`), so the page scrolls as one natural column and every control is reachable. Desktop keeps its pinned drop-zone / scrolling-middle / pinned-Export sidebar unchanged.
- **Removed the duplicated Download buttons on phones.** With the layout stacked, the sidebar **Step 3 · Export** cluster (Download / ZIP) sat right next to the Preview toolbar, which already carries Download / Download ZIP / Responsive ZIP plus selection. The sidebar `.wf-step-export` block is now hidden at `≤768px`, leaving a single, unambiguous export area.
- **Bigger touch targets.** Header, preset-row (delete/export/import presets), and per-card action icon buttons are bumped to a 44×44px minimum on phones, matching the size the crop modal already used for its own tools.
- **Discoverable crop toolbars.** The Aspect Ratio / Quick Crop / Export Size rows scroll horizontally (they hold far more presets than fit a phone width). They now show a soft scroll-shadow at whichever edge has more content (Lea Verou's local/scroll `background-attachment` trick) so the extra options are no longer hidden off-screen on touch.
- **Tablet two-column band no longer clips card stats.** Between the stacked phone layout (`≤768px`) and a comfortably wide desktop, the two-column layout returned but the content column was narrow, and the preview card's fixed `320px` thumbnail (`flex-shrink: 0`) squeezed the stats column until the **Dimensions / Size / Saved** values clipped off the right edge. A new `@media (min-width: 769px) and (max-width: 900px)` makes the thumbnail fluid (`clamp(160px, 34%, 320px)`, `aspect-ratio: 4 / 3`) so the stats always have room. Desktop (`≥901px`) keeps the fixed 320px thumb; phones keep the stacked full-width thumb.
- **Dynamic viewport height.** Viewport-height values (`body` / `#app` `min-height`, the empty-state hero padding, and the Help modal `max-height`) now use `dvh` with a `vh` fallback, so mobile browsers showing/hiding their address bar don't cause layout jumps. `dvh` equals `vh` where there's no dynamic browser chrome, so desktop is unchanged.

### Customize panel — two-column "inline grid" layout

- **The Customize controls now reflow into two columns when there's room.** Previously the size/format/quality controls were a single tall stack in the 280px sidebar; opening them pushed the pinned Step 3 **Download** button toward the edge of view on larger monitors while the Preview area sat half-empty. The `.wf-customize-body` controls are now grouped into three `.wf-col` blocks (**Size & mode** · **Output** · **Processing**) in `index.html`. When the panel is open on desktop the sidebar grows to a new `--sidebar-width-open: 540px` and the body becomes a CSS grid: the tall **Output** group holds the right column across both rows, so the two short groups (**Size & mode**, then **Processing**) stack on the left — putting Processing high beside Output instead of dropping to a ragged second row. Most controls stay visible without scrolling, and Export stays pinned and in view. Narrow/stacked layouts (and the closed panel) keep the familiar single column, so nothing changes on mobile.
- **Adaptive width — only when it's earned.** The widen + two-column grid are gated on `@media (min-width: 960px)` **and** `.settings-panel:has(.drop-zone.has-images)`, so the sidebar only grows once there are images to process. The `:has()` approach needs no JS — it keys off the `has-images` class the app already toggles on the drop zone. The width change animates (`--transition-normal`) and is disabled under `prefers-reduced-motion`.
- **Output group — Format + Quality share a row.** Output is the densest group and set the panel's height. In the wide layout its **Format** select and **Quality** slider now pair up on one row (a `.output-pair` two-column sub-grid), with **Filename pattern** still full width beneath — trimming the Output column by ~50px (about one row) for more headroom on short/laptop screens. It stays stacked on narrow/single-column layouts. When Quality hides for lossless formats (PNG/GIF), Format reclaims the full width via `.output-pair:has(#qualityGroup[style*='display: none'])` so there's no empty gap.

### Landing state tuned for laptops & short screens

- **Empty-state drop target no longer balloons.** Because the sidebar can now widen, the drop zone's `4:3` aspect ratio could stretch it to ~375px tall on a wide sidebar. Gating the widen on `has-images` keeps the empty landing narrow, and a `max-height` cap (240px generally, 150px under `@media (max-height: 860px)`, scoped to `.settings-panel > .drop-zone:not(.has-images)`) prevents any future ballooning.
- **Canvas hero sits at the top, not mid-canvas.** `.content-empty` was a default-row flexbox that vertical-centered the "Drop images to resize" hero, leaving it floating low on tall/short screens. It's now a column with `justify-content: flex-start` and a responsive `padding-top`, so the drop target and preset chips land where the eye starts. The `max-height: 860px` block also trims hero padding and inner gaps for laptop heights.

### Header slimmed; tagline back inline

- **Shorter header, single-line brand.** `.app-header` vertical padding dropped from `--space-md` to `--space-sm` (~80px → ~55px). `.app-brand` is now a baseline-aligned row, so the tagline "Resize images without uploading them" sits to the **right** of the wordmark rather than stacked beneath it (reverting the subtitle lockup from v0.18/v0.19). It truncates with an ellipsis before crowding the header actions, and still hides under 680px.

### Customize disclosure starts collapsed every load

- **The Customize panel no longer reopens itself across reloads.** It now always loads collapsed for a clean first view (`settings.js`); selecting the **Custom** preset still auto-expands it, since the width/height fields live inside. This removes the remembered open/closed state added in v0.18 — the `pixeldrop-customize-open` localStorage key and its `loadCustomizeOpen()` / `saveCustomizeOpen()` helpers were deleted as the behavior is now fixed rather than persisted.

## [v0.19.0-rc] — 2026-06-04

### Guided workflow — step clarity + export emphasis
- **Current-step highlight** — the sidebar steps (1 Add · 2 Choose a size · 3 Export) now show a distinct **active** state (solid accent fill + soft ring on the number, accent-colored title) for the step the user is on, so "you are here" reads at a glance. Progression: empty → Step 1 active; images added → Step 1 done (✓), Step 2 active; a result is ready → Steps 1-2 done, Step 3 active. State is driven centrally by a new `refreshStepIndicators()` in `main.js`; Step 2's number/title gained ids (`step2Num`/`step2Title`) and Steps 1/3 titles gained ids for the active styling.
- **Green Export button** — the Step 3 **Download** button switched from blue `btn-primary` (which matched the Edit action) to a new green `.btn-success` so the finish action is visually distinct and more noticeable. Its disabled state is a quiet faded-green tint (new `--color-success-soft` token) rather than a 50%-opacity solid fill, so the jump to solid green when a result is ready acts as a clear "next step is ready" cue. Added `--color-success-hover` and `--color-success-soft` tokens across all three theme blocks.

### Removed drag-to-reorder; fixed stray bulk toolbar
- **Removed mouse drag-to-reorder.** Dragging a card initiated an HTML5 drag that the full-window file-drop overlay treated as an incoming file, lighting up the whole screen. Since reordering is a minor, rarely-used feature, the drag handle, the card's `draggable` attribute, and the `initDragReorder` wiring were removed (the `drag-reorder.js` module is no longer imported). Keyboard reorder is retained for accessibility: focus a card and press `Alt`+`↑` / `Alt`+`↓`.
- **Fixed: the bulk toolbar showed a "0 selected" panel.** `.bulk-toolbar` set `display: flex` with no `[hidden]` guard, so its `hidden` attribute (set whenever nothing is selected) was overridden and the blue-rimmed panel stayed on screen — visible on single-image workflows once the preview area showed. Added `.bulk-toolbar[hidden] { display: none }`, matching the earlier preview-area fix.

### Header & Help cleanup
- **Removed the version badge** next to the title — the changelog it linked to now lives in the Help modal.
- **Changelog is now a Help tab.** The Help modal gained a third tab (Quick Start · Tips · **Changelog**) built from a shared `getChangelogContent()` exported by `changelog-modal.js`; `openHelpModal(tab)` can deep-link to a tab. The footer version link now opens Help directly on the Changelog tab, and the standalone changelog modal (its open/close machinery) was deleted as dead code.
- **Tagline realigned** — "Resize images without uploading them" now sits as a subtitle directly under the title, indented to line up under the "PixelDrop" wordmark (`.app-brand` is a column lockup) instead of floating beside it.

### Single-image workflows — bulk pathway gated
- **Multi-select stays hidden until there are 2+ images.** The per-card select toggles only appear once the queue holds a batch (a `.multi-enabled` class on the list), and any selection is cleared if the queue falls back to a single image — so the bulk toolbar can't linger over a one-image workflow. The Select All / Deselect All header buttons already gated this way; this extends the same rule to the toggles and selection state.

### Multi-select — discoverable checkbox
- **Visible select toggle on each card.** Multi-select + the bulk-action toolbar (rotate, flip, download, ZIP, delete) already existed but were only reachable via Shift / Cmd-Ctrl-click, which was undiscoverable. Each card now has a circular select toggle (Photos-style — empty ring that fills with an accent checkmark when selected) in a dedicated left gutter above the drag handle, off the image so it never covers content. It's **always visible** and toggles selection on a plain click — no modifier needed; Shift-click still extends a range from the anchor. It's a `<button>` rather than a native checkbox, with a 24px hit target, which removed the finicky small-target / cancel-the-native-toggle behavior of the first attempt; the visual derives purely from the card's `.selected` class so there's no per-control state to keep in sync (`renderSelectionState()` just mirrors `aria-pressed`). Placing it in the gutter rather than inside the thumb also fixed clicks not registering — the thumb owns the click-to-open-editor handler. No change to the underlying selection model or bulk handlers.

### Revert to original — per-card
- **Edited cards can be reverted in one click.** Applying an edit (crop, rotate, flip — from the editor, the quick per-card buttons, or the bulk toolbar) previously baked into `item.edits` with no card-level undo; the only way back was re-opening the editor and resetting. Each card now shows a labeled **Revert** button (arrow icon + text, `.btn-revert` outline style that warms to amber on hover) in its edit toolbar that appears only when the image has edits (`hasEdits`), driven by a new `setCardEditedState()` in `preview.js` called at every reprocess result point. Clicking it clears all edits, reprocesses from the source, and shows a **"Reverted · Undo"** toast so the revert is itself reversible (restores the prior edits). The card also gets an `.edited` marker class for styling.

### Undo for image removal
- **Removing images is now undoable.** The per-card remove button, the keyboard Delete/Backspace path, and bulk delete all funnel through a new `removeImagesWithUndo()` that snapshots the queue order and removed item objects, then shows a 6-second **"Removed N · Undo"** toast (reusing the toast-action pattern from Reset Settings). `restoreRemovedImages()` re-inserts the items at their original queue positions, recreates only the restored cards (survivors are moved, not rebuilt), reprocesses the restored ids to regenerate thumbnails/results, and preserves any images added between the delete and the Undo. Previously deletes were unrecoverable (a bare info toast).

### Edit modal — crop framing carries over from the sidebar
- **Exact-mode framing now opens in the editor.** Selecting an exact (center-crop) preset draws a crop overlay on the preview thumbnail, but opening the editor previously started from a full-frame crop. The editor now receives the current sidebar sizing (`getProcessSettings()` passed into `openEditModal()`); when an exact preset is active and the user has no existing manual crop or rotation, it opens with that **aspect ratio locked** and the crop **centered/maximized** — mirroring the preview overlay — and highlights the matching ratio pill. Idempotent: applying an untouched carried-in crop yields the same output exact mode would have produced.

## [v0.18.0-rc] — 2026-06-04

### Presets — library overhaul + fit-vs-crop correctness
- **Expanded to 14 built-in presets**, grouped in the dropdown via `<optgroup>` into **Web** (Full HD, Large Web, Thumbnail), **Social** (Social Square, Social Portrait, Story/Reel, Social Landscape, Open Graph, YouTube Thumbnail, Pinterest Pin, Profile Avatar), and **Email** (Email Hero, Email Retina). Names lead with intent and end with dimensions (e.g. `Social Square — 1080 × 1080`).
- **Fit-vs-exact fix (the important one):** every Social preset now uses `mode: 'exact'` (center-crop) so the output actually matches the labelled dimensions. Previously these used `fit-within`, so a non-matching source produced e.g. 1080×810 from a "1080×1080" preset. Ceiling-style presets (Full HD, Large Web, Thumbnail, Email Hero/Retina) correctly stay `fit-within` / `max-long-edge`.
- **Avatar vs Thumbnail** both exist at 800×800 but differ by mode — Avatar crops (`exact`), Thumbnail fits (`fit-within`).
- **`neverUpscale` defaults on** for all built-ins so a small source isn't blown up into a soft full-size crop.
- **Aspect-ratio badges** (`1:1`, `9:16`, `1.90:1`, …) appended to exact-preset labels via a new pure `ratioLabel()` / `getPresetRatioBadge()` in `presets.js` — shown only where the ratio is guaranteed.
- **Last-preset restore hardened:** a persisted `presetId` that no longer resolves (deleted custom preset, renamed built-in) now falls back cleanly to "Custom" instead of pointing the dropdown at a phantom option.

### Crop preview
- **Exact-mode center-crop overlay** on each card thumbnail (`computeCropKeepRect()` / `updateCropOverlay()` in `preview.js`): a bright "keep" box with the trimmed area dimmed, so the crop is visible before export. Pure ratio math that accounts for the thumbnail's `object-fit: contain` letterboxing; hides itself for non-exact modes and when no crop is needed.

### Guided workflow — first-run clarity (3 phases)
- **Header tagline** — "Resize images without uploading them" beside the logo (hidden on very narrow screens).
- **Empty-state hero** — the formerly-blank canvas becomes a large drop target with the privacy line and three preset chips until the first image loads; toggles inversely with the preview area via `show/hidePreviewArea()`.
- **Stepped sidebar** — numbered **1 Add images · 2 Choose a size · 3 Export**; Step 1 shows a ✓ once the queue has images.
- **Customize disclosure** — mode, dimensions, format, quality, target size, filename pattern, multi-size, and processing fold into a native `<details>` under Step 2. It **remembers its open/closed state** (`pixeldrop-customize-open`) and **auto-opens when "Custom" is selected**.
- **Step 3 export** — mirrors Download / ZIP with a live **"N images · ~X MB out"** readout (sums processed output sizes; disabled until a result is ready) and a transient **"Exported ✓"** confirmation.

### Fixed
- **Toolbar export wired through the click event:** `exportBtn` / `exportZipBtn` passed the click `Event` into `handleExportAll`/`handleExportZip` as the `idsFilter` argument (a regression from the Phase 3b multi-select work). `Array.from(event)` is `[]`, so the legacy Download / Download ZIP buttons exported nothing. Now wrapped in arrows so they export the full queue. Per-card and bulk-selection exports were unaffected.
- **Empty preview panel could render on load:** `.preview-area` set `display: flex` with no `[hidden]` guard and there was no global one, so its `hidden` attribute was overridden by the cascade. Added `.preview-area[hidden] { display: none }`, which also guarantees the hero and preview are mutually exclusive.

### Docs

## [v0.17.1-rc] — 2026-05-20

### Build — Single-file output tidy-up
- **`singlefile-fixes` plugin extended**: The post-bundle hook in `vite.singlefile.config.js` now also strips the leftover `crossorigin` attribute from the inlined `<style>` tag. Vite carries `crossorigin` over from the original `<link rel="stylesheet" crossorigin>` even after the stylesheet is inlined; it's a no-op on inline `<style>` but noise in the output. Implemented with a targeted regex so any future attribute ordering still matches. The existing `<script type="module" crossorigin>` strip (needed for `file://` to work) is unchanged.
- **No runtime behavior change**: Purely a build-output cleanup. Single-file `dist-single/index.html` continues to open from any path with no external requests.
- Surfaced this entry in the in-app changelog modal (`src/modules/changelog-modal.js`) and bumped the version badge in `src/index.html` to `v0.17.1-rc`.

## [v0.17.0-rc]

### Phase 3 — UX Polish, Multi-Select & Drag-to-Reorder

Groups the audit-driven polish (3a), bulk-action plumbing (3b), and card reorder UX (3c) behind a single release candidate. One Phase 3 item — "Bulk apply preset/format to selection" — is deliberately deferred per the plan's "allowed to slip" clause; the `settingsOverride` plumbing it needs is a larger architectural change and not worth blocking the rest of the polish on.

#### 3a — UX polish
- **Determinate progress for long ops**: HEIC decode, animated GIF round-trip, and ZIP build now drive a per-card (HEIC/GIF) or global (ZIP) progress bar instead of a silent spinner. The 2-second threshold is respected so quick ops still skip the bar.
- **Drop-zone rejected state**: `.drop-zone.rejected` red-border + shake lands when every dropped file fails the accept filter, clears after ~1.2s. Paired with a descriptive toast listing rejected extensions.
- **Reset Settings confirm via toast**: Replaced the blocking `confirm()` with a toast that includes an **Undo** action. Undo restores the pre-reset settings snapshot from memory.
- **History drawer auto-expand — once per session**: `history.js` now writes a `historyAutoExpanded` sentinel to `sessionStorage` and only auto-opens the drawer on the first entry per tab/session. Manual toggle is unaffected.
- **localStorage-unavailable toast**: Single boot-time detection. If `localStorage.setItem` throws (private mode, Safari `file://`, storage quota, etc.) the user gets one heads-up toast explaining settings won't persist.
- **APNG / animated WebP magic-byte detection**: PNG files are scanned for the `acTL` chunk; WebP files for the `ANIM` chunk. A toast warns that animation will be lost — matches the existing animated-GIF UX since we still re-encode to a single frame for those.
- **Eyedropper `willReadFrequently: true`**: Significant Safari perf win for `getImageData` in the color-sampling hot path; no downside on other browsers.
- **Help modal — Pro Tips trimmed**: Down from 14 bullets to a focused 6 (drop targets, crop, undo/redo, editor shortcuts, target file size, multi-size). The rest moved into tooltips on the actual UI controls.
- **"Saved N / M, Errored K" summary toast after Download All**: Closes the loop when a batch partially fails — the user sees a single summary toast at the end of the batch rather than per-file errors.
- **Thumbnail swap after edits**: `preview.js` default `updateThumb` flips to `true` when `hasEdits()` is truthy, so users see the processed output (crop applied, rotated, etc.) in the card thumbnail instead of the pre-edit original.

#### 3b — Multi-select + bulk actions
- **Selection model**: Separate `Set<string>` of ids in `main.js` (not per-item flag) — survives `reprocessAll`, doesn't pollute `BatchItem` state, easy to serialize later.
- **Shift / Cmd / Ctrl-click semantics**: Finder/Explorer convention — Shift replaces with a range from the last anchor, Cmd/Ctrl toggles a single card, plain click is untouched (preserves the "click thumb to open editor" path). Wired via capture-phase click listener on the list root so modifier-clicks intercept before descendant button handlers.
- **Anchor preservation during Shift-range**: The anchor stays put across subsequent Shift-clicks so you can extend a range multiple times without losing the origin — matches Finder.
- **Selection visual state**: `.preview-card.selected` with accent border, accent-light tint, and 1px accent shadow. `aria-selected` mirrored for screen readers.
- **Bulk-action toolbar**: Appears above the preview list when `selectedIds.size >= 1`. Contains Rotate CCW / Rotate CW / Flip H / Flip V, then Download / ZIP, then Delete (danger style) and Deselect. `aria-live` count span announces selection size changes.
- **Bulk rotate / flip**: Selection-scoped `applyBulkEdit(transform, description)` snapshots the selected ids, applies the transform to each card's edits stack, re-processes only the affected subset via a new `idsFilter` parameter on `reprocessAll`, and announces completion.
- **Bulk delete**: Works from both the toolbar button and the Delete/Backspace key. Key handler in `keyboard-shortcuts.js` now prefers bulk-delete when a selection exists and falls back to the focused-card legacy path otherwise.
- **Bulk download (flat + ZIP)**: `handleExportAll` and `handleExportZip` accept an optional `idsFilter` Set and prune the selection in their cleanup `setTimeout`s when cards are removed as part of the export. Keeps the plumbing DRY — single code path, selection-aware.
- **Keyboard**: `Ctrl/Cmd + A` extended to selecting all cards when focus isn't in a text field. `Escape` clears an active selection before falling back to closing modals.

#### 3c — Drag-to-reorder + keyboard parity
- **HTML5 drag-and-drop**: Every preview card is now `draggable="true"` with a 6-dot grip handle in a 18px-wide column at the start of the card. `src/modules/drag-reorder.js` delegates `dragstart` / `dragover` / `drop` / `dragend` from the list root so newly-added cards participate automatically. Firefox `setData('text/plain', …)` workaround included.
- **Drop indicator**: Midpoint-split on the target card's `getBoundingClientRect` decides insert-before vs insert-after. A 3px accent-colored line is painted via `.drop-before::before` / `.drop-after::after` pseudo-elements — no layout jitter when the user hovers between positions.
- **Queue + DOM mutation in lock step**: `handleReorder` rebuilds `imageQueue` in the new order (Map preserves insertion order) and moves the card `DOM` node manually rather than re-rendering. Preserves per-card state — ongoing processing bars, blob URLs, edit toolbar wiring, selected class.
- **Keyboard reorder (a11y parity)**: Cards are `tabindex="0"` with a `:focus-visible` accent ring. `Alt+ArrowUp` / `Alt+ArrowDown` on a focused card calls `handleMoveCard(id, direction)`, which delegates to `handleReorder`. Edge hits announce "Already at top/bottom" instead of silently no-oping. After each move, `announce("Moved to position N of M")` reports the landing slot.
- **Explicit non-changes in v1**: Reordering does **not** renumber filenames or change ZIP iteration order — it's a display-order change only. `{preset}` / `{name}` / `{width}` / `{height}` filename tokens are unaffected because none of them are position-dependent. Revisit if/when an `{index}` token ships (tracked as a stretch goal).
- **Known limitations (acceptable for v1)**: No auto-scroll near viewport edges during drag — large queues need manual scroll mid-drag. Drop on the list background (not on any card) is a no-op; drop-at-end works by dropping on the bottom half of the last card. Keyboard-range-select (Shift+Space) is not yet wired.

#### Deferred from this phase
- **Bulk apply preset/format to selection**: Requires a `settingsOverride` field on `BatchItem`, worker-payload per-item overrides, `processImage` pipeline changes, `reprocessAll` override handling, and a preset-picker UI in the bulk toolbar. Scoped out and tracked for a follow-up release — the existing "change global settings + Download All" flow covers the common case.

- Updated version to v0.17.0-rc

### Phase 13 — Crop Modal UX & Email Presets (v0.16.0)
- **Pill toggle-off**: Clicking an active pill a second time deselects it and reverts to default state (Free crop for aspect/size, no export size for export). Applies to all three toolbar rows.
- **Cross-row deselection (Aspect ↔ Quick Crop)**: Selecting an Aspect Ratio pill clears Quick Crop pills and inputs (and vice versa). Export Size stays independent since it controls output dimensions, not crop shape.
- **Custom input overrides pills**: Typing into any custom W×H field immediately deselects the active preset pill in that row. Visual feedback is instant on `input` event, not delayed until Set/Crop button click.
- **Persistent W/H labels**: Replaced disappearing placeholder text ("W", "H") with always-visible inline `<span>` labels before each input field. Labels remain visible after values are entered.
- **Email-focused size presets**: Replaced generic ad-banner presets with Block Studio placeholder sizes used in real-world digital receipt workflows. Squares: 50², 80², 100², 150², 200² (icons & item images). Rectangles: 200×60 (Merchant Logo), 200×150 (Loyalty Store), 300×100 (Hero Split), 520×173 (Coupon), 520×260 (Coupon Tall), 600×200 (Hero), 1200×630 (OG/Link Preview).
- **Bug fix**: `handleReset()` now clears Quick Crop custom inputs (`#sizeCustomW`, `#sizeCustomH`) which were previously missed.
- Updated version to v0.16.0

### Phase 12 — Packaging & Distribution (v0.15.0)
- **Single-file build**: Added `vite-plugin-singlefile` for self-contained HTML output. All JS, CSS, and assets inlined into one portable `.html` file — host it, email it, or open locally.
- **Dual build scripts**: `npm run build` produces standard multi-file `dist/` (S3/CDN-ready). `npm run build:single` produces single-file `dist-single/index.html`. `npm run build:all` runs both.
- **Version sync**: `package.json` version updated to match changelog (was stuck at 0.1.0).
- Updated version to v0.15.0

### Phase 11 — Animated GIF Pipeline, Crop Presets & Export Size (v0.14.1)
- **Animated GIF decoding**: Full GIF89a binary decoder (`gif-decoder.js`) — parses header, logical screen descriptor, global/local color tables, graphic control extensions, and image data blocks. LZW decompression with variable-width codes (max 12 bits). Tolerant of non-standard GIFs: accepts missing initial clear code, skips invalid codes, bounds-safe bit reader, table size capped at 4096.
- **Animated GIF encoding**: Full GIF89a binary encoder (`gif-encoder.js`) — writes header, Netscape looping extension, per-frame graphic control extensions with delay, and LZW-compressed image data. Dynamic `ByteStream` output buffer. Comma-separated LZW dictionary keys to prevent string concatenation collision. Dictionary reset at 4096 entries. Per-frame Local Color Tables (256-entry RGB) for correct multi-palette animation.
- **Median-cut color quantization**: RGBA pixel data quantized to 256-color palette per frame for GIF encoding. Recursive median cut along axis of greatest color range.
- **Animated GIF round-trip**: Upload animated GIF → decode all frames → apply edits (resize, crop) per frame → re-encode as animated GIF with original frame delays preserved. Fallback to static first-frame path if decoder returns 0 frames.
- **Quick-crop size presets**: 12 exact-pixel size pills in the edit modal — squares (100×100 through 600×600) and common ad/banner sizes (300×250, 728×90, 160×600, 320×50). Green active state. Applies exact pixel crop from source and locks aspect ratio.
- **Export Size workflow**: New export size toolbar row in crop modal with preset pills (orange active state) and custom W×H inputs. Workflow: choose export size → crop area auto-locks to matching aspect ratio at maximum area → on Apply, global output settings update to exact dimensions. Green "Export: W×H" badge rendered on canvas overlay inside crop region. Info bar shows "Crop → Export" flow.
- **`applyExportSize()` bridge**: New export in `settings.js` sets global mode to "exact" with target dimensions. Crop modal communicates export intent back to main via the edits return object, keeping modules loosely coupled.
- Updated version to v0.14.1

### Phase 10 — Polish & Robustness (v0.14.0)
- **Undo/redo in edit modal**: Full history stack (up to 50 states) for all edit transforms — rotate, flip, crop, and reset. Navigate with Ctrl+Z / Ctrl+Y (or Cmd+Z / Cmd+Shift+Z on Mac). Undo/redo buttons added to the modal toolbar with disabled states. History initializes with the state at modal open and cleans up on close.
- **Full-window drop target**: Dragging files anywhere over the browser window now shows a dashed blue overlay with "Drop images anywhere" prompt. Files dropped anywhere on the page are accepted — no need to target the sidebar drop zone. Uses a `dragenter` counter to handle nested element events correctly.
- **Keyboard shortcuts**: Global shortcuts when no modal is open — `Ctrl+O` opens file picker, `Delete`/`Backspace` removes the focused preview card. Edit modal shortcuts — `R` rotates clockwise, `Shift+R` rotates counter-clockwise, `H` flips horizontal, `V` flips vertical. All shortcuts disabled inside text fields.
- **Accessibility audit fixes**: `prefers-reduced-motion` media query suppresses all animations and transitions. `:focus-visible` outline standardized across all interactive elements (buttons, inputs, selects, range sliders, radio/checkbox labels). Error states on preview cards already had ARIA labels, and thumbnails already had alt text.
- **Empty state design**: Centered illustration with tips shown in the content area when no images are loaded. Lists accepted formats, SVG paste hint, and Ctrl+O shortcut. Automatically hides when images are added and reappears when all images are cleared.
- **SVG rasterization fix**: SVGs without `xmlns="http://www.w3.org/2000/svg"` now have the namespace injected before data URI creation, fixing "Failed to rasterize SVG" errors for inline SVGs copied from HTML. `currentColor` values are resolved to `#000000` since standalone images have no CSS cascade.
- Updated version to v0.14.0

### Phase 9 — Smart Compression & Multi-Size Export (v0.13.0)
- **Smart Compression (Target File Size)**: New "Target file size" toggle in the Output section. Set a max KB target — PixelDrop iteratively adjusts quality via binary search (up to 8 iterations) to hit the target. Works with JPEG, WebP, and AVIF. Shows "minimum achievable" if the target is too small. Automatically hidden for PNG (lossless, no quality knob).
- **Responsive Export (Multi-Size Generator)**: New "Multi-size export" toggle generates multiple size variants from each image. 4 built-in breakpoint presets (Web Standard, Retina Web, Thumbnails, Social Media) plus custom comma-separated sizes. New "Responsive ZIP" button exports all images × all breakpoints as a single ZIP. Supports `{breakpoint}` token in filename patterns.
- **Lossless Pass-Through**: When no resize, no edits, and same format — the original file is returned as-is without re-encoding. Prevents unnecessary quality loss for images that are already at the target size and format.
- **Web Worker Offloading**: Standard image processing (JPEG, PNG, WebP, GIF) is delegated to a Web Worker using `OffscreenCanvas` and `createImageBitmap` for non-blocking batch processing. SVG and HEIC files fall back to main-thread processing (they need DOM APIs). Automatic feature detection with graceful fallback for unsupported browsers.
- Updated version to v0.13.0

### Phase 8.7 — Hardening & Persistence (v0.12.0)
- **Resource tracker**: New `resource-tracker.js` module tracks all `URL.createObjectURL()` calls and temporary canvases. Provides `trackUrl()`, `revokeUrl()`, and `releaseAll()` methods for centralized memory management.
- **URL revocation on remove/clear**: `handleRemove()` and `handleClearAll()` now revoke blob URLs from preview thumbnails before removing DOM elements. Page `beforeunload` also triggers `releaseAll()`. Prevents orphaned blob URLs from accumulating in memory during long sessions.
- **SVG sanitization hardening**: Replaced regex-based `sanitizeSvg()` with a DOM-based sanitizer using `DOMParser` + `XMLSerializer`. Removes dangerous elements (`<script>`, `<foreignObject>`, `<set>`, `<animate>`, `<animateTransform>`, `<animateMotion>`) and strips all `on*` event handler attributes and `javascript:` URI values. Falls back to regex for malformed SVGs that fail DOM parsing.
- **Settings persistence**: User settings (preset, mode, dimensions, format, quality, pattern, processing flags) are saved to `localStorage` on every change and automatically restored on page load. New "Reset to Defaults" button clears persisted settings and reverts to the Full HD preset.
- Updated version to v0.12.0

### Phase 8.5 — Color Tools: Eyedropper & Palette Extraction (v0.11.0)
- **Eyedropper tool**: New eyedropper button in the edit modal toolbar. Activates "pick mode" — cursor changes to crosshair and clicking any pixel on the image samples its color. Displays HEX, RGB, HSL, and approximate CMYK values in a floating color panel. Click any value row to copy to clipboard.
- **Magnifier loupe**: While in eyedropper mode, a circular magnifier (8× zoom, 100px diameter) follows the cursor for precise pixel targeting. Shows a crosshair at center. Automatically repositions above or below the cursor to avoid edge clipping.
- **Color history strip**: Up to 10 recently picked colors displayed as swatches in the color panel. Click any swatch to re-select it and view its values. Deduplicates by hex value. "Copy All" exports all picks as comma-separated hex values.
- **Auto palette extraction**: New palette icon in the toolbar. Runs the median cut algorithm on the image (or current crop region) to extract the 5 most dominant colors. Displays as vertical color bars with hex labels. Downsamples to ~100×100 for performance. "Copy All" exports the palette as hex values.
- **Color conversion utilities**: New `color-tools.js` module with RGB→HEX, RGB→HSL, RGB→CMYK (naive subtractive, no ICC) conversions, pixel sampling, and magnifier rendering.
- Updated version to v0.11.0

### Phase 8 — Format Expansion, SVG Code Input & Clipboard (v0.10.0)
- **SVG file input**: Accept .svg files via drag-and-drop and file picker. SVG files are sanitized (strip `<script>` tags and `on*` event handlers), parsed for intrinsic dimensions (width/height → viewBox → 1024px default), and rasterized via `new Image()` + `data:image/svg+xml` data URI into the canvas resize pipeline.
- **SVG code → PNG**: New "Paste SVG Code" toggle in the sidebar below the drop zone. Users paste raw SVG markup into a textarea, click "Convert to Image", and the markup is wrapped as a File object and fed through the standard processing pipeline. Validates for `<svg` tag presence and sanitizes before rasterization.
- **Copy to clipboard**: New copy button on each preview card (feature-detected via `navigator.clipboard.write`). Copies the processed image as PNG to the system clipboard. Non-PNG formats are converted to PNG before clipboard write. Button hidden in browsers without Clipboard API support.
- **AVIF output format**: Added to the output format selector. Feature-detected on startup via 1×1 canvas `toBlob('image/avif')` test. Disabled with "(not supported)" text if the browser can't encode AVIF.
- SVG type label shown on preview cards for .svg files
- SVG files skip the megapixel performance guard (no quick way to read dims without parsing)
- Updated version to v0.10.0

### Phase 7.9 — Aspect Ratio Crop Constraint (v0.9.0)
- **Aspect ratio toolbar**: new expandable toolbar between header and canvas in the edit modal. Toggled via "Ratio" button in the info bar. Contains preset pills, custom ratio inputs, and visual active state.
- **Preset crop pills**: 10 options — Free, 1:1, 4:3, 3:2, 16:9, 21:9, 5:4, 3:4, 2:3, 9:16. Selecting a preset immediately reshapes and centers the crop boundary to match the ratio, maximizing area within the image.
- **Persistent crop constraint**: once a ratio is selected, all crop handle drags enforce that ratio. The height is derived from width (or vice versa) during drag, preventing any drift from the locked ratio.
- **Custom ratio input**: W:H number fields + "Set" button for non-standard ratios (e.g. 7:5, 3:1). Deselects preset pills when applied.
- **Interaction with transforms**: rotating the image while a ratio is locked re-applies the constraint to the new orientation. Reset All clears the lock and returns to Free mode.
- **Shift-key coexistence**: shift-key ad-hoc lock still works in Free mode (locks to current crop proportions). When a preset is active, shift is redundant — the constraint is always enforced.
- **Replaced floating ratio calculator**: the old popover panel (solveRatio cross-multiplication tool) is replaced by this toolbar. The workflow is now visual and directly integrated with cropping.
- Updated version to v0.9.0

### Phase 7.8 — Ratio Calculator Presets & Polish (v0.8.3)
- **Aspect ratio preset dropdown**: select common ratios (1:1, 4:3, 3:2, 16:9, 21:9, 5:4, 3:4, 2:3, 9:16) from a dropdown in the ratio calculator panel. Selecting a preset auto-populates target W×H from the source dimensions, fitting within source bounds.
- **Responsive panel positioning**: ratio calculator panel now uses `position: fixed` centered horizontally in the viewport (`left: 50%; transform: translateX(-50%)`), positioned dynamically above the info bar. Stays fully visible on narrow windows via `max-width: calc(100vw - 32px)`.
- **Preset/manual priority**: preset dropdown clears when the user manually edits any input field. Manual values always take priority over preset selections.
- Updated version to v0.8.3

### Phase 7.7 — Editor Tools, Savings & Polish (v0.8.2)
- **Ratio calculator**: toggleable panel in the edit modal info bar — fill 3 of 4 values (Source W×H, Target W×H) and the missing value is solved via cross-multiplication. Source dims auto-populate from the transformed canvas.
- **Live crop size display**: dynamic readout in the info bar showing crop area in pixels and as a percentage of the image, updates as you drag.
- **Shift-key aspect ratio lock**: hold Shift while dragging crop handles to preserve the current aspect ratio.
- **Filename in edit modal header**: truncated filename displayed next to the "Edit Image" title for context.
- **File savings message**: preview cards now show a savings indicator after processing (e.g. "(-73%) Saved 412.5 KB") in green next to the output stats.
- **Pinned drop zone**: sidebar drop zone is fixed at top; settings scroll independently below via flex-shrink + overflow-y on `.settings-scroll`.
- **New PixelDrop logo**: raindrop + gear SVG icon, slightly larger icon (30×30) and wordmark (1.35rem).
- **JS-positioned tooltips**: replaced CSS `::after` pseudo-element tooltips with a shared `<div>` rendered on `<body>` via `tooltip.js` — eliminates overflow clipping from the sidebar. Tooltips added to all radio buttons and checkboxes.
- Updated version to v0.8.2

### Phase 7.5 — Sidebar Form Restructure & Grid Colors
- **Sidebar form hierarchy**: settings grouped into three labeled sections — Resize (Preset, Mode, Width/Height), Output (Format, Quality, Filename Pattern), Processing (Metadata, Upscale) — guiding the user top-down through the workflow
- **Section headings**: uppercase accent-colored dividers (Resize, Output, Processing) provide visual hierarchy
- **Expanded grid color palette**: 8 options — cyan (new default), yellow, magenta, red, green, blue, white, black — for visibility on any background
- **Simplified labels**: "Resize Mode" → "Mode", "Output Format" → "Format", "JPEG Quality" → "Quality" — redundant words removed since the section heading provides context
- Updated version to v0.8.1

### Phase 7 — Layout & Visual Overhaul
- **Sidebar drop zone**: relocated drag/drop area to sidebar top (compact 1:1 aspect ratio), above Settings
- **Clickable thumbnails**: clicking any preview thumbnail now opens the full edit modal
- **High-visibility Edit button**: new accent-colored "Edit" button with pencil icon in each preview card toolbar
- **Color-coded preview stats**: warm amber for dimensions, neutral gray for file sizes, green arrow for output — semantic color variables for light/dark themes
- **Edit modal header redesign**: source properties (dimensions, file type, aspect ratio) moved to title bar for instant visibility
- **Rule-of-thirds grid toggle**: checkbox in edit modal to enable/disable the composition grid
- **Grid accent color picker**: 4 selectable grid colors (white, red, green, blue) for visibility on any background
- **Larger icons and fonts**: increased sizes throughout preview cards, edit toolbar, and action buttons
- **Scrollbar cleanup**: eliminated horizontal scrollbars from sidebar and main content area via overflow-x: hidden
- **Layout restructure**: preview content and buttons moved to top of main content area
- Updated version to v0.8.0

### Phase 6 — Readability, Tooltips, Help & Image Properties
- **Larger preview thumbnails**: 2x size increase (160×120 → 320×240) for easier visual inspection
- **Larger text**: preview card filenames bumped to base size, stats to sm size for readability
- **Larger icons**: edit toolbar icons 14px → 20px, download/remove icons 16px → 20px with larger touch targets
- **File type badges**: each preview card now shows a colored badge (JPEG, PNG, HEIC, etc.)
- **Aspect ratio display**: original image aspect ratio shown in preview card stats
- **CSS-only tooltips**: hover tooltips on option checkboxes, export buttons, edit buttons, and header actions
- **Help button**: question-mark icon in header opens a tabbed modal with Quick Start guide, Tips, and Changelog
- **Changelog in-app**: full version history accessible from the help modal, most recent first
- **Edit modal source properties**: new info bar showing source dimensions, file type, and aspect ratio
- **Enhanced crop info**: crop dimensions now show the resulting aspect ratio when cropping
- **Reduced drop zone**: further height reduction (80px → 56px) when images are loaded
- Updated version to v0.7.0

### Phase 5+ — Editing Enhancements, Upscale Prevention, Filename Patterns
- **Full edit modal**: crop modal upgraded to unified edit overlay with rotate/flip/crop all in one place
- **Dynamic preview thumbnails**: preview card thumbnails now update in real-time after any edit (rotate, flip, crop)
- **Pipeline reorder**: edit order changed to rotate → flip → crop → resize (WYSIWYG: crop what you see)
- **Edit modal features**: rotate CW/CCW buttons, flip H/V buttons (with active state highlight), info bar showing rotation/flip/crop dimensions, Reset All button
- **Smart upscale prevention**: "Never upscale images" checkbox (on by default) — clamps output to source dimensions, preventing blurry upscaling
- **Filename patterns**: replaced static suffix with token-based patterns — supports {name}, {width}, {height}, {preset}, {format}
- Live filename preview below pattern input
- Legacy suffix presets auto-migrated to pattern format
- **Layout improvements**: smaller drop zone (160px default, 80px when images loaded), larger preview thumbnails (160×120)
- **Mobile refinements**: larger touch targets for edit buttons, crop modal tools bar full-width on narrow screens, responsive crop modal header
- Updated version to v0.6.0

### Phase 5 — Basic Editing (v2 Feature)
- Added per-image editing: rotate (CW/CCW), flip (horizontal/vertical), and crop
- New editor.js module: immutable edit state management with transform helpers
- New crop-modal.js module: full-screen interactive crop overlay with corner drag handles, rule-of-thirds grid, and touch support
- Edit toolbar appears below each preview card with 5 buttons (rotate left, rotate right, flip H, flip V, crop)
- Edits trigger single-item reprocessing — only the edited image re-runs through the pipeline
- Edit pipeline order: EXIF correction → rotate → flip → crop → resize → export
- Crop coordinates stored as fractions (0-1) relative to the rotated/flipped image
- Crop modal supports Escape to cancel, Reset to clear crop, and Apply to commit
- HEIC files can be cropped (decoded first for the crop UI, then processed normally)
- image-processor.js updated to accept optional edits parameter via intermediate EXIF-corrected canvas
- batch-manager.js passes per-item edits through to processImage
- preview.js accepts optional editCallbacks parameter for toolbar button wiring
- Updated version to v0.5.0

### Phase 4 — Polish + Team Readiness
- Added dark mode manual toggle (sun/moon icon in header, persists to localStorage)
- Theme system: data-theme attribute with system preference fallback — light, dark, or auto
- Added screen reader announcements via aria-live region (announcer.js module)
- Added ARIA labels to drop zone, preview cards, progress bar, toolbar, radio groups
- Converted resize mode radio group to fieldset/legend for proper accessibility
- Added focus-visible box-shadow styles on inputs, drop zone, buttons
- Added role="progressbar" with aria-valuenow on batch progress bar
- Added role="list"/"listitem" on preview list and cards
- Preview cards update aria-label with dimensions/size on completion and error messages on failure
- Added performance guard: warns on images > 30MP or batches > 50 files
- Added error boundaries (try/catch) around batch processing and re-processing
- Button :disabled state styling (reduced opacity, not-allowed cursor)
- Updated footer to v0.4.0

### Phase 3 — Batch Processing + ZIP Export
- Added batch-manager.js module for sequential image processing with requestAnimationFrame yields
- Added progress bar UI (track + fill + label) during batch processing
- Added "Download ZIP" button — exports all processed images as a single ZIP via JSZip
- ZIP uses STORE compression (images are already compressed)
- Filename collision handling in ZIP archives (appends counter: `photo-web.jpg`, `photo-web-2.jpg`)
- Added "Select All" / "Deselect All" buttons for batch controls
- Settings changes now trigger automatic re-processing of all active images
- Batch processing is cancellation-aware — won't interrupt a running batch
- Updated footer to v0.3.0

### Phase 2 — Presets, HEIC & History
- Added HEIC/HEIF input support via heic-to@1.4.2 (main-thread decode)
- Added heic-decoder.js module with automatic HEIC detection by extension and MIME type
- HEIC files now flow through the standard resize pipeline (decode → resize → export)
- Added "Decoding HEIC..." toast notification (decode can take 2-4 seconds)
- Extended HEIC timeout to 60 seconds (vs 30 for standard formats)
- Added custom preset saving to localStorage via "Save Preset" button
- Added preset deletion for user-saved presets
- Added preset export as JSON file (pixeldrop-presets.json)
- Added preset import from JSON file with validation and duplicate merge
- User presets appear in dropdown under "── Saved Presets ──" separator
- Added history drawer below preview area
- Exported cards show green checkmark "Saved" state, then auto-move to history
- History entries show: filename, dimensions, format, quality, file size reduction, relative timestamp
- History persists in localStorage (metadata only, no image blobs)
- History drawer is collapsible with toggle and clear button
- "Download All" now shows success toast with count and moves all cards to history

### Phase 1 — Core Pipeline
- Initial project scaffold: Vite + vanilla JS + CSS custom properties
- Drag-and-drop file input with file picker fallback
- Canvas-based image resize engine with three modes: fit-within, max-long-edge, exact (center crop)
- EXIF orientation correction (reads orientation tag from JPEG headers, rotates canvas)
- 7 built-in presets: Full HD, Large Web, Square Social, Portrait Social, Thumbnail, Email Hero, Email Retina
- Settings panel: resize mode, dimensions, output format, JPEG quality slider, metadata strip, filename suffix
- Preview cards with thumbnails, original stats, and post-processing file sizes
- Single image and "Download All" export with configurable filename suffix
- Toast notification system for errors, warnings, and status messages
- 30-second processing timeout with user-visible error
- Dark mode support (auto via prefers-color-scheme)
- Responsive layout (sidebar collapses on mobile)
- Keyboard-accessible file input (Tab + Enter on drop zone)

### Fixed
- Race condition: addPreviewCard must be awaited before processOne to ensure DOM exists when processing completes
- HEIC files no longer hang indefinitely — gated with warning in Phase 1, fully supported in Phase 2

### Planning
- Initial product spec authored
- Product spec review completed
- Build plan created with 4-phase roadmap
- Architecture reference documented
- Tech stack decisions finalized: Vanilla JS + Vite + Canvas API + heic-to + JSZip
