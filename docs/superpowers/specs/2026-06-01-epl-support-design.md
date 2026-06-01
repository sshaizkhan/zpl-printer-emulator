# EPL (Easy Plug) Support Design

**Date:** 2026-06-01  
**Status:** Approved  
**Scope:** Core subset — text, barcodes, lines, rectangles, ellipses

---

## Overview

Add EPL (NOVEXX Solutions Easy Plug command language) support to the ZPL printer emulator. EPL uses `#`-prefixed commands and mm-based coordinates. No cloud rendering API exists for EPL, so rendering is done server-side with `node-canvas`. ZPL path is unchanged.

---

## Architecture

### New Files

- `web/server/epl-commands.js` — EPL parser + node-canvas renderer
- `web/client/src/components/LanguageToggle.jsx` — ZPL/EPL pill toggle UI

### Modified Files

- `web/server/index.js` — branch TCP data on `printer.language`; call `renderEplLabel()` for EPL printers
- `web/server/config.json` defaults — add `language: "zpl"` field
- `web/client/src/components/SettingsModal.jsx` — embed `LanguageToggle` per printer
- `Dockerfile` — add libcairo and friends for node-canvas native build

### Data Flow (EPL path)

```
TCP data received
  → printer.language === "epl"
  → epl-commands.js: parse(data) → label spec object
  → epl-commands.js: renderEplLabel(spec) → node-canvas → PNG buffer
  → labelHistories[printerId] pipeline (same as ZPL)
  → socket emit → PrinterTab renders image
```

ZPL path (Labelary API) is untouched.

---

## EPL Parser

### Job Structure

| Step | Command | Example |
|------|---------|---------|
| Activate interface | `#!A1` | `#!A1` |
| Set label size | `#IMS<w>/<h>` | `#IMS70.0/85.0` |
| Start label format | `#ERY` | `#ERY` |
| Label elements | see below | |
| Print quantity | `#Q<n>/` | `#Q1/` |

Commands are separated by `#G` (end-of-command marker) or newlines.

### Core Command Subset

| EPL Command | Description | Canvas Operation |
|-------------|-------------|-----------------|
| `#IMS<w>/<h>` | Label dimensions (mm) | Canvas size |
| `#J<y>` | Vertical cursor position (mm) | y position |
| `#T<x>` | Horizontal cursor position (mm) | x position |
| `#YT<rot>/<font>/<mag>///<text>#G` | Text field | `fillText()` |
| `#YN<rot>/<font>/<mag>///<text>#G` | Text field (alt form) | `fillText()` |
| `#YB<rot>/<type>/<mag>///<data>#G` | Barcode | bwip-js → image |
| `#YL<x2>/<y2>/<thickness>#G` | Line | `moveTo()`+`lineTo()` |
| `#YR<w>/<h>/<thickness>#G` | Rectangle | `strokeRect()` |
| `#YE<rx>/<ry>/<thickness>#G` | Circle/ellipse | `ctx.ellipse()` |
| `#M<mag>` | Global magnification factor | scale multiplier |
| `#Q<n>/` | Print quantity | render n times |

Unknown commands are logged as warnings and skipped — no crash.

### Parser Output

```js
{
  width: Number,   // mm
  height: Number,  // mm
  quantity: Number,
  elements: [
    { type: "text", x, y, rotation, font, mag, content },
    { type: "barcode", x, y, rotation, barcodeType, mag, data },
    { type: "line", x1, y1, x2, y2, thickness },
    { type: "rect", x, y, w, h, thickness },
    { type: "ellipse", x, y, rx, ry, thickness },
  ]
}
```

---

## Renderer

### Dependencies

```
yarn add canvas bwip-js
```

Dockerfile additions:
```dockerfile
RUN apt-get install -y \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

### Coordinate Conversion

EPL uses mm. Conversion to pixels:

```
px = mm * (dpi / 25.4)
```

Default DPI: 203 (standard thermal). The existing printer `density` setting is in dpmm — convert: `dpi = dpmm * 25.4`. Use `printer.density` when set, else default 8dpmm (203dpi).

### Rendering Steps

1. Create canvas at `width_px × height_px`
2. Fill white background
3. Iterate `spec.elements` in order:
   - **text**: `ctx.fillText()` with rotation transform applied
   - **barcode**: `bwip-js.toBuffer()` → `ctx.drawImage()` at position
   - **line**: `ctx.moveTo()` + `ctx.lineTo()` + `ctx.stroke()`
   - **rect**: `ctx.strokeRect()`
   - **ellipse**: `ctx.ellipse()` + `ctx.stroke()`
4. Return `canvas.toBuffer('image/png')`

For `quantity > 1`, render once and store the same PNG buffer `n` times (same as current ZPL behavior).

---

## Per-Printer Language Toggle

### Config

```js
// defaults object in index.js
language: "zpl"   // "zpl" | "epl"
```

### UI

- Pill/toggle button in `SettingsModal` labeled **ZPL / EPL**
- Same row as existing host/port fields
- Persisted via existing `saveConfig()` mechanism

### Routing in `index.js`

```js
if (printer.language === "epl") {
  // parse + renderEplLabel()
} else {
  // existing renderLabel() via Labelary
}
```

---

## Error Handling

| Failure | Behavior |
|---------|----------|
| Parse error | `emitNotification(..., 'error')`, no label stored |
| Render error (canvas) | `emitNotification(..., 'error')`, no label stored |
| Unknown EPL command | `console.warn()`, element skipped, render continues |

Consistent with current ZPL Labelary failure behavior.

---

## Out of Scope

- RFID commands (`#RFC`, `#RFR`, `#RFW`, etc.)
- Variable data fields (`#VDD`, `#VDT`, `#VDE`, etc.)
- Real-time clock text/barcode (`#YC`, `#YS`)
- Graphics blobs (`#YI`, `#YIB`, `#YIR`)
- Maxicode, PDF417, Codablock F, Code 49 barcodes
- Standalone/input field prompts
- Status acknowledgement responses (`#!Xn`, `#!XC`)
