# S.CHAK STUDIO: Image-to-LUT Generator

A browser-based, color-managed **image-to-LUT** tool that extracts a look from a reference image and generates industry-standard LUTs (`.cube`, 1D, `.3dl`, **CLF**, HALD CLUT) — with real scopes, white balance and a GPU trilinear renderer.

Everything runs client-side. No backend, no API key.

## Overview

1. Upload a **reference image** to extract color statistics in LAB space (mean/std, covariance, per-channel CDFs, tonal-region stats).
2. Choose a **transfer engine** to map a neutral identity into the reference look.
3. Refine with tone/color controls and a full **color management** section.
4. Judge the result with **scopes** (waveform, parade, histogram, vectorscope) and a **pixel readout**.
5. Export a LUT or a graded still. Drop a **video** to preview the look live and grab frames.

## Features

### Grading foundation
- **True trilinear interpolation** everywhere (preview + export), removing the banding of nearest-neighbour lookup.
- **GPU (WebGL2) renderer** using a filterable `RGBA16F` 3D texture; automatic **CPU trilinear fallback**.
- **GPU Acceleration setting** (default **ON**) with persistence, status indicator and GPU device info — see below.
- Selectable LUT lattice size: **17³ / 33³ / 65³**.
- **Undo / redo** with slider coalescing and `Ctrl/Cmd+Z` / `Shift+Z` / `Y` shortcuts.

### GPU acceleration
- One grading pipeline, two interchangeable backends — both consume the same generated LUT, so the maths is never duplicated.
- **Settings → GPU Acceleration** toggles between the WebGL2 renderer and the CPU renderer. The choice persists in `localStorage` and applies without a page reload.
- **Automatic fallback** when WebGL2 is unavailable, initialisation fails, or the GPU context is lost — the viewer re-mounts onto the CPU renderer, shows a non-intrusive notice, and never goes blank.
- Switching backends preserves the loaded image, grading values, LUT configuration, zoom / pan and compare mode. A backend switch always re-mounts the canvas, because a canvas that has handed out one context type can never hand out the other.
- **The image is uploaded to the GPU once.** Grading changes only update the LUT texture, so a 4K still is never re-transferred per slider movement.
- Settings panel reports the effective status, the adapter string, and the maximum supported texture dimensions.

### Color management
- Input **log decode**: ACEScct, ARRI LogC3, Sony S-Log3, Panasonic V-Log, RED Log3G10.
- **Working / output** transfer spaces: sRGB, Rec.709 (2.4), Gamma 2.4, Linear.
- **Gamut** conversion: sRGB/Rec.709, Display P3 (D65), Rec.2020.
- **White balance** via Bradford chromatic adaptation — temperature in Kelvin + tint, exact identity at 6504 K.
- Optional **filmic tone map** (ACES approximation).

### Transfer engines
- **Reinhard** — per-channel mean/std (classic).
- **Monge-Kantorovich** — linear covariance transfer (rotation-aware).
- **Histogram Matching** — per-channel CDF matching.
- **3-Way (Tonal)** — separate shadow / mid / highlight mapping.

### Scopes
- **Waveform**, **RGB Parade**, **Histogram**, **Vectorscope** (with skin-tone line).
- Sources: **Graded / Target / Reference**.

### Compare & inspect
- Compare modes: **Wipe**, **A/B (hold)**, **Side by side**.
- **Pixel readout** (RGB + L* a* b* under the cursor) with **Shift+Click swatches**.

### Video
- Drop a video into **Target** for a **realtime LUT preview** over playback.
- **Filmstrip** seek thumbnails + **frame grab** into the still pipeline.

### Export
- `.cube` (3D, chosen size), **1D `.cube`**, **`.3dl`**, **CLF** (Academy/ASC Common LUT Format), **HALD CLUT PNG** (level 8), and processed **PNG** stills.

## Tech stack

- React 19, TypeScript, Vite 6
- Tailwind CSS compiled locally via PostCSS (`tailwind.config.js`) — no runtime CDN
- Self-hosted Font Awesome + Inter / JetBrains Mono (`@fontsource`) — works fully offline
- Vitest (accuracy tests)

## Project structure

```text
.
|-- App.tsx
|-- index.tsx
|-- index.css
|-- types.ts
|-- hooks/
|   |-- useHistory.ts
|   |-- historyCore.ts
|   `-- useSettings.ts           # persisted app settings subscription
|-- services/
|   |-- lutGenerator.ts          # facade: generateLUT / getImageStats / applyLUTToImage
|   |-- analysis/stats.ts        # reference look analysis (mean/std, cov, CDF, regions)
|   |-- settings/store.ts        # localStorage-backed settings (GPU acceleration)
|   |-- gpu/capabilities.ts      # cached WebGL2 capability probe
|   |-- color/
|   |   |-- transfers.ts         # sRGB / Rec.709 / gamma
|   |   |-- conversions.ts       # RGB <-> XYZ <-> LAB <-> Oklab
|   |   |-- spaces.ts            # color spaces + camera log curves
|   |   |-- gamut.ts             # primaries + gamut conversion
|   |   |-- whitepoint.ts        # Bradford white balance
|   |   `-- linalg.ts            # 3x3 eigendecomposition for MK transfer
|   |-- grade/
|   |   |-- types.ts             # GradeNode / GradePipeline
|   |   |-- adjust.ts            # tone + color controls
|   |   |-- transfer.ts          # Reinhard / MK / Histogram / 3-Way
|   |   |-- evaluate.ts          # pipeline evaluation
|   |   |-- pipeline.ts          # buildPipeline
|   |   `-- colorConfig.ts       # color-managed evaluator
|   |-- lut/
|   |   |-- parse.ts             # .cube reader (1D/3D)
|   |   |-- sample.ts            # trilinear / 1D sampling
|   |   |-- serialize.ts         # .cube writer
|   |   |-- build.ts             # lattice builder
|   |   |-- load.ts              # cached LUT loading
|   |   `-- exporters.ts         # 1D / .3dl / CLF / HALD
|   |-- render/webgl.ts          # WebGL2 LUT renderer (+ context-loss handling)
|   `-- scopes/compute.ts        # scope data extraction
|-- components/
|   |-- Header.tsx
|   |-- Dropzone.tsx
|   |-- PreviewSection.tsx
|   |-- ScopesPanel.tsx
|   |-- VideoPanel.tsx
|   |-- AdjustmentsPanel.tsx
|   |-- ColorManagementPanel.tsx
|   |-- SettingsPanel.tsx        # GPU acceleration + device information
|   |-- TransferEngineSelector.tsx
|   |-- LutSizeSelector.tsx
|   |-- ExportMenu.tsx
|   |-- ControlPanel.tsx
|   `-- LoadingOverlay.tsx
`-- tests/
    |-- color.test.ts
    |-- colorManagement.test.ts
    |-- lut.test.ts
    |-- grade.test.ts
    |-- transfer.test.ts
    |-- scopes.test.ts
    |-- exporters.test.ts
    `-- history.test.ts
```

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build into dist/
npm run preview  # preview the production build
npm run test     # run the accuracy test suite (Vitest)
```

## How it works

1. The reference image is sampled (≤160 px) and converted to LAB.
2. Mean/std, the 3x3 LAB covariance, per-channel 256-bin CDFs and tonal-region stats are computed.
3. A `GradePipeline` is built: a **transfer** node (chosen engine) + an **adjust** node (sliders).
4. A color-managed evaluator wraps the pipeline: input log decode → white balance → gamut → working space → grade → output space (+ optional tone map).
5. The pipeline is evaluated across an N³ identity lattice to produce a `LUT3D`.
6. The LUT is uploaded to a WebGL2 3D texture for trilinear preview, or serialized for export.

## Testing

The `tests/` suite verifies the accuracy-critical math (not just that it runs):

- transfer round-trips and known values (sRGB, Rec.709, gamma, LAB, Oklab, XYZ)
- trilinear accuracy vs. nearest-neighbour; `.cube` serialize/parse round-trips
- gamut round-trips; white balance identity and direction
- Monge-Kantorovich reproduces a target mean **and covariance** within tolerance
- histogram matching monotonicity; 3-way tonal behaviour
- scope data extraction; exporter formats and HALD decode
- undo/redo commit, coalesce, limit and redo-stack semantics
- settings persistence: defaults, corrupt payloads, non-boolean rejection, subscriber
  notification, and graceful degradation when storage throws or `window` is absent
- GPU capability presentation (masked/oversized adapter strings)

## Remaining roadmap

- Grading directly in the shader (uniforms instead of a CPU LUT bake) — see the measurement below
- Look presets / library and share-via-URL
- Batch processing + contact sheet
- LUT import + node stacking / baking
- Live camera monitor, false color / zebra / focus peaking
- Fullscreen compare

## Rendering backends and measured performance

Both backends apply the *same* generated LUT; only the application stage differs (WebGL2 3D texture vs. a CPU trilinear sampler). Measured on an Intel UHD iGPU via CDP, median of 5 runs, for a full grading-parameter change:

| Preview resolution | GPU (WebGL2) | CPU | Speed-up |
|---|---|---|---|
| 1080p (1920×1080) | 86 ms | 181 ms | 2.1× |
| 4K (3840×2160) | 83 ms | 502 ms | 6.1× |

Two things are worth reading out of that table rather than assuming:

- GPU frame cost is **flat with resolution** (~83–86 ms) while CPU cost grows with pixel count, which is exactly what acceleration is for.
- The remaining ~83 ms is **not** rendering at all: it is the CPU-side LUT bake, which both backends pay. Raising the lattice from 33³ to 65³ pushes the same interaction to ~590 ms — a 7.2× increase that tracks the 7.6× increase in lattice samples. That is where the next win is, and it is why the roadmap item above is to evaluate the grade per-pixel from shader uniforms instead of baking it into a LUT first.

LUT export is unaffected by this setting: it is generated on the CPU and stays available with no WebGL context at all.

## Notes

- Remote image previews depend on the host sending CORS headers (scopes and pixel probing need an untainted canvas).
- Video export is frame-grab based; there is no full-video transcode in the browser.
- All styling, icon, and font assets are bundled at build time (`npm run build`). There are no runtime CDN
  dependencies, so the UI renders correctly offline and on locked-down networks.
- WebGL2 is used for the LUT preview (RGBA16F filterable 3D texture). If WebGL2 or the shader is unavailable,
  the app automatically falls back to a CPU trilinear path on a fresh canvas — as it does when the setting is
  switched off, when initialisation throws, or when the GPU context is lost at runtime.
- Scopes stay on the CPU deliberately. They analyse the full-resolution source, independent of preview zoom,
  and moving them to the GPU would add readback overhead for no correctness gain. That decision is recorded
  here so it is not mistaken for an omission.

## License

No license file is currently included. Add one (for example MIT) before public reuse expectations.
