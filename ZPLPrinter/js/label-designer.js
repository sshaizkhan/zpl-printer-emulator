/**
 * Label Template Designer
 * Provides a drag-and-drop interface for creating ZPL label templates.
 * Coordinates are stored in mm with origin at top-left (matching ZPL convention).
 */
class LabelDesigner {
    /**
     * ZPL font-to-CSS mapping.
     * Font 0 is CG Triumvirate (proportional, similar to Helvetica) on Zebra printers and Labelary.
     * Fonts 1-8 and A are bitmap/fixed-width fonts.
     * The widthRatio is the approximate ratio of character width to height for each font
     * at its default aspect ratio (when ZPL width == height).
     */
    static ZPL_FONTS = {
        '0': { css: 'Helvetica, Arial, sans-serif', widthRatio: 0.55 },
        '1': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
        '2': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
        '3': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
        '4': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
        '5': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
        '6': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
        '7': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
        '8': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 },
        'A': { css: '"Courier New", Courier, monospace', widthRatio: 0.6 }
    };

    constructor(canvasId, propsContentId, configs) {
        this.canvasEl = document.getElementById(canvasId);
        this.propsContentEl = document.getElementById(propsContentId);
        this.configs = configs;
        this.elements = [];
        this.selectedElement = null;
        this.nextId = 1;
        this.scale = 4; // pixels per mm
        this.labelWidthMm = 101.6;
        this.labelHeightMm = 152.4;
        this.showGrid = false;
        this.gridSizeMm = 5;
        this.templateName = '';

        // Drag state
        this._dragging = false;
        this._resizing = false;
        this._resizeDir = null;
        this._dragStartMm = null;
        this._dragElStart = null;
        this._dragElSizeStart = null;
        this._activeEl = null;

        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);

        this.updateLabelSize();
        this._bindCanvasEvents();
    }

    // ── Label size ──────────────────────────────────────────────────────
    updateLabelSize() {
        const unit = this.configs.unit || '1';
        const w = parseFloat(this.configs.width) || 4;
        const h = parseFloat(this.configs.height) || 6;
        const factor = unit === '1' ? 25.4 : (unit === '2' ? 10 : (unit === '3' ? 1 : (25.4 / 96)));
        this.labelWidthMm = Math.round(w * factor * 100) / 100;
        this.labelHeightMm = Math.round(h * factor * 100) / 100;

        // Fit canvas: aim for ~500px wide or ~700px tall, whichever is smaller scale
        this.scale = Math.min(500 / this.labelWidthMm, 700 / this.labelHeightMm);
        this.canvasEl.style.width = Math.round(this.labelWidthMm * this.scale) + 'px';
        this.canvasEl.style.height = Math.round(this.labelHeightMm * this.scale) + 'px';
        this.renderAll();
    }

    // ── Coordinate helpers ──────────────────────────────────────────────
    _mmToPx(mm) { return Math.round(mm * this.scale * 100) / 100; }
    _pxToMm(px) { return Math.round((px / this.scale) * 1000) / 1000; }

    _canvasMmFromEvent(e) {
        const rect = this.canvasEl.getBoundingClientRect();
        return {
            x: this._pxToMm(e.clientX - rect.left),
            y: this._pxToMm(e.clientY - rect.top)
        };
    }

    // Snap value to grid if grid is on
    _snap(val) {
        if (!this.showGrid) return val;
        return Math.round(val / this.gridSizeMm) * this.gridSizeMm;
    }

    // ── Element creation ────────────────────────────────────────────────
    addTextElement(opts) {
        const el = {
            id: 'el-' + (this.nextId++),
            type: 'text',
            x: (opts && opts.x != null) ? opts.x : 5,
            y: (opts && opts.y != null) ? opts.y : 5,
            text: {
                content: (opts && opts.content) || 'Text',
                fontFamily: (opts && opts.fontFamily) || '0',
                fontSize: (opts && opts.fontSize) ? opts.fontSize.slice() : [3.75, 3.75],
                orientation: (opts && opts.orientation) || 'Normal',
                variableNames: (opts && opts.variableNames) ? opts.variableNames.slice() : [],
                defaultVariableValues: (opts && opts.defaultVariableValues) ? opts.defaultVariableValues.slice() : []
            }
        };
        this.elements.push(el);
        this._renderElement(el);
        this.selectElement(el);
        return el;
    }

    addBoxElement(opts) {
        const el = {
            id: 'el-' + (this.nextId++),
            type: 'box',
            x: (opts && opts.x != null) ? opts.x : 5,
            y: (opts && opts.y != null) ? opts.y : 5,
            box: {
                size: (opts && opts.size) ? opts.size.slice() : [20, 0.25],
                thickness: (opts && opts.thickness != null) ? opts.thickness : 0.25,
                color: (opts && opts.color) || 'Black'
            }
        };
        this.elements.push(el);
        this._renderElement(el);
        this.selectElement(el);
        return el;
    }

    addBarcodeElement(opts) {
        const el = {
            id: 'el-' + (this.nextId++),
            type: 'barcode',
            x: (opts && opts.x != null) ? opts.x : 5,
            y: (opts && opts.y != null) ? opts.y : 5,
            barcode: {
                content: (opts && opts.content) || 'BARCODE',
                barcodeType: (opts && opts.barcodeType) || 'Code128',
                size: (opts && opts.size) ? opts.size.slice() : [0.25, 15],
                orientation: (opts && opts.orientation) || 'Normal',
                widthRatio: (opts && opts.widthRatio != null) ? opts.widthRatio : 0.25,
                magnificationFactor: (opts && opts.magnificationFactor != null) ? opts.magnificationFactor : 10,
                showHumanReadableText: (opts && opts.showHumanReadableText) || false,
                showTextAboveBarcode: (opts && opts.showTextAboveBarcode) || false,
                checkDigit: (opts && opts.checkDigit) || false,
                errorCorrectionLevel: (opts && opts.errorCorrectionLevel) || 'H',
                qrCodeModel: (opts && opts.qrCodeModel != null) ? opts.qrCodeModel : 2,
                maskValue: (opts && opts.maskValue != null) ? opts.maskValue : 7,
                barcodeMode: (opts && opts.barcodeMode) || 'NoMode',
                variableNames: (opts && opts.variableNames) ? opts.variableNames.slice() : [],
                defaultVariableValues: (opts && opts.defaultVariableValues) ? opts.defaultVariableValues.slice() : []
            }
        };
        this.elements.push(el);
        this._renderElement(el);
        this.selectElement(el);
        return el;
    }

    // ── Selection ───────────────────────────────────────────────────────
    selectElement(el) {
        // Remove previous selection visuals
        this.canvasEl.querySelectorAll('.designer-el').forEach(d => {
            d.classList.remove('selected');
            d.querySelectorAll('.resize-handle').forEach(h => h.remove());
        });
        this.selectedElement = el;
        if (el) {
            const dom = this.canvasEl.querySelector('[data-el-id="' + el.id + '"]');
            if (dom) {
                dom.classList.add('selected');
                if (el.type === 'box') this._addResizeHandles(dom, el);
            }
        }
        this._renderProperties();
    }

    deleteElement(el) {
        if (!el) return;
        const idx = this.elements.indexOf(el);
        if (idx !== -1) this.elements.splice(idx, 1);
        const dom = this.canvasEl.querySelector('[data-el-id="' + el.id + '"]');
        if (dom) dom.remove();
        if (this.selectedElement === el) {
            this.selectedElement = null;
            this._renderProperties();
        }
    }

    // ── DOM rendering ───────────────────────────────────────────────────
    renderAll() {
        // Clear canvas children except grid
        this.canvasEl.querySelectorAll('.designer-el').forEach(d => d.remove());
        this._renderGrid();
        this.elements.forEach(el => this._renderElement(el));
        if (this.selectedElement) {
            const dom = this.canvasEl.querySelector('[data-el-id="' + this.selectedElement.id + '"]');
            if (dom) {
                dom.classList.add('selected');
                if (this.selectedElement.type === 'box') this._addResizeHandles(dom, this.selectedElement);
            }
        }
    }

    _renderGrid() {
        let gridEl = this.canvasEl.querySelector('.designer-grid');
        if (!this.showGrid) {
            if (gridEl) gridEl.remove();
            return;
        }
        if (!gridEl) {
            gridEl = document.createElement('div');
            gridEl.className = 'designer-grid';
            this.canvasEl.insertBefore(gridEl, this.canvasEl.firstChild);
        }
        gridEl.style.width = '100%';
        gridEl.style.height = '100%';
        gridEl.style.position = 'absolute';
        gridEl.style.top = '0';
        gridEl.style.left = '0';
        gridEl.style.pointerEvents = 'none';
        const gPx = this._mmToPx(this.gridSizeMm);
        gridEl.style.backgroundImage =
            'linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px),' +
            'linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)';
        gridEl.style.backgroundSize = gPx + 'px ' + gPx + 'px';
    }

    toggleGrid() {
        this.showGrid = !this.showGrid;
        this._renderGrid();
    }

    _renderElement(el) {
        // Remove existing DOM if any
        const existing = this.canvasEl.querySelector('[data-el-id="' + el.id + '"]');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.className = 'designer-el designer-el-' + el.type;
        div.setAttribute('data-el-id', el.id);
        div.style.position = 'absolute';
        div.style.left = this._mmToPx(el.x) + 'px';
        div.style.top = this._mmToPx(el.y) + 'px';
        div.style.cursor = 'move';

        if (el.type === 'text') {
            this._renderTextDom(div, el);
        } else if (el.type === 'box') {
            this._renderBoxDom(div, el);
        } else if (el.type === 'barcode') {
            this._renderBarcodeDom(div, el);
        }

        // Mouse down to start drag or select
        div.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('resize-handle')) return; // handled separately
            e.stopPropagation();
            this.selectElement(el);
            this._startDrag(e, el);
        });

        this.canvasEl.appendChild(div);
    }

    _renderTextDom(div, el) {
        const t = el.text;
        const fontHeightPx = this._mmToPx(t.fontSize[1]);
        const fontWidthMm = t.fontSize[0];
        const fontHeightMm = t.fontSize[1];
        const fontInfo = LabelDesigner.ZPL_FONTS[t.fontFamily] || LabelDesigner.ZPL_FONTS['0'];

        div.style.fontSize = Math.max(8, fontHeightPx) + 'px';
        div.style.fontFamily = fontInfo.css;
        div.style.whiteSpace = 'nowrap';
        div.style.lineHeight = '1';
        div.style.color = '#000';
        div.style.userSelect = 'none';

        // In ZPL, when fontSize width == height, the font renders at its natural
        // proportions (no distortion). Only apply horizontal scaling when width
        // explicitly differs from height, indicating intentional character stretching.
        let scaleX = 1.0;
        if (fontWidthMm > 0 && fontHeightMm > 0 && Math.abs(fontWidthMm - fontHeightMm) > 0.01) {
            const desiredWidthRatio = fontWidthMm / fontHeightMm;
            scaleX = desiredWidthRatio / fontInfo.widthRatio;
        }

        // Determine display text: replace %s with defaults or variable names
        let displayText = t.content;
        if (t.variableNames && t.variableNames.length > 0) {
            let i = 0;
            displayText = t.content.replace(/%s/g, () => {
                const val = (t.defaultVariableValues && t.defaultVariableValues[i])
                    ? t.defaultVariableValues[i]
                    : (t.variableNames[i] ? '{' + t.variableNames[i] + '}' : '%s');
                i++;
                return val;
            });
        }

        div.textContent = displayText;

        // Build combined transform: scaleX for character width + rotation for orientation
        let transforms = [];
        if (Math.abs(scaleX - 1.0) > 0.02) {
            transforms.push('scaleX(' + scaleX.toFixed(3) + ')');
        }

        if (t.orientation === 'Rotated90') {
            transforms.push('rotate(90deg)');
            div.style.transformOrigin = 'top left';
        } else if (t.orientation === 'Rotated180') {
            transforms.push('rotate(180deg)');
            div.style.transformOrigin = 'center center';
        } else if (t.orientation === 'Rotated270') {
            transforms.push('rotate(270deg)');
            div.style.transformOrigin = 'top left';
        } else {
            div.style.transformOrigin = 'left top';
        }

        if (transforms.length > 0) {
            div.style.transform = transforms.join(' ');
        }
    }

    _renderBoxDom(div, el) {
        const b = el.box;
        const wPx = this._mmToPx(b.size[0]);
        const hPx = this._mmToPx(b.size[1]);
        const thickPx = this._mmToPx(b.thickness);

        // ZPL ^GB draws a box where thickness is the border width.
        // If thickness >= width or height, it's a solid fill.
        const isSolidW = thickPx >= wPx || b.size[0] <= b.thickness;
        const isSolidH = thickPx >= hPx || b.size[1] <= b.thickness;

        div.style.width = Math.max(2, wPx) + 'px';
        div.style.height = Math.max(2, hPx) + 'px';
        div.style.boxSizing = 'border-box';

        if (isSolidW || isSolidH) {
            // Solid fill (line or filled box)
            div.style.backgroundColor = b.color === 'White' ? '#fff' : '#000';
            div.style.border = 'none';
        } else {
            // Bordered box (frame)
            div.style.backgroundColor = 'transparent';
            const borderWidth = Math.max(1, thickPx) + 'px';
            div.style.border = borderWidth + ' solid ' + (b.color === 'White' ? '#fff' : '#000');
        }

        // Ensure thin lines remain visible
        if (b.size[0] <= 0.5 || b.size[1] <= 0.5) {
            div.style.minWidth = '2px';
            div.style.minHeight = '2px';
        }
    }

    _renderBarcodeDom(div, el) {
        const bc = el.barcode;
        // Barcode rendering: show as a visual placeholder with stripes
        // Width: for 1D barcodes, the width depends on content length * widthRatio * magnificationFactor
        // We'll approximate visually
        const isQR = bc.barcodeType === 'QRCode' || bc.barcodeType === 'DataMatrix';
        let wMm, hMm;
        if (isQR) {
            // QR codes are square, size based on magnificationFactor
            const qrSize = bc.magnificationFactor * 3; // approximate
            wMm = qrSize;
            hMm = qrSize;
        } else {
            // 1D barcode: height from size[1], width estimated from content
            hMm = bc.size[1] || 15;
            const contentLen = (bc.content || '').length || 6;
            wMm = Math.max(contentLen * bc.widthRatio * bc.magnificationFactor * 0.5, 15);
        }
        const wPx = this._mmToPx(wMm);
        const hPx = this._mmToPx(hMm);

        div.style.width = Math.max(20, wPx) + 'px';
        div.style.height = Math.max(10, hPx) + 'px';
        div.style.overflow = 'hidden';

        // Create barcode visual
        const inner = document.createElement('div');
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.position = 'relative';

        if (isQR) {
            // QR code placeholder: checkered pattern
            inner.style.backgroundImage =
                'linear-gradient(45deg, #000 25%, transparent 25%),' +
                'linear-gradient(-45deg, #000 25%, transparent 25%),' +
                'linear-gradient(45deg, transparent 75%, #000 75%),' +
                'linear-gradient(-45deg, transparent 75%, #000 75%)';
            inner.style.backgroundSize = '6px 6px';
            inner.style.backgroundPosition = '0 0, 0 3px, 3px -3px, -3px 0px';
        } else {
            // 1D barcode: vertical stripes
            inner.style.backgroundImage = 'repeating-linear-gradient(to right, #000 0px, #000 2px, #fff 2px, #fff 3px, #000 3px, #000 4px, #fff 4px, #fff 7px)';
        }
        div.appendChild(inner);

        // Label showing barcode type
        const label = document.createElement('div');
        label.className = 'barcode-type-label';
        label.textContent = bc.barcodeType;
        label.style.position = 'absolute';
        label.style.bottom = '-14px';
        label.style.left = '0';
        label.style.fontSize = '9px';
        label.style.color = '#666';
        label.style.whiteSpace = 'nowrap';
        div.appendChild(label);
    }

    // ── Resize handles (for box elements) ───────────────────────────────
    _addResizeHandles(dom, el) {
        const dirs = ['se', 'e', 's'];
        dirs.forEach(dir => {
            const h = document.createElement('div');
            h.className = 'resize-handle resize-' + dir;
            h.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this._startResize(e, el, dir);
            });
            dom.appendChild(h);
        });
    }

    // ── Drag logic ──────────────────────────────────────────────────────
    _bindCanvasEvents() {
        // Canvas click for deselect
        this.canvasEl.addEventListener('mousedown', (e) => {
            if (e.target === this.canvasEl || e.target.classList.contains('designer-grid')) {
                this.selectElement(null);
            }
        });

        // Key events
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && this.selectedElement && !e.target.matches('input, textarea, select')) {
                this.deleteElement(this.selectedElement);
            }
        });
    }

    _startDrag(e, el) {
        this._dragging = true;
        this._activeEl = el;
        this._dragStartMm = this._canvasMmFromEvent(e);
        this._dragElStart = { x: el.x, y: el.y };
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
        e.preventDefault();
    }

    _startResize(e, el, dir) {
        this._resizing = true;
        this._resizeDir = dir;
        this._activeEl = el;
        this._dragStartMm = this._canvasMmFromEvent(e);
        this._dragElStart = { x: el.x, y: el.y };
        this._dragElSizeStart = el.box ? { w: el.box.size[0], h: el.box.size[1] } : null;
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
        e.preventDefault();
    }

    _onMouseMove(e) {
        const mm = this._canvasMmFromEvent(e);
        const el = this._activeEl;
        if (!el) return;

        if (this._dragging) {
            let dx = mm.x - this._dragStartMm.x;
            let dy = mm.y - this._dragStartMm.y;
            let newX = this._snap(this._dragElStart.x + dx);
            let newY = this._snap(this._dragElStart.y + dy);
            // Clamp to canvas
            newX = Math.max(0, Math.min(newX, this.labelWidthMm - 1));
            newY = Math.max(0, Math.min(newY, this.labelHeightMm - 1));
            el.x = Math.round(newX * 1000) / 1000;
            el.y = Math.round(newY * 1000) / 1000;
            this._updateElementPosition(el);
        }

        if (this._resizing && el.box && this._dragElSizeStart) {
            const dx = mm.x - this._dragStartMm.x;
            const dy = mm.y - this._dragStartMm.y;
            const dir = this._resizeDir;
            let newW = this._dragElSizeStart.w;
            let newH = this._dragElSizeStart.h;

            if (dir === 'e' || dir === 'se') {
                newW = Math.max(0.25, this._snap(this._dragElSizeStart.w + dx));
            }
            if (dir === 's' || dir === 'se') {
                newH = Math.max(0.25, this._snap(this._dragElSizeStart.h + dy));
            }
            el.box.size[0] = Math.round(newW * 1000) / 1000;
            el.box.size[1] = Math.round(newH * 1000) / 1000;
            this._renderElement(el);
            // Re-select to show handles
            const dom = this.canvasEl.querySelector('[data-el-id="' + el.id + '"]');
            if (dom) {
                dom.classList.add('selected');
                this._addResizeHandles(dom, el);
            }
        }
    }

    _onMouseUp(e) {
        this._dragging = false;
        this._resizing = false;
        this._resizeDir = null;
        this._activeEl = null;
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        // Update properties display
        if (this.selectedElement) this._renderProperties();
    }

    _updateElementPosition(el) {
        const dom = this.canvasEl.querySelector('[data-el-id="' + el.id + '"]');
        if (dom) {
            dom.style.left = this._mmToPx(el.x) + 'px';
            dom.style.top = this._mmToPx(el.y) + 'px';
        }
    }

    // ── Properties panel ────────────────────────────────────────────────
    _renderProperties() {
        const el = this.selectedElement;
        if (!el) {
            this.propsContentEl.innerHTML = '<p class="text-muted small">Select an element to edit its properties</p>';
            return;
        }

        let html = '';
        // Position (common to all)
        html += '<div class="mb-2">';
        html += '<label class="form-label fw-semibold mb-1 small">Position (mm)</label>';
        html += '<div class="input-group input-group-sm">';
        html += '<span class="input-group-text" style="width:30px">X</span>';
        html += '<input type="number" class="form-control" id="prop-x" step="0.125" value="' + el.x + '">';
        html += '<span class="input-group-text" style="width:30px">Y</span>';
        html += '<input type="number" class="form-control" id="prop-y" step="0.125" value="' + el.y + '">';
        html += '</div></div>';

        if (el.type === 'text') {
            html += this._textPropertiesHtml(el);
        } else if (el.type === 'box') {
            html += this._boxPropertiesHtml(el);
        } else if (el.type === 'barcode') {
            html += this._barcodePropertiesHtml(el);
        }

        html += '<div class="mt-2"><button id="prop-apply" class="btn btn-sm btn-primary w-100">Apply</button></div>';

        this.propsContentEl.innerHTML = html;

        // Bind apply button
        document.getElementById('prop-apply').addEventListener('click', () => {
            this._applyProperties(el);
        });

        // Also apply on Enter in inputs
        this.propsContentEl.querySelectorAll('input, select').forEach(inp => {
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._applyProperties(el);
                }
            });
        });
    }

    _textPropertiesHtml(el) {
        const t = el.text;
        let h = '';
        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Content</label>';
        h += '<input type="text" class="form-control form-control-sm" id="prop-content" value="' + this._esc(t.content) + '"></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Font Family</label>';
        h += '<select class="form-select form-select-sm" id="prop-fontFamily">';
        for (let i = 0; i <= 8; i++) {
            h += '<option value="' + i + '"' + (t.fontFamily === '' + i ? ' selected' : '') + '>Font ' + i + '</option>';
        }
        h += '<option value="A"' + (t.fontFamily === 'A' ? ' selected' : '') + '>Font A</option>';
        h += '</select></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Font Size (mm)</label>';
        h += '<div class="input-group input-group-sm">';
        h += '<span class="input-group-text" style="width:30px">W</span>';
        h += '<input type="number" class="form-control" id="prop-fontW" step="0.125" value="' + t.fontSize[0] + '">';
        h += '<span class="input-group-text" style="width:30px">H</span>';
        h += '<input type="number" class="form-control" id="prop-fontH" step="0.125" value="' + t.fontSize[1] + '">';
        h += '</div></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Orientation</label>';
        h += '<select class="form-select form-select-sm" id="prop-orientation">';
        ['Normal', 'Rotated90', 'Rotated180', 'Rotated270'].forEach(o => {
            h += '<option value="' + o + '"' + (t.orientation === o ? ' selected' : '') + '>' + o + '</option>';
        });
        h += '</select></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Variable Names <span class="text-muted">(comma-separated)</span></label>';
        h += '<input type="text" class="form-control form-control-sm" id="prop-varNames" value="' + this._esc((t.variableNames || []).join(', ')) + '"></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Default Values <span class="text-muted">(comma-separated)</span></label>';
        h += '<input type="text" class="form-control form-control-sm" id="prop-defVals" value="' + this._esc((t.defaultVariableValues || []).join(', ')) + '"></div>';

        return h;
    }

    _boxPropertiesHtml(el) {
        const b = el.box;
        let h = '';
        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Size (mm)</label>';
        h += '<div class="input-group input-group-sm">';
        h += '<span class="input-group-text" style="width:30px">W</span>';
        h += '<input type="number" class="form-control" id="prop-boxW" step="0.125" min="0.25" value="' + b.size[0] + '">';
        h += '<span class="input-group-text" style="width:30px">H</span>';
        h += '<input type="number" class="form-control" id="prop-boxH" step="0.125" min="0.25" value="' + b.size[1] + '">';
        h += '</div></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Thickness (mm)</label>';
        h += '<input type="number" class="form-control form-control-sm" id="prop-thickness" step="0.125" min="0.25" value="' + b.thickness + '"></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Color</label>';
        h += '<select class="form-select form-select-sm" id="prop-boxColor">';
        ['Black', 'White'].forEach(c => {
            h += '<option value="' + c + '"' + (b.color === c ? ' selected' : '') + '>' + c + '</option>';
        });
        h += '</select></div>';

        return h;
    }

    _barcodePropertiesHtml(el) {
        const bc = el.barcode;
        let h = '';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Content</label>';
        h += '<input type="text" class="form-control form-control-sm" id="prop-bcContent" value="' + this._esc(bc.content) + '"></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Barcode Type</label>';
        h += '<select class="form-select form-select-sm" id="prop-bcType">';
        const bcTypes = ['Code128', 'Code39', 'Code93', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'Interleaved2of5', 'QRCode', 'DataMatrix', 'PDF417', 'Codabar', 'MSI', 'Postnet', 'Planet', 'USPS4CB'];
        bcTypes.forEach(t => {
            h += '<option value="' + t + '"' + (bc.barcodeType === t ? ' selected' : '') + '>' + t + '</option>';
        });
        h += '</select></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Size (mm)</label>';
        h += '<div class="input-group input-group-sm">';
        h += '<span class="input-group-text" style="width:56px">Width</span>';
        h += '<input type="number" class="form-control" id="prop-bcSizeW" step="0.125" value="' + bc.size[0] + '">';
        h += '<span class="input-group-text" style="width:56px">Height</span>';
        h += '<input type="number" class="form-control" id="prop-bcSizeH" step="0.125" value="' + bc.size[1] + '">';
        h += '</div></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Orientation</label>';
        h += '<select class="form-select form-select-sm" id="prop-bcOrientation">';
        ['Normal', 'Rotated90', 'Rotated180', 'Rotated270'].forEach(o => {
            h += '<option value="' + o + '"' + (bc.orientation === o ? ' selected' : '') + '>' + o + '</option>';
        });
        h += '</select></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Width Ratio</label>';
        h += '<input type="number" class="form-control form-control-sm" id="prop-bcWidthRatio" step="0.125" value="' + bc.widthRatio + '"></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Magnification Factor</label>';
        h += '<input type="number" class="form-control form-control-sm" id="prop-bcMagFactor" step="1" min="1" max="10" value="' + bc.magnificationFactor + '"></div>';

        // Checkboxes
        h += '<div class="mb-1"><div class="form-check form-check-inline"><input type="checkbox" class="form-check-input" id="prop-bcHRT"' + (bc.showHumanReadableText ? ' checked' : '') + '>';
        h += '<label class="form-check-label small" for="prop-bcHRT">Human Readable</label></div></div>';

        h += '<div class="mb-1"><div class="form-check form-check-inline"><input type="checkbox" class="form-check-input" id="prop-bcTextAbove"' + (bc.showTextAboveBarcode ? ' checked' : '') + '>';
        h += '<label class="form-check-label small" for="prop-bcTextAbove">Text Above</label></div></div>';

        h += '<div class="mb-2"><div class="form-check form-check-inline"><input type="checkbox" class="form-check-input" id="prop-bcCheckDigit"' + (bc.checkDigit ? ' checked' : '') + '>';
        h += '<label class="form-check-label small" for="prop-bcCheckDigit">Check Digit</label></div></div>';

        // Advanced options (collapsible)
        h += '<div class="mb-2">';
        h += '<a class="small" data-bs-toggle="collapse" href="#advancedBcProps" role="button">Advanced Options</a>';
        h += '<div class="collapse" id="advancedBcProps">';

        h += '<div class="mb-1 mt-1"><label class="form-label fw-semibold mb-1 small">Barcode Mode</label>';
        h += '<select class="form-select form-select-sm" id="prop-bcMode">';
        ['NoMode', 'ModeA', 'ModeB', 'ModeC', 'ModeU', 'ModeD'].forEach(m => {
            h += '<option value="' + m + '"' + (bc.barcodeMode === m ? ' selected' : '') + '>' + m + '</option>';
        });
        h += '</select></div>';

        h += '<div class="mb-1"><label class="form-label fw-semibold mb-1 small">Error Correction</label>';
        h += '<select class="form-select form-select-sm" id="prop-bcECL">';
        ['L', 'M', 'Q', 'H'].forEach(l => {
            h += '<option value="' + l + '"' + (bc.errorCorrectionLevel === l ? ' selected' : '') + '>' + l + '</option>';
        });
        h += '</select></div>';

        h += '<div class="mb-1"><label class="form-label fw-semibold mb-1 small">QR Code Model</label>';
        h += '<input type="number" class="form-control form-control-sm" id="prop-bcQRModel" min="1" max="2" value="' + bc.qrCodeModel + '"></div>';

        h += '<div class="mb-1"><label class="form-label fw-semibold mb-1 small">Mask Value</label>';
        h += '<input type="number" class="form-control form-control-sm" id="prop-bcMask" min="0" max="7" value="' + bc.maskValue + '"></div>';

        h += '</div></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Variable Names <span class="text-muted">(comma-separated)</span></label>';
        h += '<input type="text" class="form-control form-control-sm" id="prop-bcVarNames" value="' + this._esc((bc.variableNames || []).join(', ')) + '"></div>';

        h += '<div class="mb-2"><label class="form-label fw-semibold mb-1 small">Default Values <span class="text-muted">(comma-separated)</span></label>';
        h += '<input type="text" class="form-control form-control-sm" id="prop-bcDefVals" value="' + this._esc((bc.defaultVariableValues || []).join(', ')) + '"></div>';

        return h;
    }

    _applyProperties(el) {
        const getVal = (id) => { const e = document.getElementById(id); return e ? e.value : null; };
        const getCheck = (id) => { const e = document.getElementById(id); return e ? e.checked : false; };

        // Position
        el.x = parseFloat(getVal('prop-x')) || 0;
        el.y = parseFloat(getVal('prop-y')) || 0;

        if (el.type === 'text') {
            el.text.content = getVal('prop-content') || '';
            el.text.fontFamily = getVal('prop-fontFamily') || '0';
            el.text.fontSize = [parseFloat(getVal('prop-fontW')) || 3.75, parseFloat(getVal('prop-fontH')) || 3.75];
            el.text.orientation = getVal('prop-orientation') || 'Normal';
            el.text.variableNames = this._splitComma(getVal('prop-varNames'));
            el.text.defaultVariableValues = this._splitComma(getVal('prop-defVals'));
        } else if (el.type === 'box') {
            el.box.size = [parseFloat(getVal('prop-boxW')) || 0.25, parseFloat(getVal('prop-boxH')) || 0.25];
            el.box.thickness = parseFloat(getVal('prop-thickness')) || 0.25;
            el.box.color = getVal('prop-boxColor') || 'Black';
        } else if (el.type === 'barcode') {
            el.barcode.content = getVal('prop-bcContent') || '';
            el.barcode.barcodeType = getVal('prop-bcType') || 'Code128';
            el.barcode.size = [parseFloat(getVal('prop-bcSizeW')) || 0.25, parseFloat(getVal('prop-bcSizeH')) || 15];
            el.barcode.orientation = getVal('prop-bcOrientation') || 'Normal';
            el.barcode.widthRatio = parseFloat(getVal('prop-bcWidthRatio')) || 0.25;
            el.barcode.magnificationFactor = parseInt(getVal('prop-bcMagFactor')) || 10;
            el.barcode.showHumanReadableText = getCheck('prop-bcHRT');
            el.barcode.showTextAboveBarcode = getCheck('prop-bcTextAbove');
            el.barcode.checkDigit = getCheck('prop-bcCheckDigit');
            el.barcode.barcodeMode = getVal('prop-bcMode') || 'NoMode';
            el.barcode.errorCorrectionLevel = getVal('prop-bcECL') || 'H';
            el.barcode.qrCodeModel = parseInt(getVal('prop-bcQRModel')) || 2;
            el.barcode.maskValue = parseInt(getVal('prop-bcMask')) || 7;
            el.barcode.variableNames = this._splitComma(getVal('prop-bcVarNames'));
            el.barcode.defaultVariableValues = this._splitComma(getVal('prop-bcDefVals'));
        }

        // Re-render the element
        this._renderElement(el);
        this.selectElement(el);
    }

    // ── Export / Import ─────────────────────────────────────────────────
    exportTemplate() {
        const templateElements = this.elements.map(el => {
            const out = {
                position: [el.x, el.y],
                templateElementType: el.type
            };

            if (el.type === 'text') {
                const t = el.text;
                out.text = {
                    content: t.content,
                    fontFamily: t.fontFamily,
                    fontSize: t.fontSize.slice(),
                    orientation: t.orientation
                };
                if (t.variableNames && t.variableNames.length > 0) {
                    out.text.variableNames = t.variableNames.slice();
                }
                if (t.defaultVariableValues && t.defaultVariableValues.length > 0) {
                    out.text.defaultVariableValues = t.defaultVariableValues.slice();
                }
            } else if (el.type === 'box') {
                const b = el.box;
                out.box = {
                    size: b.size.slice(),
                    thickness: b.thickness,
                    color: b.color
                };
            } else if (el.type === 'barcode') {
                const bc = el.barcode;
                out.barcode = {
                    content: bc.content,
                    barcodeType: bc.barcodeType,
                    size: bc.size.slice(),
                    orientation: bc.orientation,
                    widthRatio: bc.widthRatio,
                    magnificationFactor: bc.magnificationFactor,
                    showHumanReadableText: bc.showHumanReadableText,
                    showTextAboveBarcode: bc.showTextAboveBarcode,
                    checkDigit: bc.checkDigit,
                    barcodeMode: bc.barcodeMode,
                    errorCorrectionLevel: bc.errorCorrectionLevel,
                    qrCodeModel: bc.qrCodeModel,
                    maskValue: bc.maskValue
                };
                if (bc.variableNames && bc.variableNames.length > 0) {
                    out.barcode.variableNames = bc.variableNames.slice();
                }
                if (bc.defaultVariableValues && bc.defaultVariableValues.length > 0) {
                    out.barcode.defaultVariableValues = bc.defaultVariableValues.slice();
                }
            }

            return out;
        });

        return {
            zplTemplates: [{
                templateName: this.templateName || 'untitled',
                templateElements: templateElements
            }]
        };
    }

    importTemplate(json) {
        let data;
        try {
            data = typeof json === 'string' ? JSON.parse(json) : json;
        } catch (e) {
            throw new Error('Invalid JSON: ' + e.message);
        }

        // Accept either { zplTemplates: [{ templateName, templateElements }] }
        // or { templateName, templateElements }
        let template;
        if (data.zplTemplates && Array.isArray(data.zplTemplates) && data.zplTemplates.length > 0) {
            template = data.zplTemplates[0];
        } else if (data.templateElements) {
            template = data;
        } else {
            throw new Error('No template found in JSON. Expected "zplTemplates" array or "templateElements" array.');
        }

        // Clear existing
        this.elements = [];
        this.selectedElement = null;
        this.nextId = 1;

        this.templateName = template.templateName || '';
        const nameInput = document.getElementById('template-name');
        if (nameInput) nameInput.value = this.templateName;

        (template.templateElements || []).forEach(te => {
            if (te.templateElementType === 'text') {
                this.addTextElement({
                    x: te.position[0],
                    y: te.position[1],
                    content: te.text.content,
                    fontFamily: te.text.fontFamily,
                    fontSize: te.text.fontSize,
                    orientation: te.text.orientation,
                    variableNames: te.text.variableNames,
                    defaultVariableValues: te.text.defaultVariableValues
                });
            } else if (te.templateElementType === 'box') {
                this.addBoxElement({
                    x: te.position[0],
                    y: te.position[1],
                    size: te.box.size,
                    thickness: te.box.thickness,
                    color: te.box.color
                });
            } else if (te.templateElementType === 'barcode') {
                const bc = te.barcode;
                this.addBarcodeElement({
                    x: te.position[0],
                    y: te.position[1],
                    content: bc.content,
                    barcodeType: bc.barcodeType,
                    size: bc.size,
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
                    variableNames: bc.variableNames,
                    defaultVariableValues: bc.defaultVariableValues
                });
            }
        });

        this.selectElement(null);
        this.renderAll();
    }

    clearAll() {
        this.elements = [];
        this.selectedElement = null;
        this.nextId = 1;
        this.renderAll();
        this._renderProperties();
    }

    // ── ZPL Code Generation ─────────────────────────────────────────────
    /**
     * Generate ZPL code from the current template.
     * Converts mm positions/sizes to dots using the configured density (dpmm).
     */
    generateZPL() {
        const density = parseInt(this.configs.density) || 8; // dots per mm
        const mmToDots = (mm) => Math.round(mm * density);

        const orientationMap = { 'Normal': 'N', 'Rotated90': 'R', 'Rotated180': 'I', 'Rotated270': 'B' };

        let zpl = '^XA\n';
        zpl += '^PW' + mmToDots(this.labelWidthMm) + '\n';
        zpl += '^LL' + mmToDots(this.labelHeightMm) + '\n';

        for (const el of this.elements) {
            const xDots = mmToDots(el.x);
            const yDots = mmToDots(el.y);

            if (el.type === 'text') {
                const t = el.text;
                const orient = orientationMap[t.orientation] || 'N';
                const hDots = mmToDots(t.fontSize[1]);
                const wDots = mmToDots(t.fontSize[0]);
                zpl += '^FO' + xDots + ',' + yDots;
                zpl += '^A' + t.fontFamily + orient + ',' + hDots + ',' + wDots;
                zpl += '^FD' + t.content + '^FS\n';
            } else if (el.type === 'box') {
                const b = el.box;
                const wDots = mmToDots(b.size[0]);
                const hDots = mmToDots(b.size[1]);
                const thickDots = Math.max(1, mmToDots(b.thickness));
                const color = b.color === 'White' ? 'W' : 'B';
                zpl += '^FO' + xDots + ',' + yDots;
                zpl += '^GB' + wDots + ',' + hDots + ',' + thickDots + ',' + color + '^FS\n';
            } else if (el.type === 'barcode') {
                zpl += this._generateBarcodeZPL(el, xDots, yDots, mmToDots, orientationMap);
            }
        }

        zpl += '^XZ';
        return zpl;
    }

    _generateBarcodeZPL(el, xDots, yDots, mmToDots, orientationMap) {
        const bc = el.barcode;
        const orient = orientationMap[bc.orientation] || 'N';
        const hDots = mmToDots(bc.size[1]);
        const moduleWidth = Math.max(1, Math.round(bc.widthRatio * (parseInt(this.configs.density) || 8)));
        const hrt = bc.showHumanReadableText ? 'Y' : 'N';
        let zpl = '';

        zpl += '^FO' + xDots + ',' + yDots;

        switch (bc.barcodeType) {
            case 'Code128':
                zpl += '^BY' + moduleWidth;
                zpl += '^BC' + orient + ',' + hDots + ',' + hrt + ',N,N';
                if (bc.barcodeMode && bc.barcodeMode !== 'NoMode') {
                    const modeChar = bc.barcodeMode.replace('Mode', '>:').charAt(bc.barcodeMode.length - 1);
                    zpl += '^FD>' + modeChar + bc.content + '^FS\n';
                } else {
                    zpl += '^FD' + bc.content + '^FS\n';
                }
                break;
            case 'Code39':
                zpl += '^BY' + moduleWidth;
                zpl += '^B3' + orient + ',' + (bc.checkDigit ? 'Y' : 'N') + ',' + hDots + ',' + hrt + ',N';
                zpl += '^FD' + bc.content + '^FS\n';
                break;
            case 'Code93':
                zpl += '^BY' + moduleWidth;
                zpl += '^BA' + orient + ',' + hDots + ',' + hrt + ',N';
                zpl += '^FD' + bc.content + '^FS\n';
                break;
            case 'EAN13':
                zpl += '^BY' + moduleWidth;
                zpl += '^BE' + orient + ',' + hDots + ',' + hrt + ',N';
                zpl += '^FD' + bc.content + '^FS\n';
                break;
            case 'EAN8':
                zpl += '^BY' + moduleWidth;
                zpl += '^B8' + orient + ',' + hDots + ',' + hrt + ',N';
                zpl += '^FD' + bc.content + '^FS\n';
                break;
            case 'UPCA':
                zpl += '^BY' + moduleWidth;
                zpl += '^BU' + orient + ',' + hDots + ',' + hrt + ',N';
                zpl += '^FD' + bc.content + '^FS\n';
                break;
            case 'UPCE':
                zpl += '^BY' + moduleWidth;
                zpl += '^B9' + orient + ',' + hDots + ',' + hrt + ',N';
                zpl += '^FD' + bc.content + '^FS\n';
                break;
            case 'Interleaved2of5':
                zpl += '^BY' + moduleWidth;
                zpl += '^B2' + orient + ',' + hDots + ',' + hrt + ',N';
                zpl += '^FD' + bc.content + '^FS\n';
                break;
            case 'QRCode': {
                const mag = bc.magnificationFactor || 10;
                const ecl = ({ 'L': 'L', 'M': 'M', 'Q': 'Q', 'H': 'H' })[bc.errorCorrectionLevel] || 'H';
                const model = bc.qrCodeModel || 2;
                zpl += '^BQ' + orient + ',' + model + ',' + mag;
                zpl += '^FD' + ecl + 'A,' + bc.content + '^FS\n';
                break;
            }
            case 'DataMatrix': {
                const orient2 = orient;
                const quality = 200; // ECC 200
                zpl += '^BX' + orient2 + ',' + (bc.magnificationFactor || 10) + ',' + quality;
                zpl += '^FD' + bc.content + '^FS\n';
                break;
            }
            case 'PDF417':
                zpl += '^BY' + moduleWidth;
                zpl += '^B7' + orient + ',' + hDots + ',0,0,0,N';
                zpl += '^FD' + bc.content + '^FS\n';
                break;
            default:
                // Generic fallback: Code 128
                zpl += '^BY' + moduleWidth;
                zpl += '^BC' + orient + ',' + hDots + ',' + hrt + ',N,N';
                zpl += '^FD' + bc.content + '^FS\n';
                break;
        }
        return zpl;
    }

    /**
     * Generate ZPL and render preview via Labelary API.
     * Returns a promise that resolves with the image blob.
     */
    async previewViaLabelary() {
        const zplCode = this.generateZPL();
        const density = this.configs.density || '8';
        const factor = (this.configs.unit === '1') ? 1 : (this.configs.unit === '2' ? 2.54 : (this.configs.unit === '3' ? 25.4 : 96.5));
        const width = Math.round(parseFloat(this.configs.width) * 1000 / factor) / 1000;
        const height = Math.round(parseFloat(this.configs.height) * 1000 / factor) / 1000;

        const apiUrl = 'http://api.labelary.com/v1/printers/' + density + 'dpmm/labels/' +
            (width > 15.0 ? 15 : width) + 'x' + height + '/0/';

        const response = await fetch(apiUrl, {
            method: 'POST',
            body: zplCode,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error('Labelary API error (status ' + response.status + '): ' + text);
        }

        return { blob: await response.blob(), zplCode };
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    _esc(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    _splitComma(str) {
        if (!str || !str.trim()) return [];
        return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
}
