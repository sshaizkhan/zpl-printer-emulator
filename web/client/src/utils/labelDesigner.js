/**
 * Label Designer Engine
 * Manages elements, coordinates, ZPL generation, and import/export.
 * Ported from Electron LabelDesigner class.
 */

export const ZPL_FONTS = {
  '0': { css: 'Helvetica, Arial, sans-serif', widthRatio: 0.55 },
  '1': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
  '2': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
  '3': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
  '4': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
  '5': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
  '6': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
  '7': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
  '8': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
  A: { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
};

export const BARCODE_TYPES = [
  'Code128', 'Code39', 'Code93', 'EAN13', 'EAN8', 'UPCA', 'UPCE',
  'Interleaved2of5', 'QRCode', 'DataMatrix', 'PDF417', 'Codabar',
  'MSI', 'Postnet', 'Planet', 'USPS4CB',
];

let nextId = 1;

export function createTextElement(opts = {}) {
  return {
    id: 'el-' + nextId++,
    type: 'text',
    x: opts.x ?? 5,
    y: opts.y ?? 5,
    text: {
      content: opts.content || 'Text',
      fontFamily: opts.fontFamily || '0',
      fontSize: opts.fontSize ? [...opts.fontSize] : [3.75, 3.75],
      orientation: opts.orientation || 'Normal',
      variableNames: opts.variableNames ? [...opts.variableNames] : [],
      defaultVariableValues: opts.defaultVariableValues ? [...opts.defaultVariableValues] : [],
    },
  };
}

export function createBoxElement(opts = {}) {
  return {
    id: 'el-' + nextId++,
    type: 'box',
    x: opts.x ?? 5,
    y: opts.y ?? 5,
    box: {
      size: opts.size ? [...opts.size] : [20, 0.25],
      thickness: opts.thickness ?? 0.25,
      color: opts.color || 'Black',
    },
  };
}

export function createBarcodeElement(opts = {}) {
  return {
    id: 'el-' + nextId++,
    type: 'barcode',
    x: opts.x ?? 5,
    y: opts.y ?? 5,
    barcode: {
      content: opts.content || 'BARCODE',
      barcodeType: opts.barcodeType || 'Code128',
      size: opts.size ? [...opts.size] : [0.25, 15],
      orientation: opts.orientation || 'Normal',
      widthRatio: opts.widthRatio ?? 0.25,
      magnificationFactor: opts.magnificationFactor ?? 10,
      showHumanReadableText: opts.showHumanReadableText || false,
      showTextAboveBarcode: opts.showTextAboveBarcode || false,
      checkDigit: opts.checkDigit || false,
      errorCorrectionLevel: opts.errorCorrectionLevel || 'H',
      qrCodeModel: opts.qrCodeModel ?? 2,
      maskValue: opts.maskValue ?? 7,
      barcodeMode: opts.barcodeMode || 'NoMode',
      variableNames: opts.variableNames ? [...opts.variableNames] : [],
      defaultVariableValues: opts.defaultVariableValues ? [...opts.defaultVariableValues] : [],
    },
  };
}

export function computeLabelSizeMm(configs) {
  const unit = configs.unit || '1';
  const w = parseFloat(configs.width) || 4;
  const h = parseFloat(configs.height) || 6;
  const factor = unit === '1' ? 25.4 : unit === '2' ? 10 : unit === '3' ? 1 : 25.4 / 96;
  return {
    widthMm: Math.round(w * factor * 100) / 100,
    heightMm: Math.round(h * factor * 100) / 100,
  };
}

function resolveContent(content, variableNames, defaultVariableValues) {
  if (!variableNames || variableNames.length === 0) return content;
  let i = 0;
  return content.replace(/%s/g, () => {
    const val =
      defaultVariableValues && defaultVariableValues[i]
        ? defaultVariableValues[i]
        : variableNames[i]
          ? '{' + variableNames[i] + '}'
          : '%s';
    i++;
    return val;
  });
}

export function generateZPL(elements, configs, labelWidthMm, labelHeightMm) {
  const density = parseInt(configs.density) || 8;
  const mmToDots = (mm) => Math.round(mm * density);
  const orientationMap = { Normal: 'N', Rotated90: 'R', Rotated180: 'I', Rotated270: 'B' };

  let zpl = '^XA\n';
  zpl += '^PW' + mmToDots(labelWidthMm) + '\n';
  zpl += '^LL' + mmToDots(labelHeightMm) + '\n';

  for (const el of elements) {
    const xDots = mmToDots(el.x);
    const yDots = mmToDots(el.y);

    if (el.type === 'text') {
      const t = el.text;
      const orient = orientationMap[t.orientation] || 'N';
      const hDots = mmToDots(t.fontSize[1]);
      const wDots = mmToDots(t.fontSize[0]);
      const fieldData = resolveContent(t.content, t.variableNames, t.defaultVariableValues);
      zpl += '^FO' + xDots + ',' + yDots;
      zpl += '^A' + t.fontFamily + orient + ',' + hDots + ',' + wDots;
      zpl += '^FD' + fieldData + '^FS\n';
    } else if (el.type === 'box') {
      const b = el.box;
      const wDots = mmToDots(b.size[0]);
      const hDots = mmToDots(b.size[1]);
      const thickDots = Math.max(1, mmToDots(b.thickness));
      const color = b.color === 'White' ? 'W' : 'B';
      zpl += '^FO' + xDots + ',' + yDots;
      zpl += '^GB' + wDots + ',' + hDots + ',' + thickDots + ',' + color + '^FS\n';
    } else if (el.type === 'barcode') {
      zpl += generateBarcodeZPL(el, xDots, yDots, mmToDots, orientationMap);
    }
  }

  zpl += '^XZ';
  return zpl;
}

function generateBarcodeZPL(el, xDots, yDots, mmToDots, orientationMap) {
  const bc = el.barcode;
  const orient = orientationMap[bc.orientation] || 'N';
  const hDots = mmToDots(bc.size[1]);
  const moduleWidth = Math.max(1, Math.round(bc.widthRatio * 8));
  const hrt = bc.showHumanReadableText ? 'Y' : 'N';
  const content = resolveContent(bc.content, bc.variableNames, bc.defaultVariableValues);
  let zpl = '';
  zpl += '^FO' + xDots + ',' + yDots;

  switch (bc.barcodeType) {
    case 'Code128':
      zpl += '^BY' + moduleWidth;
      zpl += '^BC' + orient + ',' + hDots + ',' + hrt + ',N,N';
      if (bc.barcodeMode && bc.barcodeMode !== 'NoMode') {
        const modeChar = bc.barcodeMode.replace('Mode', '>:').charAt(bc.barcodeMode.length - 1);
        zpl += '^FD>' + modeChar + content + '^FS\n';
      } else {
        zpl += '^FD' + content + '^FS\n';
      }
      break;
    case 'Code39':
      zpl += '^BY' + moduleWidth;
      zpl += '^B3' + orient + ',' + (bc.checkDigit ? 'Y' : 'N') + ',' + hDots + ',' + hrt + ',N';
      zpl += '^FD' + content + '^FS\n';
      break;
    case 'Code93':
      zpl += '^BY' + moduleWidth;
      zpl += '^BA' + orient + ',' + hDots + ',' + hrt + ',N';
      zpl += '^FD' + content + '^FS\n';
      break;
    case 'EAN13':
      zpl += '^BY' + moduleWidth;
      zpl += '^BE' + orient + ',' + hDots + ',' + hrt + ',N';
      zpl += '^FD' + content + '^FS\n';
      break;
    case 'EAN8':
      zpl += '^BY' + moduleWidth;
      zpl += '^B8' + orient + ',' + hDots + ',' + hrt + ',N';
      zpl += '^FD' + content + '^FS\n';
      break;
    case 'UPCA':
      zpl += '^BY' + moduleWidth;
      zpl += '^BU' + orient + ',' + hDots + ',' + hrt + ',N';
      zpl += '^FD' + content + '^FS\n';
      break;
    case 'UPCE':
      zpl += '^BY' + moduleWidth;
      zpl += '^B9' + orient + ',' + hDots + ',' + hrt + ',N';
      zpl += '^FD' + content + '^FS\n';
      break;
    case 'Interleaved2of5':
      zpl += '^BY' + moduleWidth;
      zpl += '^B2' + orient + ',' + hDots + ',' + hrt + ',N';
      zpl += '^FD' + content + '^FS\n';
      break;
    case 'QRCode': {
      const mag = bc.magnificationFactor || 10;
      const ecl = ({ L: 'L', M: 'M', Q: 'Q', H: 'H' })[bc.errorCorrectionLevel] || 'H';
      const model = bc.qrCodeModel || 2;
      zpl += '^BQ' + orient + ',' + model + ',' + mag;
      zpl += '^FD' + ecl + 'A,' + content + '^FS\n';
      break;
    }
    case 'DataMatrix':
      zpl += '^BX' + orient + ',' + (bc.magnificationFactor || 10) + ',200';
      zpl += '^FD' + content + '^FS\n';
      break;
    case 'PDF417':
      zpl += '^BY' + moduleWidth;
      zpl += '^B7' + orient + ',' + hDots + ',0,0,0,N';
      zpl += '^FD' + content + '^FS\n';
      break;
    default:
      zpl += '^BY' + moduleWidth;
      zpl += '^BC' + orient + ',' + hDots + ',' + hrt + ',N,N';
      zpl += '^FD' + content + '^FS\n';
      break;
  }
  return zpl;
}

export function exportTemplate(templateName, elements) {
  const templateElements = elements.map((el) => {
    const out = {
      position: [el.x, el.y],
      templateElementType: el.type,
    };

    if (el.type === 'text') {
      const t = el.text;
      out.text = {
        content: t.content,
        fontFamily: t.fontFamily,
        fontSize: [...t.fontSize],
        orientation: t.orientation,
      };
      if (t.variableNames?.length > 0) out.text.variableNames = [...t.variableNames];
      if (t.defaultVariableValues?.length > 0) out.text.defaultVariableValues = [...t.defaultVariableValues];
    } else if (el.type === 'box') {
      const b = el.box;
      out.box = { size: [...b.size], thickness: b.thickness, color: b.color };
    } else if (el.type === 'barcode') {
      const bc = el.barcode;
      out.barcode = {
        content: bc.content,
        barcodeType: bc.barcodeType,
        size: [...bc.size],
        orientation: bc.orientation,
        widthRatio: bc.widthRatio,
        magnificationFactor: bc.magnificationFactor,
        showHumanReadableText: bc.showHumanReadableText,
        showTextAboveBarcode: bc.showTextAboveBarcode,
        checkDigit: bc.checkDigit,
        barcodeMode: bc.barcodeMode,
        errorCorrectionLevel: bc.errorCorrectionLevel,
        qrCodeModel: bc.qrCodeModel,
        maskValue: bc.maskValue,
      };
      if (bc.variableNames?.length > 0) out.barcode.variableNames = [...bc.variableNames];
      if (bc.defaultVariableValues?.length > 0) out.barcode.defaultVariableValues = [...bc.defaultVariableValues];
    }

    return out;
  });

  return {
    zplTemplates: [{ templateName: templateName || 'untitled', templateElements }],
  };
}

export function importTemplate(json) {
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch (e) {
    throw new Error('Invalid JSON: ' + e.message);
  }

  let template;
  if (data.zplTemplates?.length > 0) {
    template = data.zplTemplates[0];
  } else if (data.templateElements) {
    template = data;
  } else {
    throw new Error('No template found in JSON.');
  }

  const elements = [];
  nextId = 1;

  (template.templateElements || []).forEach((te) => {
    if (te.templateElementType === 'text') {
      elements.push(
        createTextElement({
          x: te.position[0],
          y: te.position[1],
          ...te.text,
        })
      );
    } else if (te.templateElementType === 'box') {
      elements.push(
        createBoxElement({
          x: te.position[0],
          y: te.position[1],
          ...te.box,
        })
      );
    } else if (te.templateElementType === 'barcode') {
      elements.push(
        createBarcodeElement({
          x: te.position[0],
          y: te.position[1],
          ...te.barcode,
        })
      );
    }
  });

  return { templateName: template.templateName || '', elements };
}
