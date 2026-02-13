const express = require('express');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { Server: SocketIO } = require('socket.io');
const cors = require('cors');
const ZplCommands = require('./zpl-commands');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/plain', limit: '10mb' }));

const httpServer = http.createServer(app);
const io = new SocketIO(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── State ────────────────────────────────────────────────────────────
const defaults = {
  isOn: false,
  density: '8',
  width: '4',
  height: '6',
  unit: '1',
  host: '0.0.0.0',
  port: '9100',
  bufferSize: '4096',
  keepTcpSocket: true,
  saveLabels: false,
  filetype: '3',
  path: '/tmp/labels',
  counter: 0,
  zplHeadOpen: false,
  zplPaperOut: false,
  zplRibbonOut: false,
  zplCutterFault: false,
  zplHeadTooHot: false,
  zplMotorOverheat: false,
  zplPrinterPaused: false,
  zplPaperJam: false,
  zplRewindFault: false,
  hqesMediaOut: false,
  hqesRibbonOut: false,
  hqesHeadOpen: false,
  hqesCutterFault: false,
  hqesPrintheadOverTemp: false,
  hqesMotorOverTemp: false,
  hqesBadPrintheadElement: false,
  hqesPrintheadDetectionError: false,
  hqesMediaNearEnd: false,
  hqesRibbonNearEnd: false,
  hqesReplacePrinthead: false,
  hqesCleanPrinthead: false,
};

const CONFIG_FILE = path.join(__dirname, 'config.json');

function generatePrinterId() {
  return 'printer-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

      // Migration: old flat config → new multi-printer format
      if (!data.printers) {
        const printer = { id: 'printer-1', name: 'Printer 1', ...defaults, ...data };
        return { printers: [printer], activePrinterId: 'printer-1' };
      }

      // Ensure each printer has all default keys
      data.printers = data.printers.map((p) => ({ ...defaults, ...p }));
      return data;
    }
  } catch (e) {
    console.error('Failed to load config:', e.message);
  }
  return {
    printers: [{ id: 'printer-1', name: 'Printer 1', ...defaults }],
    activePrinterId: 'printer-1',
  };
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e.message);
  }
}

let state = loadConfig();

// Per-printer runtime state
let tcpServers = {};          // printerId → net.Server
let labelHistories = {};      // printerId → label[]
let zplCommandInstances = {}; // printerId → ZplCommands

// Initialize runtime state for each printer
state.printers.forEach((printer) => {
  labelHistories[printer.id] = [];
  zplCommandInstances[printer.id] = new ZplCommands(printer);
});

const MAX_LABELS = 50;

// ── Helpers ──────────────────────────────────────────────────────────
function getPrinter(printerId) {
  return state.printers.find((p) => p.id === printerId);
}

function getNextAvailablePort() {
  const usedPorts = state.printers.map((p) => parseInt(p.port));
  let port = 9100;
  while (usedPorts.includes(port)) port++;
  return String(port);
}

function base64DecodeUnicode(base64) {
  const binary = Buffer.from(base64, 'base64').toString('binary');
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return Buffer.from(bytes).toString('utf8');
}

function emitNotification(text, type = 'info', printerId = null) {
  io.emit('notification', { text, type, timestamp: Date.now(), printerId });
}

function getCounter(printerId) {
  const printer = getPrinter(printerId);
  let counter = parseInt(printer.counter) || 0;
  printer.counter = ++counter;
  saveConfig();
  return counter;
}

function padLeft(num, width, ch = '0') {
  let s = String(num);
  while (s.length < width) s = ch + s;
  return s;
}

function getTcpStatuses() {
  return Object.fromEntries(
    state.printers.map((p) => [
      p.id,
      { running: !!tcpServers[p.id], host: p.host, port: p.port },
    ])
  );
}

// ── Label rendering via Labelary ─────────────────────────────────────
async function renderLabel(zplData, width, height, density) {
  const apiUrl = `http://api.labelary.com/v1/printers/${density}dpmm/labels/${width > 15 ? 15 : width}x${height}/0/`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: zplData,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Labelary API error (${response.status}): ${text}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType: 'image/png' };
}

async function fetchPdf(zplData, width, height, density) {
  const apiUrl = `http://api.labelary.com/v1/printers/${density}dpmm/labels/${width > 15 ? 15 : width}x${height}/0/`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: zplData,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/pdf',
    },
  });

  if (!response.ok) {
    throw new Error(`Labelary PDF error (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ── ZPL Processing (per-printer) ────────────────────────────────────
async function processZplForPrinter(printerId, data) {
  const printer = getPrinter(printerId);
  if (!printer) return null;
  const zplCmds = zplCommandInstances[printerId];
  if (!zplCmds) return null;

  let textData = data.toString('utf8');

  const trimmed = textData.trim();
  if (!trimmed.startsWith('~') && !trimmed.startsWith('^')) {
    try {
      const decoded = base64DecodeUnicode(trimmed);
      if (decoded.includes('~') || decoded.includes('^')) {
        textData = decoded;
      }
    } catch (e) {
      // Not base64
    }
  }

  // Fast path: exact single command match
  const cmdResult = zplCmds.matchCommand(textData);
  if (cmdResult) {
    if (cmdResult.action) {
      cmdResult.action(printer, (text, type) => emitNotification(text, type, printerId));
      emitNotification(`Command ${textData.trim()} executed: ${cmdResult.message}`, 'info', printerId);
      return cmdResult.response ? Buffer.from(cmdResult.response, 'utf8') : null;
    }
    const response = zplCmds.getResponse(textData);
    emitNotification('Response sent for internal command', 'info', printerId);
    return Buffer.from(response, 'utf8');
  }

  // Extract tilde commands from mixed input
  const { commands, labelData } = zplCmds.extractCommands(textData);

  let responseBuffers = [];

  for (const cmd of commands) {
    const result = zplCmds.matchCommand(cmd);
    if (result) {
      if (result.action) {
        result.action(printer, (text, type) => emitNotification(text, type, printerId));
        emitNotification(`Command ${cmd} executed: ${result.message}`, 'info', printerId);
      } else {
        const response = zplCmds.getResponse(cmd);
        emitNotification('Response sent for internal command', 'info', printerId);
        responseBuffers.push(Buffer.from(response, 'utf8'));
      }
    }
  }

  const dataToRender = commands.length > 0 ? labelData : textData;
  if (dataToRender && dataToRender.trim().length > 0) {
    await renderLabelsForPrinter(printerId, dataToRender);
  }

  if (responseBuffers.length > 0) {
    return Buffer.concat(responseBuffers);
  }
  return null;
}

async function renderLabelsForPrinter(printerId, data) {
  const printer = getPrinter(printerId);
  if (!printer) return;

  const zpls = data.split(/\^XZ|\^xz/);
  const factor =
    printer.unit === '1' ? 1 : printer.unit === '2' ? 2.54 : printer.unit === '3' ? 25.4 : 96.5;
  const width = Math.round((parseFloat(printer.width) * 1000) / factor) / 1000;
  const height = Math.round((parseFloat(printer.height) * 1000) / factor) / 1000;

  if (zpls.length > 1 && zpls[zpls.length - 1].trim() === '') {
    zpls.pop();
  }

  for (let zpl of zpls) {
    if (!zpl || !zpl.trim().length) continue;

    zpl = zpl.replace(/^\s+/, '') + '^XZ';

    try {
      const { buffer } = await renderLabel(zpl, width, height, printer.density);
      const base64 = buffer.toString('base64');
      const label = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        image: `data:image/png;base64,${base64}`,
        zpl: zpl,
        timestamp: new Date().toISOString(),
        width,
        height,
        printerId,
      };

      if (!labelHistories[printerId]) labelHistories[printerId] = [];
      labelHistories[printerId].unshift(label);
      if (labelHistories[printerId].length > MAX_LABELS) {
        labelHistories[printerId] = labelHistories[printerId].slice(0, MAX_LABELS);
      }

      io.emit('label', label);
      emitNotification('Label rendered successfully', 'success', printerId);

      // Save if configured
      if (printer.saveLabels) {
        const counter = getCounter(printerId);
        const savePath = printer.path || '/tmp/labels';
        try {
          if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

          if (printer.filetype === '1') {
            const fileName = `LBL${padLeft(counter, 6)}.png`;
            fs.writeFileSync(path.join(savePath, fileName), buffer);
            emitNotification(`Label ${fileName} saved`, 'success', printerId);
          } else if (printer.filetype === '2') {
            const pdfBuffer = await fetchPdf(zpl, width, height, printer.density);
            const fileName = `LBL${padLeft(counter, 6)}.pdf`;
            fs.writeFileSync(path.join(savePath, fileName), pdfBuffer);
            emitNotification(`Label ${fileName} saved`, 'success', printerId);
          } else if (printer.filetype === '3') {
            const fileName = `LBL${padLeft(counter, 6)}.raw`;
            fs.writeFileSync(path.join(savePath, fileName), zpl);
            emitNotification(`Label ${fileName} saved`, 'success', printerId);
          }
        } catch (e) {
          emitNotification(`Save error: ${e.message}`, 'error', printerId);
        }
      }
    } catch (e) {
      console.error('Render error:', e.message);
      emitNotification(`Render error: ${e.message}`, 'error', printerId);
    }
  }
}

// ── TCP Server (per-printer) ────────────────────────────────────────
function startTcpServer(printerId) {
  const printer = getPrinter(printerId);
  if (!printer || tcpServers[printerId]) return;

  const zplCmds = new ZplCommands(printer);
  zplCommandInstances[printerId] = zplCmds;

  const server = net.createServer();
  server.listen(parseInt(printer.port), printer.host);
  tcpServers[printerId] = server;

  emitNotification(`TCP Printer "${printer.name}" started on ${printer.host}:${printer.port}`, 'success', printerId);
  io.emit('tcp-status', { printerId, running: true, host: printer.host, port: printer.port });

  server.on('connection', (sock) => {
    const clientInfo = `${sock.remoteAddress}:${sock.remotePort}`;
    console.log(`TCP CONNECTED [${printer.name}]:`, clientInfo);
    io.emit('tcp-connection', { printerId, client: clientInfo, event: 'connected' });

    let buffer = Buffer.alloc(0);
    let processTimeout = null;
    const keepConnection = printer.keepTcpSocket;

    async function processData(data) {
      let textView = data.toString('utf8');

      const regex = /POST.*\r\n\r\n/gs;
      if (regex.test(textView)) {
        const response = JSON.stringify({ success: true });
        sock.write(
          'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ' +
            Buffer.byteLength(response) +
            '\r\n\r\n' +
            response
        );
        sock.end();
        textView = textView.replace(regex, '');
        data = Buffer.from(textView, 'utf8');
      }

      if (
        textView.includes('Host:') &&
        textView.includes('Connection: keep-alive') &&
        textView.includes('HTTP')
      ) {
        const responseError = JSON.stringify({
          success: false,
          message: 'Ajax call could not be handled',
        });
        try {
          sock.write(
            'HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nContent-Length: ' +
              Buffer.byteLength(responseError) +
              '\r\n\r\n' +
              responseError
          );
          sock.end();
        } catch (error) {}
        return;
      }

      try {
        const response = await processZplForPrinter(printerId, data);
        if (response) sock.write(response);

        if (!keepConnection) {
          sock.end();
        } else {
          buffer = Buffer.alloc(0);
        }
      } catch (err) {
        console.error('ZPL processing error:', err);
        emitNotification(`Error: ${err.message}`, 'error', printerId);
        if (!keepConnection) {
          sock.end();
        } else {
          buffer = Buffer.alloc(0);
        }
      }
    }

    sock.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      emitNotification(
        `${buffer.length} bytes received from ${sock.remoteAddress}:${sock.remotePort}`,
        'info',
        printerId
      );

      if (processTimeout) clearTimeout(processTimeout);
      processTimeout = setTimeout(() => {
        const dataToProcess = buffer;
        processData(dataToProcess);
      }, 100);
    });

    sock.on('close', () => {
      io.emit('tcp-connection', { printerId, client: clientInfo, event: 'disconnected' });
    });

    sock.on('error', (err) => {
      console.error('Socket error:', err.message);
    });
  });

  server.on('error', (err) => {
    emitNotification(`TCP Server error on "${printer.name}": ${err.message}`, 'error', printerId);
    io.emit('tcp-status', { printerId, running: false, error: err.message });
    delete tcpServers[printerId];
  });
}

function stopTcpServer(printerId) {
  if (!tcpServers[printerId]) return;
  const printer = getPrinter(printerId);
  tcpServers[printerId].close();
  delete tcpServers[printerId];
  emitNotification(`TCP Printer "${printer?.name}" stopped`, 'info', printerId);
  io.emit('tcp-status', { printerId, running: false });
}

// ── REST API: Multi-printer endpoints ───────────────────────────────
app.get('/api/printers', (req, res) => {
  res.json({
    printers: state.printers,
    activePrinterId: state.activePrinterId,
    tcpStatuses: getTcpStatuses(),
  });
});

app.post('/api/printers', (req, res) => {
  const id = generatePrinterId();
  const port = getNextAvailablePort();
  const name = req.body.name || `Printer ${state.printers.length + 1}`;
  const newPrinter = { ...defaults, id, name, port, isOn: false, counter: 0 };

  state.printers.push(newPrinter);
  labelHistories[id] = [];
  zplCommandInstances[id] = new ZplCommands(newPrinter);
  saveConfig();

  io.emit('printers-updated', { printers: state.printers });
  res.json({ success: true, printer: newPrinter });
});

app.delete('/api/printers/:printerId', (req, res) => {
  const { printerId } = req.params;
  if (state.printers.length <= 1) {
    return res.status(400).json({ error: 'Cannot remove the last printer' });
  }

  stopTcpServer(printerId);
  state.printers = state.printers.filter((p) => p.id !== printerId);
  delete labelHistories[printerId];
  delete zplCommandInstances[printerId];

  if (state.activePrinterId === printerId) {
    state.activePrinterId = state.printers[0].id;
  }
  saveConfig();

  io.emit('printers-updated', { printers: state.printers });
  res.json({ success: true });
});

app.get('/api/printers/:printerId/config', (req, res) => {
  const printer = getPrinter(req.params.printerId);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });
  res.json(printer);
});

app.post('/api/printers/:printerId/config', (req, res) => {
  const { printerId } = req.params;
  const printer = getPrinter(printerId);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  const wasRunning = !!tcpServers[printerId];
  const oldPort = printer.port;
  const oldHost = printer.host;

  Object.assign(printer, req.body);
  zplCommandInstances[printerId] = new ZplCommands(printer);
  saveConfig();

  if (wasRunning && (oldPort !== printer.port || oldHost !== printer.host)) {
    stopTcpServer(printerId);
    startTcpServer(printerId);
  }

  io.emit('config-updated', { printerId, configs: printer });
  res.json({ success: true, configs: printer });
});

app.post('/api/printers/:printerId/tcp/start', (req, res) => {
  const { printerId } = req.params;
  startTcpServer(printerId);
  const printer = getPrinter(printerId);
  if (printer) {
    printer.isOn = true;
    saveConfig();
  }
  res.json({ success: true });
});

app.post('/api/printers/:printerId/tcp/stop', (req, res) => {
  const { printerId } = req.params;
  stopTcpServer(printerId);
  const printer = getPrinter(printerId);
  if (printer) {
    printer.isOn = false;
    saveConfig();
  }
  res.json({ success: true });
});

app.get('/api/printers/:printerId/labels', (req, res) => {
  res.json(labelHistories[req.params.printerId] || []);
});

app.delete('/api/printers/:printerId/labels', (req, res) => {
  const { printerId } = req.params;
  const count = (labelHistories[printerId] || []).length;
  labelHistories[printerId] = [];
  io.emit('labels-cleared', { printerId });
  res.json({ success: true, removed: count });
});

app.delete('/api/printers/:printerId/labels/:labelId', (req, res) => {
  const { printerId, labelId } = req.params;
  const labels = labelHistories[printerId] || [];
  const idx = labels.findIndex((l) => l.id === labelId);
  if (idx === -1) return res.status(404).json({ error: 'Label not found' });
  labels.splice(idx, 1);
  io.emit('label-removed', { printerId, labelId });
  res.json({ success: true });
});

app.post('/api/printers/:printerId/print', async (req, res) => {
  try {
    const { printerId } = req.params;
    const printer = getPrinter(printerId);
    if (!printer) return res.status(404).json({ error: 'Printer not found' });

    const zplData = req.body;
    if (!zplData || !zplData.trim()) {
      return res.status(400).json({ error: 'No ZPL data provided' });
    }

    const processed = zplData
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\b/g, '\b');

    await processZplForPrinter(printerId, Buffer.from(processed, 'utf8'));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Backward-compatible REST API (delegates to first printer) ───────
app.get('/api/config', (req, res) => {
  res.json(state.printers[0] || {});
});

app.post('/api/config', (req, res) => {
  const printer = state.printers[0];
  if (!printer) return res.status(404).json({ error: 'No printers' });

  const wasRunning = !!tcpServers[printer.id];
  const oldPort = printer.port;
  const oldHost = printer.host;

  Object.assign(printer, req.body);
  zplCommandInstances[printer.id] = new ZplCommands(printer);
  saveConfig();

  if (wasRunning && (oldPort !== printer.port || oldHost !== printer.host)) {
    stopTcpServer(printer.id);
    startTcpServer(printer.id);
  }

  io.emit('config-updated', { printerId: printer.id, configs: printer });
  res.json({ success: true, configs: printer });
});

app.post('/api/tcp/start', (req, res) => {
  const printer = state.printers[0];
  if (!printer) return res.status(404).json({ error: 'No printers' });
  startTcpServer(printer.id);
  printer.isOn = true;
  saveConfig();
  res.json({ success: true });
});

app.post('/api/tcp/stop', (req, res) => {
  const printer = state.printers[0];
  if (!printer) return res.status(404).json({ error: 'No printers' });
  stopTcpServer(printer.id);
  printer.isOn = false;
  saveConfig();
  res.json({ success: true });
});

app.get('/api/labels', (req, res) => {
  const printer = state.printers[0];
  res.json(printer ? labelHistories[printer.id] || [] : []);
});

app.delete('/api/labels', (req, res) => {
  const printer = state.printers[0];
  if (!printer) return res.json({ success: true, removed: 0 });
  const count = (labelHistories[printer.id] || []).length;
  labelHistories[printer.id] = [];
  io.emit('labels-cleared', { printerId: printer.id });
  res.json({ success: true, removed: count });
});

app.post('/api/print', async (req, res) => {
  try {
    const printer = state.printers[0];
    if (!printer) return res.status(404).json({ error: 'No printers' });

    const zplData = req.body;
    if (!zplData || !zplData.trim()) {
      return res.status(400).json({ error: 'No ZPL data provided' });
    }

    const processed = zplData
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\b/g, '\b');

    await processZplForPrinter(printer.id, Buffer.from(processed, 'utf8'));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/render-preview', async (req, res) => {
  try {
    const { zpl, density, width, height, unit } = req.body;
    const factor = unit === '1' ? 1 : unit === '2' ? 2.54 : unit === '3' ? 25.4 : 96.5;
    const w = Math.round((parseFloat(width) * 1000) / factor) / 1000;
    const h = Math.round((parseFloat(height) * 1000) / factor) / 1000;

    const { buffer } = await renderLabel(zpl, w, h, density);
    const base64 = buffer.toString('base64');
    res.json({ image: `data:image/png;base64,${base64}`, zpl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── WebSocket ────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('WebSocket client connected:', socket.id);

  // Send full multi-printer state on connect
  socket.emit('printers-state', {
    printers: state.printers,
    activePrinterId: state.activePrinterId,
    tcpStatuses: getTcpStatuses(),
    labelHistories: Object.fromEntries(
      state.printers.map((p) => [p.id, labelHistories[p.id] || []])
    ),
  });

  socket.on('disconnect', () => {
    console.log('WebSocket client disconnected:', socket.id);
  });
});

// ── Serve static files in production ─────────────────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

// ── Start ────────────────────────────────────────────────────────────
const HTTP_PORT = process.env.PORT || 4000;
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`ZPL Printer Web Server running on http://0.0.0.0:${HTTP_PORT}`);

  // Auto-start TCP servers for printers that were previously on
  state.printers.forEach((printer) => {
    if (printer.isOn) {
      startTcpServer(printer.id);
    }
  });
});
