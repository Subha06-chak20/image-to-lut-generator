# Lutcraft — Color Grading & LUT Creation Studio

**Create your look. Craft your colour.**

A browser-based, color-managed **image-to-LUT** studio by **Subhadeep Chakraborty** that extracts a look from a reference image and generates industry-standard LUTs (`.cube`, 1D, `.3dl`, **CLF**, HALD CLUT) — with real scopes, DaVinci-style color wheels, curves, white balance, and an instantaneous GPU shader renderer.

Everything runs client-side. No backend, no API key, no telemetry.

---

## Brand & themes

- **Brand identity & logo**: The custom 3D translucent curved mark and logo lockup are defined in `services/brand.ts` and assetized in `public/mark.png`, `public/logo.png`, and `public/logo-dark.png`. Product identity, wordmark, favicon, page title, loading screen, export surface, About dialog and footer all come from this single source of truth.
- **Two studio themes**: **Light Studio** (default — warm ivory `#F5F4F0`, pure white `#FFFFFF`, soft grey `#E8E6E0`, charcoal `#252525`) and **Dark Studio**. The choice persists in `localStorage` under `lutcraft.settings.v1`.
- The **image viewer and scopes keep a dark, neutral surround in both themes** so colour judgement is never biased by the surrounding chrome.
- The theme is applied pre-paint by an inline script in `index.html`, so a Dark Studio reload never flashes a light background.

---

## Overview

1. Upload a **reference image** to extract color statistics in CIELAB space (mean/std, 3×3 covariance, per-channel CDFs, tonal-region stats).
2. Choose a **transfer engine** to map a neutral identity into the reference look.
3. Shape and refine with **primary color wheels**, **curves**, **sliders**, and a complete **color management** section.
4. Customize the **order of operations** to run any grading stage earlier or later in the pipeline.
5. Judge the result with **scopes** (waveform, RGB parade, histogram, vectorscope) and a live **pixel readout**.
6. Export a 3D/1D LUT or a graded still. Drop a **video** to preview the look live over playback and grab frames.

---

## Features

### Grading controls & instruments
- **Primary Color Wheels (`ColorWheelsPanel`)**:
  - Resolve-style **Lift, Gamma, Gain, and Offset** wheels with master luminance controls.
  - Luma-neutral chrominance adjustments (tint without altering exposure).
  - **ACEScct Log Wheels toggle**: Evaluates wheels in log space so Offset behaves like an exposure stop, ideal for log footage.
  - Shift-key precision mode (8× finer adjustments) and click-to-open precision dialog.
- **Curves Editor (`CurvesPanel`)**:
  - **Tonal curves**: Master, Red, Green, and Blue splines with editable control points.
  - **Hue & Saturation curves**: Hue vs. Hue, Hue vs. Saturation, and Luma vs. Saturation curves with continuous 0°/360° wrapping.
- **Tone & Color Sliders (`AdjustmentsPanel`)**:
  - Exposure, Intensity, Brightness, Contrast, Highlights, Shadows, Whites, Blacks, Vibrance, Saturation, Temperature, Tint, and Hue.
- **Reorderable Pipeline (`GradeOrderPanel`)**:
  - The pipeline dispatches operations in user-defined sequence. Drag-and-drop or step operations up/down to apply wheels before contrast, curves after saturation, etc.
- **Undo / Redo (`useHistory`)**:
  - Full history stack with slider coalescing and `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` / `Ctrl/Cmd+Y` keyboard shortcuts.

### GPU acceleration & rendering engine
- **Instantaneous parameter grading**:
  - Translates grading parameters into shader uniforms (`buildGradeParams`), evaluating the grade per-pixel directly in the WebGL2 fragment shader (`shaders.ts`).
  - Eliminates main-thread LUT baking stalls during slider movements for 60fps real-time responsiveness.
- **3D Texture LUT lookup**:
  - WebGL2 renderer uses a filterable `RGBA16F` 3D texture with true trilinear interpolation.
- **Automatic CPU fallback**:
  - Robust CPU trilinear fallback when WebGL2 is unsupported, context is lost, or toggled off in settings. Canvas re-mounts seamlessly without blanking.
- **Selectable LUT lattice sizes**:
  - Choose between **17³**, **33³**, or **65³** lattice resolutions.
- **System Diagnostics (`SettingsDialog`)**:
  - Reports GPU acceleration status, active backend, WebGL2 capabilities, unmasked adapter string, and maximum texture dimensions.

### Color management
- **Input log decode**: ACEScct, ARRI LogC3, Sony S-Log3, Panasonic V-Log, RED Log3G10.
- **Working / output transfer spaces**: sRGB, Rec.709 (2.4), Gamma 2.4, Linear.
- **Gamut conversions**: sRGB/Rec.709, Display P3 (D65), Rec.2020.
- **White balance**: Bradford chromatic adaptation — temperature in Kelvin (2000K–12000K) + tint, exact identity at 6504 K.
- **Tone mapping**: Optional ACES filmic curve approximation.

### Transfer engines
- **Reinhard** — per-channel mean/std in CIELAB (classic, fast).
- **Monge-Kantorovich** — linear optimal transport matching full 3×3 covariance (rotation-aware).
- **Histogram Matching** — per-channel 256-bin CDF matching via Gaussian error function.
- **3-Way (Tonal)** — independent shadow / mid / highlight statistical mapping.

### Scopes & inspection
- **Waveform**, **RGB Parade**, **Histogram**, and **Vectorscope** (with skin-tone indicator line).
- **Multi-source monitoring**: Switch scope source between **Graded**, **Target**, or **Reference** frames. Scopes inspect the native-resolution buffer.
- **Compare modes**: Interactive **Wipe** divider, **A/B toggle** (hold to view original), and **Side by side**.
- **Zoom & Pan**: True 1:1 pixel scaling, zoom presets (50%–400%), fit-to-view, mouse-wheel zooming, and pan drag.
- **Pixel readout**: Live 8-bit RGB and CIELAB readout under the cursor with `Shift+Click` persistent swatches.

### Video preview & frame grab
- Drop video files (`.mp4`, `.webm`) into the Target dropzone for real-time playback preview powered by WebGL.
- Filmstrip seek bar with 10 thumbnail previews.
- Single-click **Frame Grab** to send any video frame into the still grading workflow.

### Industry-standard export deliverables
- **3D LUT (`.cube`)**: Compatible with DaVinci Resolve, Premiere Pro, Final Cut Pro, Photoshop, OBS, etc.
- **1D LUT (`.cube`)**: Per-channel transfer curves.
- **Autodesk / Lustre (`.3dl`)**.
- **CLF (Common LUT Format)**: Academy / ASC XML specification.
- **HALD CLUT PNG**: Level-8 identity PNG (512×512) for image-based LUT application.
- **Graded Still (`.png`)**: Full-resolution processed image.

---

## Tech stack

- **Core**: React 19, TypeScript, Vite 6
- **Styling**: Tailwind CSS compiled locally via PostCSS (`tailwind.config.js`) — no runtime CDN
- **Typography & Icons**: Self-hosted Font Awesome + Inter / JetBrains Mono (`@fontsource`) — works fully offline
- **Testing**: Vitest (14 test suites, 147 unit tests)

---

## Project structure

```text
.
|-- App.tsx                      # Root component, layout, and state orchestrator
|-- index.tsx                    # React DOM entry point
|-- index.css                    # Base theme tokens, dark mode, utilities
|-- index.html                   # HTML template, pre-paint theme script, favicon
|-- types.ts                     # TypeScript definitions (Adjustments, Wheels, Curves, Stats)
|-- public/
|   |-- logo.png                 # Official brand logo (light theme)
|   |-- logo-dark.png            # Official brand logo (dark theme)
|   `-- mark.png                 # Standalone 3D brand mark / icon
|-- hooks/
|   |-- useHistory.ts            # Undo / redo history hook with event coalescing
|   |-- historyCore.ts           # Pure functional history stack primitives
|   |-- useSettings.ts           # Persisted settings subscription
|   `-- useTheme.ts              # Studio theme applicator (light / dark)
|-- services/
|   |-- brand.ts                 # Brand identity single source of truth
|   |-- lutGenerator.ts          # Facade: generateLUT / getImageStats / applyLUTToImage
|   |-- analysis/
|   |   `-- stats.ts             # Reference look analysis (mean/std, cov, CDF, regions)
|   |-- settings/
|   |   `-- store.ts             # LocalStorage settings store
|   |-- gpu/
|   |   |-- capabilities.ts      # WebGL2 capability probe & diagnostics
|   |   `-- gradeParams.ts       # Grade parameter extraction for shader uniforms
|   |-- color/
|   |   |-- conversions.ts       # RGB <-> XYZ <-> LAB <-> Oklab
|   |   |-- gamut.ts             # Primaries & gamut conversion matrices
|   |   |-- linalg.ts            # 3x3 eigendecomposition for Monge-Kantorovich
|   |   |-- spaces.ts            # Color space definitions & camera log curves
|   |   |-- transfers.ts         # sRGB / Rec.709 / Gamma transfer functions
|   |   `-- whitepoint.ts        # Bradford chromatic adaptation
|   |-- grade/
|   |   |-- adjust.ts            # Tone and color adjustment evaluators
|   |   |-- colorConfig.ts       # Color-managed evaluator
|   |   |-- curves.ts            # Spline and hue curve evaluation
|   |   |-- evaluate.ts          # Pipeline dispatch evaluation
|   |   |-- order.ts             # Grade operation ordering logic & defaults
|   |   |-- pipeline.ts          # buildPipeline builder
|   |   |-- tone.ts              # Highlights / shadows / whites / blacks mapping
|   |   |-- transfer.ts          # Reinhard / MK / Histogram / 3-Way engines
|   |   |-- types.ts             # GradeNode and GradePipeline types
|   |   `-- wheels.ts            # Lift, Gamma, Gain, Offset wheel math
|   |-- lut/
|   |   |-- build.ts             # 3D lattice builder (color-managed)
|   |   |-- exporters.ts         # 1D, .3dl, CLF, and HALD exporters
|   |   |-- load.ts              # Cached LUT parsing & loading
|   |   |-- parse.ts             # .cube file parser (1D and 3D)
|   |   |-- sample.ts            # High-precision CPU trilinear & 1D sampling
|   |   |-- serialize.ts         # .cube file serializer
|   |   `-- types.ts             # ParsedLUT and LUT3D interfaces
|   |-- render/
|   |   |-- shaders.ts           # WebGL2 vertex and fragment shaders (GLSL ES 3.0)
|   |   `-- webgl.ts             # WebGL2 LUTRenderer & context loss handler
|   `-- scopes/
|       `-- compute.ts           # Waveform, parade, histogram, and vectorscope extraction
|-- components/
|   |-- AboutDialog.tsx          # About modal with studio capabilities
|   |-- AdjustmentSlider.tsx     # Reusable fine-precision slider control
|   |-- AdjustmentsPanel.tsx     # Tone, presence, color balance sliders
|   |-- ColorManagementPanel.tsx # Input log, gamuts, working space, white balance
|   |-- ColorWheel.tsx           # Individual DaVinci-style color wheel & luma ring
|   |-- ColorWheelsPanel.tsx     # Lift, Gamma, Gain, Offset & ACEScct toggle
|   |-- CurvesPanel.tsx          # Master / RGB tonal curves & hue curves
|   |-- Dropzone.tsx             # Drag-and-drop media upload zone
|   |-- ErrorBoundary.tsx        # UI crash boundary with reset option
|   |-- ExportMenu.tsx           # Deliverable format export dropdown
|   |-- GradeOrderPanel.tsx      # Drag-and-drop operation order editor
|   |-- GradePanel.tsx           # Tabbed grading surface (Wheels / Curves / Sliders / Order)
|   |-- Header.tsx               # Studio topbar with project context, undo/redo, actions
|   |-- LoadingOverlay.tsx       # Processing overlay with brand identity
|   |-- LutSizeSelector.tsx      # Lattice resolution selector (17³ / 33³ / 65³)
|   |-- Modal.tsx                # Accessible backdrop dialog component
|   |-- PreviewSection.tsx       # Viewport with zoom/pan, wipes, A/B toggle, pixel inspector
|   |-- ScopesPanel.tsx          # Real-time scopes canvas display
|   |-- SettingsDialog.tsx       # Appearance, rendering backend, system diagnostics
|   |-- TransferEngineSelector.tsx # Transfer algorithm switcher
|   |-- VideoPanel.tsx           # Video playback preview, filmstrip, frame grab
|   `-- Wordmark.tsx             # BrandMark, LogoImage, and responsive lockup
`-- tests/
    |-- color.test.ts            # Color conversion round-trips & known values
    |-- colorManagement.test.ts  # Input log, gamuts, and white balance
    |-- exporters.test.ts        # 1D, .3dl, CLF, and HALD generation
    |-- gpu.test.ts              # Shader uniform mappings & enum encodings
    |-- grade.test.ts            # Grade pipeline evaluation
    |-- history.test.ts          # Undo/redo stack, coalescing, and limits
    |-- lut.test.ts              # Trilinear sampling & .cube round-trips
    |-- order.test.ts            # Operation reordering and normalization
    |-- primaries.test.ts        # Color wheel math and ACEScct log domain
    |-- scopes.test.ts           # Scope calculation algorithms
    |-- scopesRobust.test.ts     # Edge cases in image analysis
    |-- settings.test.ts         # LocalStorage persistence & defaults
    |-- slider.test.ts           # Tone and color adjustment ranges
    `-- transfer.test.ts         # Reinhard, MK, Histogram, and 3-Way accuracy
```

---

## Getting started

```bash
npm install
npm run dev      # Launch local dev server (http://localhost:3000)
npm run build    # Production build into dist/
npm run preview  # Preview production build locally
npm run test     # Run full Vitest test suite (147 tests)
```

---

## How it works

1. **Analysis**: The reference image is sampled (≤160 px) and converted to CIELAB space. Mean/std, 3×3 covariance, per-channel 256-bin CDFs, and tonal region statistics are extracted.
2. **Pipeline Construction**: A `GradePipeline` is built comprising a transfer node (chosen engine) and adjustment node (wheels, curves, sliders).
3. **Color Management**: Input log curves (LogC3, S-Log3, etc.) are decoded, Bradford chromatic adaptation applies white balance, gamut is transformed, and working space is set.
4. **Rendering**:
   - On the **GPU path**, parameters are uploaded as shader uniforms (`GradeParams`) for instantaneous per-pixel fragment evaluation.
   - On the **CPU path** (or for export), the pipeline is evaluated across an $N^3$ identity lattice to produce a `LUT3D`.
5. **Monitoring & Export**: Scopes read directly from the rendered canvas at native resolution. Deliverables are serialized on demand into `.cube`, `.3dl`, `CLF`, or `HALD PNG`.

---

## Testing

The Vitest test suite verifies accuracy-critical mathematics across 14 test files (147 tests):
- Transfer round-trips and known values (sRGB, Rec.709, Gamma, LAB, Oklab, XYZ).
- Gamut round-trips, Bradford white balance identity and temperature shift direction.
- Monge-Kantorovich linear transfer covariance matching within tolerance.
- Histogram matching monotonicity and 3-way tonal distribution.
- Primary wheels luma-neutral behavior and ACEScct log-domain mapping.
- Trilinear interpolation precision and `.cube` serialize/parse round-trips.
- Scope extraction, HALD CLUT encoding, and CLF XML structure.
- History stack commit, coalescing, limit, and redo-stack semantics.
- Settings persistence, corruption handling, and fallback behavior.

---

## Remaining roadmap

- Look presets library and share-via-URL
- Batch processing & contact sheet generation
- LUT import & node stacking / baking
- Live camera feed monitor with false color / zebra / focus peaking
- Fullscreen compare mode

---

## Notes

- Remote image previews require the host to provide CORS headers for untainted canvas access (needed by pixel probing and scopes).
- Video export is frame-grab based; browser-based video transcoding is not performed.
- All styling, icon, and font assets are bundled locally at build time without runtime CDN dependencies.
- Scopes deliberately run on the CPU analyzing full-resolution source frames, avoiding GPU readback overhead.

---

## License

No license file is currently included. Add one (e.g. MIT) before public reuse.
