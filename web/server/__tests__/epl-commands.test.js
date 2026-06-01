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

let renderEplLabel;
let canvasAvailable = false;
try {
  renderEplLabel = require('../epl-commands').renderEplLabel;
  require('canvas'); // probe native binary
  canvasAvailable = true;
} catch (_) {
  renderEplLabel = async () => { throw new Error('canvas not available'); };
}

const describeRenderer = canvasAvailable ? describe : describe.skip;

describeRenderer('renderEplLabel', () => {
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
