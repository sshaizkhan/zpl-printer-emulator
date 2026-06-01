// ── Parser ───────────────────────────────────────────────────────────

function tokenize(data) {
  const tokens = [];
  const normalized = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const parts = normalized.split('#');

  for (const part of parts) {
    if (!part.trim()) continue;
    const match = part.match(/^([!?][A-Za-z0-9!?]{0,4}|[A-Za-z]{1,5})([\s\S]*)$/);
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
        // Geometric commands use plain /‑separated params, no /// content separator
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
        // Geometric commands use plain /‑separated params, no /// content separator
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
        // Geometric commands use plain /‑separated params, no /// content separator
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
  const { createCanvas, loadImage } = require('canvas');
  const bwipjs = require('bwip-js');

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
      await _renderBarcode(ctx, el, x, y, bwipjs, loadImage);
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

async function _renderBarcode(ctx, el, x, y, bwipjs, loadImage) {
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
