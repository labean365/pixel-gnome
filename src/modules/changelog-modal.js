/**
 * changelog-modal.js
 * Changelog content generator. The changelog is now surfaced as a tab inside
 * the Help modal (see help-modal.js, which imports getChangelogContent) and via
 * the footer version link — there's no longer a standalone changelog modal or
 * header version badge.
 */

export function getChangelogContent() {
  return `
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.24.0-rc — PDF Toolkit</div>
      <div class="help-changelog-items">
        PixelGnome now works with <strong>PDFs</strong>, all in your browser — nothing is uploaded. Drop a PDF to <strong>compress</strong> it (recompresses images and strips bloat while keeping the text selectable), <strong>organize</strong> it (extract, remove, or split pages from a thumbnail grid), or <strong>merge</strong> several PDFs into one with a reorderable list. You can also turn <strong>images into a PDF</strong> (one page per image, from the export bar) and go the other way — turn <strong>a PDF into images</strong> (render each page to PNG or JPEG at Screen / Standard / Print resolution, downloaded as a ZIP or sent straight into the editor for resizing). (This changelog stays in English.)
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.23.0-rc — Editor &amp; Performance Polish</div>
      <div class="help-changelog-items">
        The image editor's toolbars (aspect ratio, quick crop, export size) now <strong>wrap neatly on narrow windows</strong> instead of scrolling sideways, so no options get hidden. Behind the scenes, pages load faster on repeat visits and site updates now reach you right away. (This changelog stays in English.)
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.22.0-rc — Convert &amp; Compress (No Resizing)</div>
      <div class="help-changelog-items">
        New <strong>Original size — convert &amp; compress</strong> preset, pinned to the top of the preset list with a matching <strong>Convert &amp; compress</strong> chip on the start screen — for when you just want to change an image's format or shrink its file size <em>without</em> changing its dimensions. Picking it brings the <strong>Format</strong> and <strong>Quality</strong> controls into view right away and hides the width / height fields. Prefer the manual route? There's now a <strong>Keep original size (no resize)</strong> option in the Mode list too. (This changelog stays in English.)
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.21.0-rc — Italiano: Multi-Language Support</div>
      <div class="help-changelog-items">
        PixelGnome now speaks Italian — use the new <strong>globe icon</strong> in the header to switch between English and Italiano, or it follows your browser's language on first visit. Your choice is remembered locally. The whole interface is translated: the resize &rarr; export workflow, preview cards, the crop / image editor, and the Help and Privacy panels. A lightweight, dependency-free i18n layer underneath makes adding more languages straightforward. (This changelog stays in English.)
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.20.0-rc — New Name: PixelGnome</div>
      <div class="help-changelog-items">
        Renamed — PixelDrop is now <strong>PixelGnome</strong>, with a new home at pixelgnome.com. Same private, in-browser tool; clearer, more ownable name (and a friendly gnome to go with it). Your saved presets, history, and settings carry over untouched.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.19.0-rc — Flow Polish, Undo &amp; Easier Editing</div>
      <div class="help-changelog-items">
        Clearer steps — the sidebar 1&ndash;2&ndash;3 now highlights the step you&rsquo;re on, and the Export button turns green once an image is ready to download (a quiet faded green until then).
        Crop carries into the editor — opening the editor while an exact-size preset is active starts with that crop framing and the aspect ratio locked, matching the overlay shown on the thumbnail.
        Undo a delete — removing images (one or several) now shows an &ldquo;Undo&rdquo; toast that puts them back where they were.
        Revert to original — edited cards show a Revert button that clears crop / rotate / flip and restores the source (itself undoable).
        Easier multi-select — each card has a round select toggle (visible when you have 2+ images); plain-click to select, Shift-click for a range. The bulk toolbar (rotate, flip, download, ZIP, delete) appears for the selection.
        Simpler &amp; tidier — drag-to-reorder removed (keyboard <kbd>Alt</kbd>+<kbd>&uarr;</kbd>/<kbd>&darr;</kbd> still reorders); the changelog now lives here in Help; the tagline sits under the title.
        Fix — a stray &ldquo;0 selected&rdquo; bar could show on single-image workflows. Resolved.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.18.0-rc — Presets &amp; Guided Workflow</div>
      <div class="help-changelog-items">
        Preset library — expanded to 14 built-ins grouped into Web / Social / Email, with intent-first names and aspect-ratio badges. Social presets (Square, Portrait, Story/Reel, Open Graph, YouTube, Pinterest, Avatar, Landscape) now use exact center-crop, so the output truly matches the labelled size instead of just fitting inside it.
        Crop preview — exact-mode presets draw a center-crop overlay on each card thumbnail, so you can see what gets trimmed before exporting.
        Guided 1&ndash;2&ndash;3 layout — an empty-state canvas teaches first-time visitors how to start; the sidebar now reads as numbered steps (Add &rarr; Choose a size &rarr; Export). Advanced controls fold behind a &ldquo;Customize&rdquo; panel that remembers whether you left it open and springs open when you pick the Custom preset.
        Export step — a Step 3 block mirrors Download / ZIP with a live &ldquo;N images &middot; ~X MB out&rdquo; readout and an &ldquo;Exported &check;&rdquo; confirmation.
        Fixes — the toolbar Download / Download ZIP buttons could export nothing after the multi-select change; an empty preview panel could briefly render on first load. Both fixed.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.17.1-rc — Single-File Build Tidy-Up</div>
      <div class="help-changelog-items">
        Build only — no runtime behavior change. The <code>singlefile-fixes</code> post-bundle hook now also strips the leftover <code>crossorigin</code> attribute from the inlined <code>&lt;style&gt;</code> tag (Vite carries it over from the original <code>&lt;link rel="stylesheet" crossorigin&gt;</code>; a no-op on inline styles but noise in the output). The existing <code>&lt;script type="module" crossorigin&gt;</code> strip — required for <code>file://</code> to work — is unchanged.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.17.0-rc — UX Polish, Multi-Select &amp; Drag-to-Reorder</div>
      <div class="help-changelog-items">
        Multi-select — Shift-click to select a range, Cmd/Ctrl-click to toggle individuals. Bulk toolbar appears above the preview list when one or more cards are selected.
        Bulk actions — rotate CW/CCW, flip H/V, delete, download (flat), and download as ZIP all operate on the current selection.
        Drag-to-reorder — grab the handle on any card to drop it at a new position in the queue. A 3px accent line previews the drop target.
        Keyboard reorder (a11y parity) — Tab to a card, then <kbd>Alt</kbd>+<kbd>&uarr;</kbd> / <kbd>Alt</kbd>+<kbd>&darr;</kbd> to move it up or down. Position changes are announced for screen readers.
        Polish pass — determinate progress bars for HEIC / animated GIF / ZIP operations over 2s; drop-zone rejected-file state + toast; Reset Settings confirm via toast with Undo; history drawer auto-expand now once per session; toast when localStorage is unavailable; APNG / animated WebP magic-byte detection with "animation will be lost" warning; eyedropper canvas uses <code>willReadFrequently</code>; Help &rarr; Pro Tips trimmed from 14 to 6 focused bullets; "Saved N/M, Errored K" summary toast after Download All; preview thumbnails swap to the processed output after edits.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.16.0 — Crop Modal UX & Email Presets</div>
      <div class="help-changelog-items">
        Pill toggle-off — clicking an active pill a second time deselects it and reverts to default (Free crop or no export size).
        Cross-row deselection — Aspect Ratio and Quick Crop pills are mutually exclusive. Selecting one row clears the other. Export Size remains independent.
        Custom input overrides — typing into any W&times;H field instantly deselects the active preset pill in that row.
        Persistent W/H labels — input labels remain visible after entering values (no longer disappearing placeholders).
        Email-focused presets — size presets updated to match Block Studio placeholder sizes: 50&sup2;, 80&sup2;, 100&sup2;, 150&sup2;, 200&sup2;, 200&times;60 (Logo), 200&times;150 (Loyalty), 300&times;100 (Hero Split), 520&times;173 (Coupon), 520&times;260 (Coupon Tall), 600&times;200 (Hero), 1200&times;630 (OG).
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.15.0 — Packaging & Distribution</div>
      <div class="help-changelog-items">
        Single-file build — all JS, CSS, and assets inlined into one portable HTML file via vite-plugin-singlefile. Host it, share it, or open locally from file://.
        Dual build scripts — <code>npm run build</code> for multi-file dist (hosting), <code>npm run build:single</code> for portable HTML, <code>npm run build:all</code> for both.
        Favicon — PixelDrop logo (blue droplet + gear) as SVG favicon, inlined as data URI in single-file build.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.14.1 — GIF Pipeline, Crop Presets & Export Size</div>
      <div class="help-changelog-items">
        Animated GIF round-trip — full GIF89a decode/encode pipeline with LZW compression and per-frame color tables. Upload an animated GIF, edit it, and export with frame delays preserved.
        Quick Crop presets — exact pixel size pills in the crop modal for common dimensions.
        Export Size workflow — set a target output size with preset pills or custom W&times;H. Crop area auto-locks to matching aspect ratio at maximum area.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.14.0 — Polish & Robustness</div>
      <div class="help-changelog-items">
        Undo/Redo — full edit history in the editor. Ctrl+Z/Y or toolbar buttons. Tracks rotate, flip, crop, and reset actions (up to 50 states).
        Full-window drop target — drag files anywhere on the browser window and a blue overlay appears. No need to aim for the sidebar drop zone.
        Keyboard shortcuts — Ctrl+O opens file picker. In the editor: R (rotate CW), Shift+R (CCW), H (flip horizontal), V (flip vertical). Delete/Backspace removes focused card.
        Accessibility — prefers-reduced-motion disables all animations. Focus-visible outlines on all interactive elements. Error states have ARIA labels.
        Empty state — subtle hint shown when no images are loaded.
        SVG fix — SVGs without xmlns namespace now render correctly. currentColor resolved to black for standalone rendering.
        AVIF input — .avif files now accepted via drag-and-drop and file picker.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.13.0 — Smart Compression & Multi-Size Export</div>
      <div class="help-changelog-items">
        Smart Compression — enable "Target file size" in Output settings, enter a max KB value, and PixelGnome will binary-search for the highest quality that fits. Works with JPEG, WebP, and AVIF.
        Multi-Size Export — enable "Multi-size export" to generate responsive image variants. Choose a breakpoint preset (Web Standard, Retina, Thumbnails, Social) or enter custom sizes. Use the "Responsive ZIP" button to download all variants.
        Lossless Pass-Through — images that don't need resizing or format conversion are passed through without re-encoding, preserving original quality.
        Web Worker — batch processing now runs off the main thread for a smoother UI during large batches.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.12.0 — Hardening & Persistence</div>
      <div class="help-changelog-items">
        Memory management — new resource tracker prevents blob URL and canvas memory leaks during long sessions. URLs are revoked on image remove, clear all, and page unload.
        SVG security — upgraded from regex-based sanitization to a DOM-based parser. Strips dangerous elements (script, foreignObject, animate, etc.) and all event handler attributes for stronger XSS protection.
        Settings persistence — your settings (preset, format, quality, dimensions, pattern, processing flags) now survive page refresh. Saved to localStorage automatically.
        Reset to Defaults — new button at the bottom of the settings panel clears saved settings and reverts to the Full HD preset.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.11.0 — Color Tools (Eyedropper & Palette Extraction)</div>
      <div class="help-changelog-items">
        Eyedropper tool — click the dropper icon in the edit modal toolbar, then click any pixel on the image to sample its color. Displays HEX, RGB, HSL, and approximate CMYK values.
        Magnifier loupe — while in eyedropper mode, a magnified circle (8&times; zoom) follows your cursor for precise pixel targeting.
        Color history strip — up to 10 recently picked colors are saved in the color panel. Click any swatch to re-select it.
        Auto palette extraction — click the palette icon to extract the 5 most dominant colors from the image (or current crop region) using the median cut algorithm.
        Copy values — click any color value row to copy it to clipboard. "Copy All" exports picked colors or palette as comma-separated hex values.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.10.0 — Format Expansion, SVG Paste & Clipboard</div>
      <div class="help-changelog-items">
        SVG file input — drop or browse .svg files, rasterized via canvas for the resize pipeline.
        SVG code paste — expand "Paste SVG Code" in the sidebar, paste raw markup, and convert to image. Sanitizes scripts and event handlers before rasterization.
        Copy to clipboard — new copy button on each preview card copies the processed image (as PNG) via the Clipboard API.
        AVIF output format — added to the format selector with automatic browser feature detection. Disabled with "(not supported)" if the browser can't encode AVIF.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.9.0 — Aspect Ratio Crop Constraint</div>
      <div class="help-changelog-items">
        Aspect ratio toolbar in the edit modal — click Ratio to reveal preset pills (Free, 1:1, 4:3, 3:2, 16:9, 21:9, 5:4, 3:4, 2:3, 9:16).
        Selecting a preset instantly constrains the crop boundary to that ratio and reshapes the crop region.
        Crop handles enforce the locked ratio during drag — no drift. Shift-key still works for ad-hoc lock.
        Custom ratio input (W:H) with Set button for non-standard ratios.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.8.0 — Layout & Visual Overhaul</div>
      <div class="help-changelog-items">
        Sidebar drop zone, clickable thumbnails, color-coded stats, grid toggle/colors.
        Editor tools: ratio calculator, live crop size, shift-lock, filename patterns.
        New logo, JS tooltips, pinned drop zone, savings messages.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.5.0 — Basic Editing</div>
      <div class="help-changelog-items">
        Per-image rotate (CW/CCW), flip (H/V), and interactive crop.
        Full-screen crop overlay with corner drag handles and rule-of-thirds grid.
      </div>
    </div>
    <div class="help-changelog-entry">
      <div class="help-changelog-version">v0.1.0 &ndash; v0.4.0 — Foundation</div>
      <div class="help-changelog-items">
        Core pipeline: drag-and-drop, canvas resize, EXIF correction, format export.
        Presets, HEIC support, history drawer, batch processing, ZIP export.
        Dark mode, accessibility, performance guards.
      </div>
    </div>
  `;
}
