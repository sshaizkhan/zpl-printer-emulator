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

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...defaults, ...data };
    }
  } catch (e) {
    console.error('Failed to load config:', e.message);
  }
  return { ...defaults };
}

function saveConfig(configs) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e.message);
  }
}

let configs = loadConfig();
const zplCommands = new ZplCommands(configs);
let tcpServer = null;
let labelHistory = [];
const MAX_LABELS = 50;

// ── Helpers ──────────────────────────────────────────────────────────
function base64DecodeUnicode(base64) {
  const binary = Buffer.from(base64, 'base64').toString('binary');
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return Buffer.from(bytes).toString('utf8');
}

function emitNotification(text, type = 'info') {
  io.emit('notification', { text, type, timestamp: Date.now() });
}

function getCounter() {
  let counter = parseInt(configs.counter) || 0;
  configs.counter = ++counter;
  saveConfig(configs);
  return counter;
}

function padLeft(num, width, ch = '0') {
  let s = String(num);
  while (s.length < width) s = ch + s;
  return s;
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

// ── ZPL Processing ───────────────────────────────────────────────────
async function processZpl(data) {
  let textData = data.toString('utf8');

  // Only try base64 decode if data doesn't look like ZPL commands or labels
  // ZPL commands start with ~ or ^, so skip base64 decode for those
  const trimmed = textData.trim();
  if (!trimmed.startsWith('~') && !trimmed.startsWith('^')) {
    try {
      const decoded = base64DecodeUnicode(trimmed);
      // Validate that decoded result looks like ZPL (contains ~ or ^)
      // If it does, use decoded version; otherwise keep original
      if (decoded.includes('~') || decoded.includes('^')) {
        textData = decoded;
      }
    } catch (e) {
      // Not base64
    }
  }

  // Fast path: exact single command match
  const cmdResult = zplCommands.matchCommand(textData);
  if (cmdResult) {
    if (cmdResult.action) {
      cmdResult.action(configs, emitNotification);
      emitNotification(`Command ${textData.trim()} executed: ${cmdResult.message}`);
      return cmdResult.response ? Buffer.from(cmdResult.response, 'utf8') : null;
    }
    const response = zplCommands.getResponse(textData);
    emitNotification('Response sent for internal command');
    return Buffer.from(response, 'utf8');
  }

  // Extract tilde commands from mixed input (e.g., "~JA~HS" or "^XA...^XZ~HS")
  const { commands, labelData } = zplCommands.extractCommands(textData);

  let responseBuffers = [];

  // Process any tilde commands found
  for (const cmd of commands) {
    const result = zplCommands.matchCommand(cmd);
    if (result) {
      if (result.action) {
        result.action(configs, emitNotification);
        emitNotification(`Command ${cmd} executed: ${result.message}`);
      } else {
        const response = zplCommands.getResponse(cmd);
        emitNotification('Response sent for internal command');
        responseBuffers.push(Buffer.from(response, 'utf8'));
      }
    }
  }

  // Process label data (use extracted labelData if commands were found, otherwise original data)
  const dataToRender = commands.length > 0 ? labelData : textData;
  if (dataToRender && dataToRender.trim().length > 0) {
    await renderLabels(dataToRender);
  }

  if (responseBuffers.length > 0) {
    return Buffer.concat(responseBuffers);
  }
  return null;
}

async function renderLabels(data) {
  const zpls = data.split(/\^XZ|\^xz/);
  const factor =
    configs.unit === '1' ? 1 : configs.unit === '2' ? 2.54 : configs.unit === '3' ? 25.4 : 96.5;
  const width = Math.round((parseFloat(configs.width) * 1000) / factor) / 1000;
  const height = Math.round((parseFloat(configs.height) * 1000) / factor) / 1000;

  if (zpls.length > 1 && zpls[zpls.length - 1].trim() === '') {
    zpls.pop();
  }

  for (let zpl of zpls) {
    if (!zpl || !zpl.trim().length) continue;

    zpl = zpl.replace(/^\s+/, '') + '^XZ';

    try {
      const { buffer } = await renderLabel(zpl, width, height, configs.density);
      const base64 = buffer.toString('base64');
      const label = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        image: `data:image/png;base64,${base64}`,
        zpl: zpl,
        timestamp: new Date().toISOString(),
        width,
        height,
      };

      labelHistory.unshift(label);
      if (labelHistory.length > MAX_LABELS) {
        labelHistory = labelHistory.slice(0, MAX_LABELS);
      }

      io.emit('label', label);
      emitNotification('Label rendered successfully', 'success');

      // Save if configured
      if (configs.saveLabels) {
        const counter = getCounter();
        const savePath = configs.path || '/tmp/labels';
        try {
          if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

          if (configs.filetype === '1') {
            const fileName = `LBL${padLeft(counter, 6)}.png`;
            fs.writeFileSync(path.join(savePath, fileName), buffer);
            emitNotification(`Label ${fileName} saved`, 'success');
          } else if (configs.filetype === '2') {
            const pdfBuffer = await fetchPdf(zpl, width, height, configs.density);
            const fileName = `LBL${padLeft(counter, 6)}.pdf`;
            fs.writeFileSync(path.join(savePath, fileName), pdfBuffer);
            emitNotification(`Label ${fileName} saved`, 'success');
          } else if (configs.filetype === '3') {
            const fileName = `LBL${padLeft(counter, 6)}.raw`;
            fs.writeFileSync(path.join(savePath, fileName), zpl);
            emitNotification(`Label ${fileName} saved`, 'success');
          }
        } catch (e) {
          emitNotification(`Save error: ${e.message}`, 'error');
        }
      }
    } catch (e) {
      console.error('Render error:', e.message);
      emitNotification(`Render error: ${e.message}`, 'error');
    }
  }
}

// ── TCP Server ───────────────────────────────────────────────────────
function startTcpServer() {
  if (tcpServer) return;

  tcpServer = net.createServer();
  tcpServer.listen(parseInt(configs.port), configs.host);

  emitNotification(`TCP Printer started on ${configs.host}:${configs.port}`, 'success');
  io.emit('tcp-status', { running: true, host: configs.host, port: configs.port });

  tcpServer.on('connection', (sock) => {
    const clientInfo = `${sock.remoteAddress}:${sock.remotePort}`;
    console.log('TCP CONNECTED:', clientInfo);
    io.emit('tcp-connection', { client: clientInfo, event: 'connected' });

    let buffer = Buffer.alloc(0);
    let processTimeout = null;
    const keepConnection = configs.keepTcpSocket;

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
        const response = await processZpl(data);
        if (response) sock.write(response);

        if (!keepConnection) {
          sock.end();
        } else {
          buffer = Buffer.alloc(0);
        }
      } catch (err) {
        console.error('ZPL processing error:', err);
        emitNotification(`Error: ${err.message}`, 'error');
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
        'info'
      );

      if (processTimeout) clearTimeout(processTimeout);
      processTimeout = setTimeout(() => {
        const dataToProcess = buffer;
        processData(dataToProcess);
      }, 100);
    });

    sock.on('close', () => {
      io.emit('tcp-connection', { client: clientInfo, event: 'disconnected' });
    });

    sock.on('error', (err) => {
      console.error('Socket error:', err.message);
    });
  });

  tcpServer.on('error', (err) => {
    emitNotification(`TCP Server error: ${err.message}`, 'error');
    io.emit('tcp-status', { running: false, error: err.message });
    tcpServer = null;
  });
}

function stopTcpServer() {
  if (!tcpServer) return;
  tcpServer.close();
  tcpServer = null;
  emitNotification(`TCP Printer stopped`, 'info');
  io.emit('tcp-status', { running: false });
}

// ── REST API ─────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json(configs);
});

app.post('/api/config', (req, res) => {
  const wasRunning = !!tcpServer;
  const oldPort = configs.port;
  const oldHost = configs.host;

  Object.assign(configs, req.body);
  zplCommands.configs = configs;
  saveConfig(configs);

  // Restart TCP if port/host changed and was running
  if (wasRunning && (oldPort !== configs.port || oldHost !== configs.host)) {
    stopTcpServer();
    startTcpServer();
  }

  io.emit('config-updated', configs);
  res.json({ success: true, configs });
});

app.post('/api/tcp/start', (req, res) => {
  startTcpServer();
  configs.isOn = true;
  saveConfig(configs);
  res.json({ success: true });
});

app.post('/api/tcp/stop', (req, res) => {
  stopTcpServer();
  configs.isOn = false;
  saveConfig(configs);
  res.json({ success: true });
});

app.get('/api/labels', (req, res) => {
  res.json(labelHistory);
});

app.delete('/api/labels', (req, res) => {
  const count = labelHistory.length;
  labelHistory = [];
  io.emit('labels-cleared');
  res.json({ success: true, removed: count });
});

app.post('/api/print', async (req, res) => {
  try {
    const zplData = req.body;
    if (!zplData || !zplData.trim()) {
      return res.status(400).json({ error: 'No ZPL data provided' });
    }

    // Process escape sequences
    const processed = zplData
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\b/g, '\b');

    await processZpl(Buffer.from(processed, 'utf8'));
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

  socket.emit('config-updated', configs);
  socket.emit('tcp-status', {
    running: !!tcpServer,
    host: configs.host,
    port: configs.port,
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

  if (configs.isOn) {
    startTcpServer();
  }
});
