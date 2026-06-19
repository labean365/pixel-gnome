# Pixel Gnome

A lightweight, drag-and-drop image resizing tool that runs entirely in the browser. Drop in high-resolution photos, configure presets, and export web-ready images — no installation, no upload, fully offline.

**Privacy by design:** every image is processed locally in your browser using the Canvas API and WebAssembly. Nothing is ever uploaded to a server — there is no backend. The source is open so you can verify that for yourself.

> Live at **[pixelgnome.com](https://pixelgnome.com/)**. Pixel Gnome is an open example of the kind of custom browser tools built by **[321Enterprise](https://321enterprise.com/)** — need something similar? [Get in touch](https://321enterprise.com/).

## Features

- Drag-and-drop batch image processing
- Guided 1–2–3 workflow — empty-state hero, numbered steps (Add → Choose a size → Export), and a "Customize" panel that folds away advanced controls until you need them
- 14 grouped presets (Web / Social / Email) with intent-first names and aspect-ratio badges; social presets center-crop to the exact labelled size
- Crop preview — exact-size presets show what gets trimmed on each thumbnail before you export
- Per-image editing: rotate, flip, crop
- Responsive export (multiple sizes from one source)
- Smart compression with quality controls
- Format conversion: JPEG, PNG, WebP
- HEIC/HEIF input support
- Animated GIF support (decode + encode)
- ZIP export of batches, with a live image-count / output-size readout
- Client-side PDF toolkit (lazy-loaded, nothing uploaded):
  - **Compress** — structural optimization that recompresses embedded images, strips metadata, subsets fonts, and garbage-collects while keeping the text layer selectable (presets + advanced quality/structure controls, before/after size readout)
  - **Organize** — extract selected pages to a new PDF, remove pages, or split into multiple files (downloaded as a ZIP), all from a page-thumbnail selection grid
  - **Merge** — combine multiple PDFs into one, with a reorderable file list
  - **Images → PDF** — combine your processed images into a single PDF (one image per page) straight from the export bar
  - **PDF → images** — rasterize every page to PNG/JPEG at a chosen resolution (Screen/Standard/Print), downloaded as a ZIP or sent into the editor queue for further resizing/converting
- Light/dark theme
- Single-file build option for portable offline use (PDF features excluded — the engine wasm can't be inlined)

## Tech stack

- **Build:** [Vite](https://vitejs.dev/) 8 with `vite-plugin-singlefile` for the portable HTML build
- **Runtime deps:** [`heic-to`](https://www.npmjs.com/package/heic-to) for HEIC decoding, [`jszip`](https://stuk.github.io/jszip/) for ZIP export, and [`mupdf`](https://www.npmjs.com/package/mupdf) (AGPL) for client-side PDF optimization (lazy-loaded on demand; see [NOTICE](./NOTICE))
- **Tooling:** ESLint 9, Prettier 3
- **Node:** `>=20.19` (see `.nvmrc`)

## Getting started

```bash
# Install dependencies
npm install

# Run the dev server
npm run dev

# Build for production (assets + index.html in dist/)
npm run build

# Build the portable single-file HTML (dist-single/)
npm run build:single

# Build both
npm run build:all

# Preview a built bundle locally
npm run preview
```

## Available scripts

| Script              | What it does                                                           |
| ------------------- | ---------------------------------------------------------------------- |
| `npm run dev`       | Starts the Vite dev server with HMR.                                   |
| `npm run build`     | Standard production build into `dist/`.                                |
| `npm run build:single` | Single-file HTML build into `dist-single/` (no external assets).    |
| `npm run build:all` | Runs both production builds.                                           |
| `npm run preview`   | Serves the latest build locally for verification.                      |
| `npm run lint`      | Runs ESLint over the project.                                          |
| `npm run lint:fix`  | Runs ESLint with `--fix`.                                              |
| `npm run format`    | Formats the codebase with Prettier.                                    |
| `npm run format:check` | Checks formatting without writing changes.                          |

## Deployment

Pixel Gnome is a fully static site — `npm run build` emits a self-contained
`dist/` folder with no backend or server-side component, so it can be served by
any static host or CDN.

- **Build:** `npm run build` writes the production bundle to `dist/`.
- **Single file:** `npm run build:single` produces a portable, dependency-free
  HTML file in `dist-single/` that runs straight from disk.
- **Serve:** publish the contents of `dist/` to any static host.
- **Production URL:** [pixelgnome.com](https://pixelgnome.com/)

## Project layout

```
pixel-gnome/
├── src/
│   ├── index.html           # App shell
│   ├── main.js              # Entry point — wires modules together
│   ├── style.css
│   ├── favicon.svg
│   └── modules/             # Feature modules (drop zone, editor, presets, etc.)
├── scripts/
│   └── cleanup-singlefile.mjs   # Post-processing for the single-file build
├── docs/                    # Architecture notes and release notes
├── assets/                  # Static assets used outside the bundle
├── vite.config.js           # Default Vite config
├── vite.singlefile.config.js  # Single-file build config
└── package.json
```

## Documentation

Project docs live in [`docs/`](./docs/):

- `ARCHITECTURE.md` — module layout and data flow
- `releases/` — release notes and tag messages

## Versioning

See [CHANGELOG.md](./CHANGELOG.md). Current version: **0.23.0-rc**.

## License

Copyright (C) 2026 321Enterprise.

Pixel Gnome is free software: you can redistribute it and/or modify it under the
terms of the **GNU Affero General Public License** as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See [LICENSE](./LICENSE) for the full text.

It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
PURPOSE. See the GNU AGPL for details.

Because Pixel Gnome is delivered to your browser as source, the AGPL's network
clause is satisfied directly: the corresponding source for the deployed version
is this repository, also linked from the **Source** link in the app footer. If
you run a modified version publicly, you must make your modified source
available under the same license.

The "Pixel Gnome" name and logo are trademarks of 321Enterprise and are not
covered by the AGPL grant.
