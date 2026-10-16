# S.CHAK STUDIO: Image-to-LUT Generator

A browser-based color grading tool that extracts a look from a reference image and generates an industry-standard `.cube` 3D LUT.

## Overview

This project runs entirely on the client side:

- Upload a **reference image** to extract color statistics in LAB space.
- Generate a **32 x 32 x 32 LUT** using a Reinhard-style color transfer.
- Fine-tune tone and color controls in real time.
- Compare **before/after** with an interactive split-view preview.
- Export:
  - A `.cube` LUT file for editors like DaVinci Resolve, Premiere Pro, etc.
  - A processed PNG image from the preview source.

No backend service or API key is required.

## Features

- Reference look analysis via LAB mean/std extraction
- 3D LUT generation (`LUT_3D_SIZE 32`)
- Interactive comparison slider for original vs graded image
- Tone controls:
  - Exposure, Brightness, Contrast, Highlights, Shadows, Whites, Blacks
- Color controls:
  - Intensity (mix), Saturation, Vibrance, Temperature, Tint, Hue
- One-click export for LUT and processed image

## Tech Stack

- React 19
- TypeScript
- Vite 6
- Tailwind utility classes via CDN in `index.html`
- Font Awesome (CDN)

## Project Structure

```text
.
|-- App.tsx
|-- index.tsx
|-- types.ts
|-- components/
|   |-- Header.tsx
|   |-- Dropzone.tsx
|   |-- PreviewSection.tsx
|   |-- AdjustmentsPanel.tsx
|   |-- ControlPanel.tsx
|   `-- LoadingOverlay.tsx
`-- services/
    `-- lutGenerator.ts
```

## Getting Started

### Prerequisites

- Node.js 18+ (Node 20+ recommended)
- npm 9+

### Install

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

The app is configured to run on `http://localhost:3000`.

### Build Production Bundle

```bash
npm run build
```

Build output is generated in `dist/`.

### Preview Production Build

```bash
npm run preview
```

## How It Works

1. The reference image is downsampled to `100 x 100` for analysis.
2. Pixels are converted from RGB to LAB.
3. Mean and standard deviation are computed per LAB channel.
4. Each LUT cell starts from identity RGB, is transformed in LAB, then mapped back to RGB.
5. User adjustments are applied (tone + color mix controls).
6. LUT is serialized in `.cube` format and used for preview/export.

## Current Notes

- `index.html` references `/index.css`, but `index.css` is not present. Build succeeds, but Vite prints a warning.
- The preview and output use direct LUT lookup (nearest index), not trilinear interpolation.
- Remote image previews may be affected by CORS headers depending on source host.

## Scripts

- `npm run dev` - start local Vite dev server
- `npm run build` - production build
- `npm run preview` - preview production build locally

## License

No license file is currently included in this repository. Add a `LICENSE` file (for example MIT) before public reuse expectations.