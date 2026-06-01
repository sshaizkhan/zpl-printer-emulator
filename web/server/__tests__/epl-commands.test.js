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
