import { useState, useRef, useCallback, useEffect } from 'react';
import useConfigStore from '../store/configStore';
import {
  createTextElement,
  createBoxElement,
  createBarcodeElement,
  computeLabelSizeMm,
  generateZPL,
  exportTemplate,
  importTemplate,
  ZPL_FONTS,
  BARCODE_TYPES,
} from '../utils/labelDesigner';
import {
  Type,
  Minus,
  BarChart3,
  Grid3x3,
  Trash2,
  XCircle,
  Eye,
  Upload,
  Download,
  Settings,
  Copy,
} from 'lucide-react';
import Modal from './Modal';

export default function DesignerTab() {
  const { configs } = useConfigStore();
  const [elements, setElements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showGrid, setShowGrid] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showImportExport, setShowImportExport] = useState(null); // 'import' | 'export' | null
  const [previewData, setPreviewData] = useState(null);
  const [ioText, setIoText] = useState('');
  const canvasRef = useRef(null);

  const { widthMm, heightMm } = computeLabelSizeMm(configs);
  const scale = Math.min(500 / widthMm, 600 / heightMm);
  const canvasW = Math.round(widthMm * scale);
  const canvasH = Math.round(heightMm * scale);

  const mmToPx = (mm) => Math.round(mm * scale * 100) / 100;
  const pxToMm = (px) => Math.round((px / scale) * 1000) / 1000;
  const gridSizeMm = 5;

  const snap = (val) => (showGrid ? Math.round(val / gridSizeMm) * gridSizeMm : val);
  const selectedEl = elements.find((e) => e.id === selectedId);

  const unitLabel = configs.unit === '1' ? 'in' : configs.unit === '2' ? 'cm' : configs.unit === '3' ? 'mm' : 'px';

  // ── Drag state ────────────────────────────────────────────────────
  const dragRef = useRef(null);

  const handleCanvasMouseDown = (e) => {
    if (e.target === canvasRef.current || e.target.classList.contains('designer-grid')) {
      setSelectedId(null);
    }
  };

  const handleElementMouseDown = (e, el) => {
    e.stopPropagation();
    setSelectedId(el.id);

    const rect = canvasRef.current.getBoundingClientRect();
    const startMmX = pxToMm(e.clientX - rect.left);
    const startMmY = pxToMm(e.clientY - rect.top);

    dragRef.current = {
      elId: el.id,
      startMmX,
      startMmY,
      elStartX: el.x,
      elStartY: el.y,
      type: 'move',
    };

    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const mmX = pxToMm(ev.clientX - rect.left);
      const mmY = pxToMm(ev.clientY - rect.top);

      if (d.type === 'move') {
        let newX = snap(d.elStartX + (mmX - d.startMmX));
        let newY = snap(d.elStartY + (mmY - d.startMmY));
        newX = Math.max(0, Math.min(newX, widthMm - 1));
        newY = Math.max(0, Math.min(newY, heightMm - 1));

        setElements((prev) =>
          prev.map((item) =>
            item.id === d.elId
              ? { ...item, x: Math.round(newX * 1000) / 1000, y: Math.round(newY * 1000) / 1000 }
              : item
          )
        );
      } else if (d.type === 'resize') {
        const dx = mmX - d.startMmX;
        const dy = mmY - d.startMmY;
        setElements((prev) =>
          prev.map((item) => {
            if (item.id !== d.elId || item.type !== 'box') return item;
            let newW = d.sizeStartW;
            let newH = d.sizeStartH;
            if (d.dir === 'e' || d.dir === 'se') newW = Math.max(0.25, snap(d.sizeStartW + dx));
            if (d.dir === 's' || d.dir === 'se') newH = Math.max(0.25, snap(d.sizeStartH + dy));
            return {
              ...item,
              box: {
                ...item.box,
                size: [Math.round(newW * 1000) / 1000, Math.round(newH * 1000) / 1000],
              },
            };
          })
        );
      }
    };

    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  };

  const handleResizeMouseDown = (e, el, dir) => {
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const startMmX = pxToMm(e.clientX - rect.left);
    const startMmY = pxToMm(e.clientY - rect.top);

    dragRef.current = {
      elId: el.id,
      startMmX,
      startMmY,
      elStartX: el.x,
      elStartY: el.y,
      sizeStartW: el.box.size[0],
      sizeStartH: el.box.size[1],
      type: 'resize',
      dir,
    };

    // Reuse the move handler from element mouse down - trigger it via simulated state
    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const mmX = pxToMm(ev.clientX - rect.left);
      const mmY = pxToMm(ev.clientY - rect.top);
      const dx = mmX - d.startMmX;
      const dy = mmY - d.startMmY;
      setElements((prev) =>
        prev.map((item) => {
          if (item.id !== d.elId || item.type !== 'box') return item;
          let newW = d.sizeStartW;
          let newH = d.sizeStartH;
          if (d.dir === 'e' || d.dir === 'se') newW = Math.max(0.25, snap(d.sizeStartW + dx));
          if (d.dir === 's' || d.dir === 'se') newH = Math.max(0.25, snap(d.sizeStartH + dy));
          return {
            ...item,
            box: {
              ...item.box,
              size: [Math.round(newW * 1000) / 1000, Math.round(newH * 1000) / 1000],
            },
          };
        })
      );
    };

    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  };

  // ── Keyboard delete ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Delete' && selectedId && !e.target.matches('input, textarea, select')) {
        setElements((prev) => prev.filter((item) => item.id !== selectedId));
        setSelectedId(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedId]);

  // ── Actions ───────────────────────────────────────────────────────
  const addText = () => {
    const el = createTextElement();
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };
  const addBox = () => {
    const el = createBoxElement();
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };
  const addBarcode = () => {
    const el = createBarcodeElement();
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };
  const deleteSelected = () => {
    if (!selectedId) return;
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  };
  const clearAll = () => {
    if (elements.length === 0) return;
    if (confirm('Remove all elements from the canvas?')) {
      setElements([]);
      setSelectedId(null);
    }
  };

  const handlePreview = async () => {
    if (elements.length === 0) return;
    const zplCode = generateZPL(elements, configs, widthMm, heightMm);
    setPreviewData({ loading: true, zpl: zplCode });
    setShowPreview(true);

    try {
      const res = await fetch('/api/render-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zpl: zplCode,
          density: configs.density,
          width: configs.width,
          height: configs.height,
          unit: configs.unit,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPreviewData({ image: data.image, zpl: zplCode });
    } catch (e) {
      setPreviewData({ error: e.message, zpl: zplCode });
    }
  };

  const handleExport = () => {
    const json = exportTemplate(templateName, elements);
    setIoText(JSON.stringify(json, null, 2));
    setShowImportExport('export');
  };

  const handleImport = () => {
    setIoText('');
    setShowImportExport('import');
  };

  const doImport = () => {
    try {
      const { templateName: name, elements: els } = importTemplate(ioText);
      setTemplateName(name);
      setElements(els);
      setSelectedId(null);
      setShowImportExport(null);
    } catch (e) {
      alert('Import error: ' + e.message);
    }
  };

  // ── Element rendering ─────────────────────────────────────────────
  const renderElement = (el) => {
    const isSelected = el.id === selectedId;
    const style = {
      position: 'absolute',
      left: mmToPx(el.x) + 'px',
      top: mmToPx(el.y) + 'px',
      cursor: 'move',
    };

    if (el.type === 'text') {
      const t = el.text;
      const fontInfo = ZPL_FONTS[t.fontFamily] || ZPL_FONTS['0'];
      const fontHeightPx = Math.max(8, mmToPx(t.fontSize[1]));
      let scaleX = 1.0;
      if (t.fontSize[0] > 0 && t.fontSize[1] > 0 && Math.abs(t.fontSize[0] - t.fontSize[1]) > 0.01) {
        scaleX = (t.fontSize[0] / t.fontSize[1]) / fontInfo.widthRatio;
      }

      let displayText = t.content;
      if (t.variableNames?.length > 0) {
        let i = 0;
        displayText = t.content.replace(/%s/g, () => {
          const val = t.defaultVariableValues?.[i] || (t.variableNames[i] ? `{${t.variableNames[i]}}` : '%s');
          i++;
          return val;
        });
      }

      const transforms = [];
      let transformOrigin = 'left top';
      if (Math.abs(scaleX - 1.0) > 0.02) transforms.push(`scaleX(${scaleX.toFixed(3)})`);
      if (t.orientation === 'Rotated90') { transforms.push('rotate(90deg)'); transformOrigin = 'top left'; }
      else if (t.orientation === 'Rotated180') { transforms.push('rotate(180deg)'); transformOrigin = 'center center'; }
      else if (t.orientation === 'Rotated270') { transforms.push('rotate(270deg)'); transformOrigin = 'top left'; }

      return (
        <div
          key={el.id}
          className={`designer-el ${isSelected ? 'selected' : ''}`}
          style={{
            ...style,
            fontSize: fontHeightPx + 'px',
            fontFamily: fontInfo.css,
            whiteSpace: 'nowrap',
            lineHeight: 1,
            color: '#000',
            userSelect: 'none',
            padding: '0 1px',
            transform: transforms.length > 0 ? transforms.join(' ') : undefined,
            transformOrigin,
          }}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
        >
          {displayText}
        </div>
      );
    }

    if (el.type === 'box') {
      const b = el.box;
      const wPx = mmToPx(b.size[0]);
      const hPx = mmToPx(b.size[1]);
      const thickPx = mmToPx(b.thickness);
      const isSolidW = thickPx >= wPx || b.size[0] <= b.thickness;
      const isSolidH = thickPx >= hPx || b.size[1] <= b.thickness;
      const bgColor = b.color === 'White' ? '#fff' : '#000';

      return (
        <div
          key={el.id}
          className={`designer-el ${isSelected ? 'selected' : ''}`}
          style={{
            ...style,
            width: Math.max(2, wPx) + 'px',
            height: Math.max(2, hPx) + 'px',
            boxSizing: 'border-box',
            backgroundColor: isSolidW || isSolidH ? bgColor : 'transparent',
            border: isSolidW || isSolidH ? 'none' : `${Math.max(1, thickPx)}px solid ${bgColor}`,
            minWidth: b.size[0] <= 0.5 || b.size[1] <= 0.5 ? '2px' : undefined,
            minHeight: b.size[0] <= 0.5 || b.size[1] <= 0.5 ? '2px' : undefined,
          }}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
        >
          {isSelected && (
            <>
              <div className="resize-handle resize-se" onMouseDown={(e) => handleResizeMouseDown(e, el, 'se')} />
              <div className="resize-handle resize-e" onMouseDown={(e) => handleResizeMouseDown(e, el, 'e')} />
              <div className="resize-handle resize-s" onMouseDown={(e) => handleResizeMouseDown(e, el, 's')} />
            </>
          )}
        </div>
      );
    }

    if (el.type === 'barcode') {
      const bc = el.barcode;
      const isQR = bc.barcodeType === 'QRCode' || bc.barcodeType === 'DataMatrix';
      let wMm, hMm;
      if (isQR) {
        const qrSize = bc.magnificationFactor * 3;
        wMm = qrSize;
        hMm = qrSize;
      } else {
        hMm = bc.size[1] || 15;
        const contentLen = (bc.content || '').length || 6;
        wMm = Math.max(contentLen * bc.widthRatio * bc.magnificationFactor * 0.5, 15);
      }

      return (
        <div
          key={el.id}
          className={`designer-el ${isSelected ? 'selected' : ''}`}
          style={{
            ...style,
            width: Math.max(20, mmToPx(wMm)) + 'px',
            height: Math.max(10, mmToPx(hMm)) + 'px',
            overflow: 'hidden',
            paddingBottom: '16px',
          }}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundImage: isQR
                ? 'linear-gradient(45deg,#000 25%,transparent 25%),linear-gradient(-45deg,#000 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#000 75%),linear-gradient(-45deg,transparent 75%,#000 75%)'
                : 'repeating-linear-gradient(to right,#000 0px,#000 2px,#fff 2px,#fff 3px,#000 3px,#000 4px,#fff 4px,#fff 7px)',
              backgroundSize: isQR ? '6px 6px' : undefined,
              backgroundPosition: isQR ? '0 0,0 3px,3px -3px,-3px 0px' : undefined,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              fontSize: '9px',
              color: '#666',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {bc.barcodeType}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Name:</span>
          <input
            type="text"
            className="input-field w-40 py-1 text-xs"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="templateName"
          />
        </div>

        <div className="h-5 w-px bg-gray-300 dark:bg-gray-600" />

        <div className="flex gap-1">
          <button onClick={addText} className="btn-ghost text-xs" title="Add Text">
            <Type size={14} /> Text
          </button>
          <button onClick={addBox} className="btn-ghost text-xs" title="Add Box/Line">
            <Minus size={14} /> Box
          </button>
          <button onClick={addBarcode} className="btn-ghost text-xs" title="Add Barcode">
            <BarChart3 size={14} /> Barcode
          </button>
        </div>

        <div className="h-5 w-px bg-gray-300 dark:bg-gray-600" />

        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`btn-ghost text-xs ${showGrid ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400' : ''}`}
          title="Toggle Grid"
        >
          <Grid3x3 size={14} /> Grid
        </button>
        <button onClick={deleteSelected} className="btn-ghost text-xs text-red-600 dark:text-red-400" disabled={!selectedId}>
          <Trash2 size={14} />
        </button>
        <button onClick={clearAll} className="btn-ghost text-xs text-red-600 dark:text-red-400" disabled={elements.length === 0}>
          <XCircle size={14} /> Clear
        </button>

        <div className="h-5 w-px bg-gray-300 dark:bg-gray-600" />

        <button onClick={handlePreview} className="btn-ghost text-xs" disabled={elements.length === 0}>
          <Eye size={14} /> Preview
        </button>

        <div className="ml-auto flex gap-1">
          <button onClick={handleImport} className="btn-ghost text-xs">
            <Upload size={14} /> Import
          </button>
          <button onClick={handleExport} className="btn-ghost text-xs" disabled={elements.length === 0}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Canvas + Properties */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas area */}
        <div className="flex flex-1 items-start justify-center overflow-auto bg-gray-100 p-6 dark:bg-gray-950">
          <div
            ref={canvasRef}
            className="designer-canvas"
            style={{ width: canvasW + 'px', height: canvasH + 'px' }}
            onMouseDown={handleCanvasMouseDown}
          >
            {/* Grid */}
            {showGrid && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)',
                  backgroundSize: `${mmToPx(gridSizeMm)}px ${mmToPx(gridSizeMm)}px`,
                }}
              />
            )}
            {elements.map(renderElement)}
          </div>
        </div>

        {/* Properties Panel */}
        <div className="w-64 flex-none overflow-y-auto border-l border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Properties</h3>
          {selectedEl ? (
            <PropertiesForm
              el={selectedEl}
              onChange={(updated) =>
                setElements((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
              }
            />
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Select an element to edit its properties
            </p>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 border-t border-gray-200 bg-gray-50 px-4 py-1.5 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
        <span>
          Label: <b>{configs.width || '4'} x {configs.height || '6'} {unitLabel}</b> ({widthMm.toFixed(1)} x {heightMm.toFixed(1)} mm)
        </span>
        <span>Elements: <b>{elements.length}</b></span>
        <span>Coordinates in mm (origin: top-left)</span>
      </div>

      {/* Preview Modal */}
      {showPreview && previewData && (
        <Modal title="Label Preview (Labelary)" icon={Eye} onClose={() => setShowPreview(false)} size="xl">
          <div className="grid grid-cols-2 gap-4 p-6">
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Rendered</h4>
              <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                {previewData.loading ? (
                  <p className="text-sm text-gray-400">Generating preview...</p>
                ) : previewData.error ? (
                  <p className="text-sm text-red-500">{previewData.error}</p>
                ) : (
                  <img src={previewData.image} alt="Preview" className="max-w-full border border-gray-300" />
                )}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">ZPL Code</h4>
                <button
                  onClick={() => navigator.clipboard.writeText(previewData.zpl)}
                  className="btn-ghost text-xs"
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
              <textarea
                className="input-field h-[400px] font-mono text-xs"
                readOnly
                value={previewData.zpl}
              />
            </div>
          </div>
          <div className="flex justify-end border-t border-gray-200 px-6 py-3 dark:border-gray-700">
            <button onClick={() => setShowPreview(false)} className="btn-secondary">Close</button>
          </div>
        </Modal>
      )}

      {/* Import/Export Modal */}
      {showImportExport && (
        <Modal
          title={showImportExport === 'import' ? 'Import Template' : 'Export Template'}
          icon={showImportExport === 'import' ? Upload : Download}
          onClose={() => setShowImportExport(null)}
          size="lg"
        >
          <div className="p-6">
            <textarea
              className="input-field h-[350px] font-mono text-xs"
              value={ioText}
              onChange={(e) => setIoText(e.target.value)}
              readOnly={showImportExport === 'export'}
              placeholder={showImportExport === 'import' ? 'Paste template JSON here...' : ''}
              spellCheck={false}
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
            <button onClick={() => setShowImportExport(null)} className="btn-secondary">Close</button>
            {showImportExport === 'import' ? (
              <button onClick={doImport} className="btn-primary">Import</button>
            ) : (
              <button
                onClick={() => navigator.clipboard.writeText(ioText)}
                className="btn-primary"
              >
                <Copy size={14} /> Copy to Clipboard
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Properties Form ─────────────────────────────────────────────────
function PropertiesForm({ el, onChange }) {
  const update = (path, value) => {
    const clone = JSON.parse(JSON.stringify(el));
    const keys = path.split('.');
    let obj = clone;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    onChange(clone);
  };

  const splitComma = (str) =>
    str
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  return (
    <div className="space-y-3">
      {/* Position */}
      <FieldGroup label="Position (mm)">
        <div className="grid grid-cols-2 gap-2">
          <SmallInput label="X" type="number" value={el.x} step="0.125" onChange={(v) => update('x', parseFloat(v) || 0)} />
          <SmallInput label="Y" type="number" value={el.y} step="0.125" onChange={(v) => update('y', parseFloat(v) || 0)} />
        </div>
      </FieldGroup>

      {el.type === 'text' && (
        <>
          <FieldGroup label="Content">
            <input className="input-field text-xs" value={el.text.content} onChange={(e) => update('text.content', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Font">
            <select className="select-field text-xs" value={el.text.fontFamily} onChange={(e) => update('text.fontFamily', e.target.value)}>
              {[...Array(9).keys()].map((i) => (
                <option key={i} value={String(i)}>Font {i}</option>
              ))}
              <option value="A">Font A</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Size (mm)">
            <div className="grid grid-cols-2 gap-2">
              <SmallInput label="W" type="number" value={el.text.fontSize[0]} step="0.125" onChange={(v) => update('text.fontSize', [parseFloat(v) || 3.75, el.text.fontSize[1]])} />
              <SmallInput label="H" type="number" value={el.text.fontSize[1]} step="0.125" onChange={(v) => update('text.fontSize', [el.text.fontSize[0], parseFloat(v) || 3.75])} />
            </div>
          </FieldGroup>
          <FieldGroup label="Orientation">
            <select className="select-field text-xs" value={el.text.orientation} onChange={(e) => update('text.orientation', e.target.value)}>
              {['Normal', 'Rotated90', 'Rotated180', 'Rotated270'].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Variables (comma-sep)">
            <input className="input-field text-xs" value={(el.text.variableNames || []).join(', ')} onChange={(e) => update('text.variableNames', splitComma(e.target.value))} />
          </FieldGroup>
          <FieldGroup label="Default Values">
            <input className="input-field text-xs" value={(el.text.defaultVariableValues || []).join(', ')} onChange={(e) => update('text.defaultVariableValues', splitComma(e.target.value))} />
          </FieldGroup>
        </>
      )}

      {el.type === 'box' && (
        <>
          <FieldGroup label="Size (mm)">
            <div className="grid grid-cols-2 gap-2">
              <SmallInput label="W" type="number" value={el.box.size[0]} step="0.125" min="0.25" onChange={(v) => update('box.size', [parseFloat(v) || 0.25, el.box.size[1]])} />
              <SmallInput label="H" type="number" value={el.box.size[1]} step="0.125" min="0.25" onChange={(v) => update('box.size', [el.box.size[0], parseFloat(v) || 0.25])} />
            </div>
          </FieldGroup>
          <FieldGroup label="Thickness (mm)">
            <input className="input-field text-xs" type="number" value={el.box.thickness} step="0.125" min="0.25" onChange={(e) => update('box.thickness', parseFloat(e.target.value) || 0.25)} />
          </FieldGroup>
          <FieldGroup label="Color">
            <select className="select-field text-xs" value={el.box.color} onChange={(e) => update('box.color', e.target.value)}>
              <option value="Black">Black</option>
              <option value="White">White</option>
            </select>
          </FieldGroup>
        </>
      )}

      {el.type === 'barcode' && (
        <>
          <FieldGroup label="Content">
            <input className="input-field text-xs" value={el.barcode.content} onChange={(e) => update('barcode.content', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Type">
            <select className="select-field text-xs" value={el.barcode.barcodeType} onChange={(e) => update('barcode.barcodeType', e.target.value)}>
              {BARCODE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Size (mm)">
            <div className="grid grid-cols-2 gap-2">
              <SmallInput label="W" type="number" value={el.barcode.size[0]} step="0.125" onChange={(v) => update('barcode.size', [parseFloat(v) || 0.25, el.barcode.size[1]])} />
              <SmallInput label="H" type="number" value={el.barcode.size[1]} step="0.125" onChange={(v) => update('barcode.size', [el.barcode.size[0], parseFloat(v) || 15])} />
            </div>
          </FieldGroup>
          <FieldGroup label="Orientation">
            <select className="select-field text-xs" value={el.barcode.orientation} onChange={(e) => update('barcode.orientation', e.target.value)}>
              {['Normal', 'Rotated90', 'Rotated180', 'Rotated270'].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Width Ratio">
            <input className="input-field text-xs" type="number" value={el.barcode.widthRatio} step="0.125" onChange={(e) => update('barcode.widthRatio', parseFloat(e.target.value) || 0.25)} />
          </FieldGroup>
          <FieldGroup label="Magnification">
            <input className="input-field text-xs" type="number" value={el.barcode.magnificationFactor} min="1" max="10" onChange={(e) => update('barcode.magnificationFactor', parseInt(e.target.value) || 10)} />
          </FieldGroup>
          <div className="space-y-1">
            <SmallCheckbox label="Human Readable" checked={el.barcode.showHumanReadableText} onChange={(v) => update('barcode.showHumanReadableText', v)} />
            <SmallCheckbox label="Text Above" checked={el.barcode.showTextAboveBarcode} onChange={(v) => update('barcode.showTextAboveBarcode', v)} />
            <SmallCheckbox label="Check Digit" checked={el.barcode.checkDigit} onChange={(v) => update('barcode.checkDigit', v)} />
          </div>
          <FieldGroup label="Mode">
            <select className="select-field text-xs" value={el.barcode.barcodeMode} onChange={(e) => update('barcode.barcodeMode', e.target.value)}>
              {['NoMode', 'ModeA', 'ModeB', 'ModeC', 'ModeU', 'ModeD'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Error Correction">
            <select className="select-field text-xs" value={el.barcode.errorCorrectionLevel} onChange={(e) => update('barcode.errorCorrectionLevel', e.target.value)}>
              {['L', 'M', 'Q', 'H'].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Variables">
            <input className="input-field text-xs" value={(el.barcode.variableNames || []).join(', ')} onChange={(e) => update('barcode.variableNames', splitComma(e.target.value))} />
          </FieldGroup>
          <FieldGroup label="Default Values">
            <input className="input-field text-xs" value={(el.barcode.defaultVariableValues || []).join(', ')} onChange={(e) => update('barcode.defaultVariableValues', splitComma(e.target.value))} />
          </FieldGroup>
        </>
      )}
    </div>
  );
}

function FieldGroup({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );
}

function SmallInput({ label, ...props }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-4 text-center text-[10px] font-medium text-gray-400">{label}</span>
      <input
        {...props}
        className="input-field py-1 text-xs"
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

function SmallCheckbox({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 dark:border-gray-600"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
