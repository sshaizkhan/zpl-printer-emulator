# EPL Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NOVEXX Easy Plug (EPL) label language support — server-side parse + render via node-canvas — alongside existing ZPL/Labelary pipeline.

**Architecture:** A new `epl-commands.js` module (parser + renderer) lives beside `zpl-commands.js`. The TCP handler in `index.js` checks a per-printer `language` flag (`"zpl"` | `"epl"`) and routes data to the appropriate pipeline. Both pipelines emit PNG labels to the same socket/history mechanism. UI adds a ZPL/EPL toggle in `SettingsModal`.

**Tech Stack:** Node.js, `canvas` (node-canvas, native), `bwip-js` (barcodes), Jest (tests), React + Tailwind (UI toggle)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `web/server/epl-commands.js` | Create | EPL tokenizer, parser, node-canvas renderer |
| `web/server/__tests__/epl-commands.test.js` | Create | Unit tests for parser and renderer |
| `web/server/index.js` | Modify | Add `language` default, `processEplForPrinter`, `renderEplLabelsForPrinter`, TCP routing |
| `web/client/src/components/SettingsModal.jsx` | Modify | Add Language section with ZPL/EPL toggle |
| `web/server/package.json` | Modify | Add `canvas`, `bwip-js` deps; add `jest` devDep + test script |
| `Dockerfile` | Modify | Add Alpine canvas native build deps to `web-app` stage |

---

## Task 1: Add Dependencies and Test Framework

**Files:**
- Modify: `web/server/package.json`
- Modify: `Dockerfile`

- [ ] **Step 1: Add runtime and test deps to web/server/package.json**

Replace the `dependencies` and add `devDependencies` + `scripts.test`:

```json
{
  "name": "zpl-printer-server",
  "version": "5.0.0",
  "description": "ZPL Printer Emulator - Web Backend",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "test": "jest"
  },
  "dependencies": {
    "bwip-js": "^3.5.0",
    "canvas": "^2.11.2",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "socket.io": "^4.7.4"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 2: Install deps**

```bash
cd web/server && npm install
```

Expected: `node_modules/canvas` and `node_modules/bwip-js` present, no errors.

- [ ] **Step 3: Add Alpine native build deps to Dockerfile (web-app stage)**

In `Dockerfile`, in the `FROM node:20-alpine AS web-app` stage, add after the `WORKDIR /app` line:

```dockerfile
# Native deps for node-canvas
RUN apk add --no-cache \
    cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev \
    python3 make g++
```

Full web-app stage after change:

```dockerfile
FROM node:20-alpine AS web-app

LABEL maintainer="ZPL Printer Emulator"
LABEL description="ZPL Printer Emulator - Web Application"

WORKDIR /app

# Native deps for node-canvas
RUN apk add --no-cache \
    cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev \
    python3 make g++

# Install server dependencies
COPY web/server/package.json web/server/package-lock.json* ./server/
RUN cd server && npm install --production

# Copy server source
COPY web/server/ ./server/

# Copy built frontend
COPY --from=frontend-build /app/web/client/dist ./client/dist

# Create directory for saved labels
RUN mkdir -p /app/labels

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000
EXPOSE 9100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/config || exit 1

WORKDIR /app/server
CMD ["node", "index.js"]
```

- [ ] **Step 4: Verify canvas loads**

```bash
cd web/server && node -e "const { createCanvas } = require('canvas'); console.log('canvas OK');"
```

Expected output: `canvas OK`

- [ ] **Step 5: Commit**

```bash
git add web/server/package.json web/server/package-lock.json Dockerfile
git commit -m "chore: add canvas, bwip-js deps and jest test framework"
```

---

## Task 2: EPL Parser (TDD)

**Files:**
- Create: `web/server/__tests__/epl-commands.test.js`
- Create: `web/server/epl-commands.js` (parser only — renderer added in Task 3)

- [ ] **Step 1: Create test file for parser**

Create `web/server/__tests__/epl-commands.test.js`:

```js
const { parseEpl } = require('../epl-commands');

describe('parseEpl', () => {
  test('parses label dimensions from #IMS', () => {
    const input = '#!A1\n#IMS70.0/85.0\n#ERY\n#Q1/';
    const spec = parseEpl(input);
    expect(spec.width).toBe(70.0);
    expect(spec.height).toBe(85.0);
  });

  test('defaults width/height when #IMS absent', () => {
    const input = '#!A1\n#ERY\n#Q1/';
    const spec = parseEpl(input);
    expect(spec.width).toBe(100);
    expect(spec.height).toBe(150);
  });

  test('parses print quantity from #Q', () => {
    const input = '#!A1\n#IMS70.0/85.0\n#ERY\n#Q3/';
    const spec = parseEpl(input);
    expect(spec.quantity).toBe(3);
  });

  test('defaults quantity to 1', () => {
    const input = '#!A1\n#ERY\n';
    const spec = parseEpl(input);
    expect(spec.quantity).toBe(1);
  });

  test('parses text element from #YT with #J and #T position', () => {
    const input = '#!A1\n#IMS70.0/85.0\n#ERY\n#J66.0#T15.0\n#YT0/0/1///HELLO#G\n#Q1/';
    const spec = parseEpl(input);
    expect(spec.elements).toHaveLength(1);
    const el = spec.elements[0];
    expect(el.type).toBe('text');
    expect(el.x).toBe(15.0);
    expect(el.y).toBe(66.0);
    expect(el.content).toBe('HELLO');
    expect(el.rotation).toBe(0);
  });

  test('parses barcode element from #YB', () => {
    const input = '#!A1\n#ERY\n#J25.0#T18.5\n#YB1/0/7///123456789012#G\n#Q1/';
    const spec = parseEpl(input);
    expect(spec.elements).toHaveLength(1);
    const el = spec.elements[0];
    expect(el.type).toBe('barcode');
    expect(el.x).toBe(18.5);
    expect(el.y).toBe(25.0);
    expect(el.data).toBe('123456789012');
  });

  test('parses rectangle from #YR', () => {
    const input = '#!A1\n#ERY\n#J10.0#T5.0\n#YR50.0/30.0/0.5#G\n#Q1/';
    const spec = parseEpl(input);
    expect(spec.elements).toHaveLength(1);
    const el = spec.elements[0];
    expect(el.type).toBe('rect');
    expect(el.x).toBe(5.0);
    expect(el.y).toBe(10.0);
    expect(el.w).toBe(50.0);
    expect(el.h).toBe(30.0);
    expect(el.thickness).toBe(0.5);
  });

  test('parses line from #YL', () => {
    const input = '#!A1\n#ERY\n#J10.0#T5.0\n#YL55.0/10.0/0.3#G\n#Q1/';
    const spec = parseEpl(input);
    expect(spec.elements).toHaveLength(1);
    const el = spec.elements[0];
    expect(el.type).toBe('line');
    expect(el.x1).toBe(5.0);
    expect(el.y1).toBe(10.0);
    expect(el.x2).toBe(55.0);
    expect(el.y2).toBe(10.0);
    expect(el.thickness).toBe(0.3);
  });

  test('parses ellipse from #YE', () => {
    const input = '#!A1\n#ERY\n#J20.0#T20.0\n#YE10.0/5.0/0.3#G\n#Q1/';
    const spec = parseEpl(input);
    expect(spec.elements).toHaveLength(1);
    const el = spec.elements[0];
    expect(el.type).toBe('ellipse');
    expect(el.rx).toBe(10.0);
    expect(el.ry).toBe(5.0);
  });

  test('cursor position resets between elements when new #J/#T set', () => {
    const input = [
      '#!A1', '#ERY',
      '#J10.0#T5.0', '#YT0/0/1///FIRST#G',
      '#J20.0#T15.0', '#YT0/0/1///SECOND#G',
      '#Q1/',
    ].join('\n');
    const spec = parseEpl(input);
    expect(spec.elements[0].x).toBe(5.0);
    expect(spec.elements[0].y).toBe(10.0);
    expect(spec.elements[1].x).toBe(15.0);
    expect(spec.elements[1].y).toBe(20.0);
  });

  test('unknown commands are skipped without throwing', () => {
    const input = '#!A1\n#UNKNOWN123\n#ERY\n#Q1/';
    expect(() => parseEpl(input)).not.toThrow();
    const spec = parseEpl(input);
    expect(spec.elements).toHaveLength(0);
  });

  test('parses #YN as text element (alternate text command)', () => {
    const input = '#!A1\n#ERY\n#J30.0#T10.0\n#YN0/0/1///ALT TEXT#G\n#Q1/';
    const spec = parseEpl(input);
    expect(spec.elements[0].type).toBe('text');
    expect(spec.elements[0].content).toBe('ALT TEXT');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web/server && npm test
```

Expected: All tests FAIL with `Cannot find module '../epl-commands'`

- [ ] **Step 3: Create epl-commands.js with parser**

Create `web/server/epl-commands.js`:

```js
const { createCanvas, loadImage } = require('canvas');
const bwipjs = require('bwip-js');

// ── Parser ───────────────────────────────────────────────────────────

function tokenize(data) {
  const tokens = [];
  const normalized = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const parts = normalized.split('#');

  for (const part of parts) {
    if (!part.trim()) continue;
    const match = part.match(/^([A-Za-z!?]{1,5})([\s\S]*)$/);
    if (!match) continue;
    tokens.push({ cmd: match[1].trim(), params: match[2].trim() });
  }

  return tokens;
}

function parseContentCommand(params) {
  const tripleSlashIdx = params.indexOf('///');
  if (tripleSlashIdx === -1) return null;

  const header = params.substring(0, tripleSlashIdx);
  const content = params.substring(tripleSlashIdx + 3).replace(/#?G$/, '').trim();
  const parts = header.split('/');

  return {
    rot: parseInt(parts[0]) || 0,
    p1: parts[1] !== undefined ? parts[1] : '0',
    p2: parts[2] !== undefined ? parts[2] : '0',
    content,
  };
}

function parseEpl(data) {
  const tokens = tokenize(data);
  const spec = { width: 100, height: 150, quantity: 1, elements: [] };

  let curX = 0;
  let curY = 0;

  for (const token of tokens) {
    const cmd = token.cmd.toUpperCase();
    const params = token.params;

    switch (cmd) {
      case '!A1':
      case 'ERY':
      case 'G':
        break;

      case 'IMS': {
        const [w, h] = params.split('/').map(parseFloat);
        if (!isNaN(w)) spec.width = w;
        if (!isNaN(h)) spec.height = h;
        break;
      }

      case 'J': {
        // #J may contain additional chained commands like #J66.0#T15.0
        // Tokenizer already splits on #, so params is just the number
        const val = parseFloat(params);
        if (!isNaN(val)) curY = val;
        break;
      }

      case 'T': {
        const val = parseFloat(params);
        if (!isNaN(val)) curX = val;
        break;
      }

      case 'M':
        // Magnification handled implicitly via element mag fields
        break;

      case 'YT':
      case 'YN': {
        const parsed = parseContentCommand(params);
        if (parsed) {
          spec.elements.push({
            type: 'text',
            x: curX,
            y: curY,
            rotation: parsed.rot,
            font: parsed.p1,
            mag: parsed.p2,
            content: parsed.content,
          });
        }
        break;
      }

      case 'YB': {
        const parsed = parseContentCommand(params);
        if (parsed) {
          spec.elements.push({
            type: 'barcode',
            x: curX,
            y: curY,
            rotation: parsed.rot,
            barcodeType: parsed.p1,
            mag: parsed.p2,
            data: parsed.content,
          });
        }
        break;
      }

      case 'YL': {
        const parts = params.replace(/#?G$/, '').split('/');
        spec.elements.push({
          type: 'line',
          x1: curX,
          y1: curY,
          x2: parseFloat(parts[0]) || 0,
          y2: parseFloat(parts[1]) || 0,
          thickness: parseFloat(parts[2]) || 0.3,
        });
        break;
      }

      case 'YR': {
        const parts = params.replace(/#?G$/, '').split('/');
        spec.elements.push({
          type: 'rect',
          x: curX,
          y: curY,
          w: parseFloat(parts[0]) || 0,
          h: parseFloat(parts[1]) || 0,
          thickness: parseFloat(parts[2]) || 0.3,
        });
        break;
      }

      case 'YE': {
        const parts = params.replace(/#?G$/, '').split('/');
        spec.elements.push({
          type: 'ellipse',
          x: curX,
          y: curY,
          rx: parseFloat(parts[0]) || 0,
          ry: parseFloat(parts[1]) || 0,
          thickness: parseFloat(parts[2]) || 0.3,
        });
        break;
      }

      case 'Q': {
        const val = parseInt(params);
        if (!isNaN(val)) spec.quantity = val;
        break;
      }

      default:
        console.warn(`[EPL] Unknown command: #${cmd}`);
    }
  }

  return spec;
}

// ── Renderer ─────────────────────────────────────────────────────────

function eplBarcodeToBwip(eplType) {
  const map = {
    '0': 'code128',
    '1': 'code128',
    '2': 'ean13',
    '3': 'ean8',
    '4': 'upca',
    '5': 'upce',
    '6': 'code39',
    '7': 'interleaved2of5',
  };
  return map[String(eplType)] || 'code128';
}

async function renderEplLabel(spec, dpmm = 8) {
  const dpi = dpmm * 25.4;
  const widthPx = Math.max(1, Math.round((spec.width * dpi) / 25.4));
  const heightPx = Math.max(1, Math.round((spec.height * dpi) / 25.4));

  const canvas = createCanvas(widthPx, heightPx);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';

  for (const el of spec.elements) {
    const x = Math.round((el.x * dpi) / 25.4);
    const y = Math.round((el.y * dpi) / 25.4);

    if (el.type === 'text') {
      _renderText(ctx, el, x, y, dpi);
    } else if (el.type === 'barcode') {
      await _renderBarcode(ctx, el, x, y);
    } else if (el.type === 'line') {
      _renderLine(ctx, el, dpi);
    } else if (el.type === 'rect') {
      _renderRect(ctx, el, x, y, dpi);
    } else if (el.type === 'ellipse') {
      _renderEllipse(ctx, el, x, y, dpi);
    }
  }

  return canvas.toBuffer('image/png');
}

function _renderText(ctx, el, x, y, dpi) {
  const mag = parseFloat(el.mag) || 1;
  const fontSize = Math.round(mag * 10 * (dpi / 72));
  const rot = (el.rotation || 0) * 90;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = '#000000';
  ctx.fillText(el.content || '', 0, fontSize);
  ctx.restore();
}

async function _renderBarcode(ctx, el, x, y) {
  const bcid = eplBarcodeToBwip(el.barcodeType);
  const scale = Math.max(1, Math.round(parseFloat(el.mag) || 1));

  try {
    const png = await bwipjs.toBuffer({
      bcid,
      text: el.data || '',
      scale,
      height: 10,
      includetext: true,
    });

    const img = await loadImage(png);
    const rot = (el.rotation || 0) * 90;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  } catch (e) {
    console.warn(`[EPL] Barcode render failed (bcid=${bcid}, data="${el.data}"): ${e.message}`);
  }
}

function _renderLine(ctx, el, dpi) {
  const x1 = Math.round((el.x1 * dpi) / 25.4);
  const y1 = Math.round((el.y1 * dpi) / 25.4);
  const x2 = Math.round((el.x2 * dpi) / 25.4);
  const y2 = Math.round((el.y2 * dpi) / 25.4);
  const lw = Math.max(1, Math.round((el.thickness * dpi) / 25.4));

  ctx.save();
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function _renderRect(ctx, el, x, y, dpi) {
  const w = Math.round((el.w * dpi) / 25.4);
  const h = Math.round((el.h * dpi) / 25.4);
  const lw = Math.max(1, Math.round((el.thickness * dpi) / 25.4));

  ctx.save();
  ctx.lineWidth = lw;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function _renderEllipse(ctx, el, x, y, dpi) {
  const rx = Math.max(1, Math.round((el.rx * dpi) / 25.4));
  const ry = Math.max(1, Math.round((el.ry * dpi) / 25.4));
  const lw = Math.max(1, Math.round((el.thickness * dpi) / 25.4));

  ctx.save();
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

module.exports = { parseEpl, renderEplLabel };
```

- [ ] **Step 4: Run parser tests**

```bash
cd web/server && npm test
```

Expected: All 10 parser tests PASS. Renderer tests not yet written.

- [ ] **Step 5: Commit**

```bash
git add web/server/epl-commands.js web/server/__tests__/epl-commands.test.js
git commit -m "feat: add EPL parser with full test coverage"
```

---

## Task 3: EPL Renderer Tests

**Files:**
- Modify: `web/server/__tests__/epl-commands.test.js`

The renderer is already implemented in `epl-commands.js` from Task 2. Add renderer tests.

- [ ] **Step 1: Add renderer tests to test file**

Append to `web/server/__tests__/epl-commands.test.js`:

```js
const { renderEplLabel } = require('../epl-commands');

describe('renderEplLabel', () => {
  test('returns a Buffer', async () => {
    const spec = { width: 50, height: 30, quantity: 1, elements: [] };
    const result = await renderEplLabel(spec, 8);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  test('output has PNG magic bytes', async () => {
    const spec = { width: 50, height: 30, quantity: 1, elements: [] };
    const result = await renderEplLabel(spec, 8);
    // PNG files start with: 89 50 4E 47 0D 0A 1A 0A
    expect(result[0]).toBe(0x89);
    expect(result[1]).toBe(0x50); // 'P'
    expect(result[2]).toBe(0x4E); // 'N'
    expect(result[3]).toBe(0x47); // 'G'
  });

  test('renders text element without throwing', async () => {
    const spec = {
      width: 70,
      height: 50,
      quantity: 1,
      elements: [{ type: 'text', x: 5, y: 10, rotation: 0, font: '0', mag: '2', content: 'HELLO' }],
    };
    await expect(renderEplLabel(spec, 8)).resolves.toBeDefined();
  });

  test('renders rect element without throwing', async () => {
    const spec = {
      width: 70,
      height: 50,
      quantity: 1,
      elements: [{ type: 'rect', x: 5, y: 5, w: 40, h: 20, thickness: 0.5 }],
    };
    await expect(renderEplLabel(spec, 8)).resolves.toBeDefined();
  });

  test('renders line element without throwing', async () => {
    const spec = {
      width: 70,
      height: 50,
      quantity: 1,
      elements: [{ type: 'line', x1: 5, y1: 10, x2: 60, y2: 10, thickness: 0.3 }],
    };
    await expect(renderEplLabel(spec, 8)).resolves.toBeDefined();
  });

  test('renders ellipse element without throwing', async () => {
    const spec = {
      width: 70,
      height: 50,
      quantity: 1,
      elements: [{ type: 'ellipse', x: 35, y: 25, rx: 15, ry: 10, thickness: 0.3 }],
    };
    await expect(renderEplLabel(spec, 8)).resolves.toBeDefined();
  });

  test('renders barcode element without throwing', async () => {
    const spec = {
      width: 70,
      height: 50,
      quantity: 1,
      elements: [{ type: 'barcode', x: 5, y: 10, rotation: 0, barcodeType: '1', mag: '2', data: '12345' }],
    };
    await expect(renderEplLabel(spec, 8)).resolves.toBeDefined();
  });

  test('uses dpmm to scale canvas size', async () => {
    const spec = { width: 25.4, height: 25.4, quantity: 1, elements: [] }; // 1 inch x 1 inch
    const buf8 = await renderEplLabel(spec, 8);   // 8dpmm = 203dpi → ~203x203px
    const buf12 = await renderEplLabel(spec, 12); // 12dpmm = 305dpi → ~305x305px
    // Higher dpmm → larger buffer
    expect(buf12.length).toBeGreaterThan(buf8.length);
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
cd web/server && npm test
```

Expected: All 18 tests PASS (10 parser + 8 renderer).

- [ ] **Step 3: Commit**

```bash
git add web/server/__tests__/epl-commands.test.js
git commit -m "test: add renderer tests for EPL label rendering"
```

---

## Task 4: Wire EPL into index.js

**Files:**
- Modify: `web/server/index.js`

Changes:
1. Add `language: 'zpl'` to `defaults`
2. Add `require` for epl-commands
3. Add `renderEplLabelsForPrinter()` function
4. Add `processEplForPrinter()` function
5. Branch TCP handler on `printer.language`

- [ ] **Step 1: Add `language` to defaults**

In `web/server/index.js`, find the `const defaults = {` block (line 21). Add `language: 'zpl'` after `isOn: false`:

```js
const defaults = {
  isOn: false,
  language: 'zpl',        // ← add this line
  density: '8',
  // ... rest unchanged
```

- [ ] **Step 2: Add require for epl-commands**

At the top of `web/server/index.js`, after the `ZplCommands` require:

```js
const ZplCommands = require('./zpl-commands');
const { parseEpl, renderEplLabel } = require('./epl-commands');   // ← add this line
```

- [ ] **Step 3: Add renderEplLabelsForPrinter function**

In `web/server/index.js`, after the closing `}` of the `renderLabelsForPrinter` function (around line 329), add:

```js
async function renderEplLabelsForPrinter(printerId, data) {
  const printer = getPrinter(printerId);
  if (!printer) return;

  let spec;
  try {
    spec = parseEpl(data);
  } catch (e) {
    console.error('EPL parse error:', e.message);
    emitNotification(`EPL parse error: ${e.message}`, 'error', printerId);
    return;
  }

  const dpmm = parseInt(printer.density) || 8;
  let buffer;
  try {
    buffer = await renderEplLabel(spec, dpmm);
  } catch (e) {
    console.error('EPL render error:', e.message);
    emitNotification(`EPL render error: ${e.message}`, 'error', printerId);
    return;
  }

  for (let i = 0; i < Math.max(1, spec.quantity); i++) {
    const base64 = buffer.toString('base64');
    const label = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      image: `data:image/png;base64,${base64}`,
      zpl: data,
      timestamp: new Date().toISOString(),
      width: spec.width / 25.4,
      height: spec.height / 25.4,
      printerId,
    };

    if (!labelHistories[printerId]) labelHistories[printerId] = [];
    labelHistories[printerId].unshift(label);
    if (labelHistories[printerId].length > MAX_LABELS) {
      labelHistories[printerId] = labelHistories[printerId].slice(0, MAX_LABELS);
    }

    io.emit('label', label);
    emitNotification('EPL label rendered successfully', 'success', printerId);

    if (printer.saveLabels) {
      const counter = getCounter(printerId);
      const savePath = printer.path || '/tmp/labels';
      try {
        if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });
        if (printer.filetype === '1') {
          const fileName = `LBL${padLeft(counter, 6)}.png`;
          fs.writeFileSync(path.join(savePath, fileName), buffer);
          emitNotification(`Label ${fileName} saved`, 'success', printerId);
        } else if (printer.filetype === '3') {
          const fileName = `LBL${padLeft(counter, 6)}.raw`;
          fs.writeFileSync(path.join(savePath, fileName), data);
          emitNotification(`Label ${fileName} saved`, 'success', printerId);
        }
      } catch (e) {
        emitNotification(`Save error: ${e.message}`, 'error', printerId);
      }
    }
  }
}
```

- [ ] **Step 4: Add processEplForPrinter function**

After `renderEplLabelsForPrinter`, add:

```js
async function processEplForPrinter(printerId, data) {
  const printer = getPrinter(printerId);
  if (!printer) return null;

  const textData = data.toString('utf8').trim();
  if (!textData) return null;

  // Acknowledge bare activate command without rendering
  if (textData === '#!A1') {
    emitNotification('EPL interface activated', 'info', printerId);
    return null;
  }

  await renderEplLabelsForPrinter(printerId, textData);
  return null;
}
```

- [ ] **Step 5: Branch TCP handler on printer.language**

In `web/server/index.js`, find the `processData` function inside `startTcpServer` (around line 355). Find this block:

```js
      try {
        const response = await processZplForPrinter(printerId, data);
        if (response) sock.write(response);
```

Replace with:

```js
      try {
        const currentPrinter = getPrinter(printerId);
        const response = currentPrinter && currentPrinter.language === 'epl'
          ? await processEplForPrinter(printerId, data)
          : await processZplForPrinter(printerId, data);
        if (response) sock.write(response);
```

- [ ] **Step 6: Verify server starts**

```bash
cd web/server && node -e "require('./index.js')" &
sleep 2 && kill %1
```

Expected: No `require` errors or unhandled exceptions on startup.

- [ ] **Step 7: Smoke test EPL TCP pipeline**

```bash
# Start server
cd web/server && node index.js &
sleep 1

# Send minimal EPL label to default port
echo -e '#!A1\n#IMS70.0/85.0\n#ERY\n#J30.0#T10.0\n#YT0/0/2///TEST LABEL#G\n#Q1/' | nc -q1 localhost 9100

# Stop server
kill %1
```

Expected: Server logs `EPL label rendered successfully` (visible in stdout). No crash.

- [ ] **Step 8: Run all tests to confirm no regressions**

```bash
cd web/server && npm test
```

Expected: All 18 tests still PASS.

- [ ] **Step 9: Commit**

```bash
git add web/server/index.js
git commit -m "feat: wire EPL pipeline into server with per-printer language routing"
```

---

## Task 5: Language Toggle UI

**Files:**
- Modify: `web/client/src/components/SettingsModal.jsx`

Add a "Language" section before "Printer Properties" with a ZPL/EPL pill toggle. When EPL is selected, hide the "ZPL Status (~HS)" section (it is irrelevant for EPL printers).

- [ ] **Step 1: Add Language section to SettingsModal**

In `web/client/src/components/SettingsModal.jsx`, after the `<Section title="Printer Identity">` block (after line 43, before `{/* Printer Properties */}`), insert:

```jsx
        {/* Language */}
        <Section title="Language">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">Printer Language</span>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              <button
                type="button"
                onClick={() => update('language', 'zpl')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  form.language !== 'epl'
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                ZPL
              </button>
              <button
                type="button"
                onClick={() => update('language', 'epl')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  form.language === 'epl'
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                EPL
              </button>
            </div>
          </div>
        </Section>
```

- [ ] **Step 2: Conditionally hide ZPL Status section for EPL printers**

In `SettingsModal.jsx`, find `{/* ZPL Status (~HS) */}` (around line 182). Wrap that entire `<Section>` block with a conditional:

```jsx
        {/* ZPL Status (~HS) — only relevant for ZPL printers */}
        {form.language !== 'epl' && (
          <Section title="ZPL Status (~HS)">
            <div className="grid grid-cols-3 gap-x-4 gap-y-2">
              {[
                ['zplHeadOpen', 'Head Open'],
                ['zplPaperOut', 'Paper Out'],
                ['zplRibbonOut', 'Ribbon Out'],
                ['zplPaperJam', 'Paper Jam'],
                ['zplPrinterPaused', 'Printer Paused'],
                ['zplCutterFault', 'Cutter Fault'],
                ['zplHeadTooHot', 'Head Too Hot'],
                ['zplMotorOverheat', 'Motor Overheat'],
                ['zplRewindFault', 'Rewind Fault'],
              ].map(([key, label]) => (
                <Checkbox
                  key={key}
                  label={label}
                  checked={form[key]}
                  onChange={() => toggle(key)}
                />
              ))}
            </div>
          </Section>
        )}
```

- [ ] **Step 3: Build and verify UI compiles**

```bash
cd web/client && npm run build
```

Expected: Build succeeds with no TypeScript/JSX errors.

- [ ] **Step 4: Manual UI test**

Start the dev server and open the settings modal for a printer:

```bash
cd web/server && node index.js &
cd web/client && npm run dev
```

1. Open browser at `http://localhost:5173`
2. Click settings icon on any printer
3. Verify "Language" section appears with ZPL/EPL pill toggle
4. Click EPL — verify "ZPL Status" section disappears
5. Click ZPL — verify "ZPL Status" section reappears
6. Save with EPL selected — verify config persists on reload

- [ ] **Step 5: Commit**

```bash
git add web/client/src/components/SettingsModal.jsx
git commit -m "feat: add ZPL/EPL language toggle to printer settings UI"
```

---

## Task 6: End-to-End Smoke Test

- [ ] **Step 1: Start server**

```bash
cd web/server && node index.js
```

- [ ] **Step 2: Set a printer to EPL via API (or UI)**

```bash
curl -s -X POST http://localhost:4000/api/printers/<PRINTER_ID>/config \
  -H 'Content-Type: application/json' \
  -d '{"language":"epl"}' | jq .
```

Replace `<PRINTER_ID>` with the actual ID shown by `curl -s http://localhost:4000/api/printers | jq '.printers[0].id'`.

Expected: `{"success": true}`

- [ ] **Step 3: Send sample EPL label from the spec (page 8 example)**

```bash
printf '#!A1\n#IMS70.0/85.0\n#ERY\n#J66.0#T15.0\n#YT107/0///THERMO#G\n#J60.0#T20.5\n#YT106/0///PRINTING-SYSTEM#G\n#J50.0#T20.5\n#YT104/0///The easy way#G\n#J25.0#T18.5\n#YB1/0M/7/3///123456789012#G\n#Q1/' | nc -q2 localhost 9100
```

Expected: Server logs `EPL label rendered successfully`. Label appears in the UI's Printer tab.

- [ ] **Step 4: Verify ZPL still works on a ZPL printer**

```bash
printf '^XA^FO50,50^ADN,36,20^FDHello ZPL^FS^XZ' | nc -q2 localhost 9100
```

Expected: Labelary renders a ZPL label. No regressions.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: EPL support complete — parser, renderer, server routing, UI toggle"
```
