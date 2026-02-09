#!/usr/bin/env node
/**
 * Desktop App Server Mode (Headless)
 * Runs the desktop app's TCP server functionality without Electron GUI
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

// Load ZPL commands
const ZplCommands = require('./ZPLPrinter/js/zpl_commands.js');

// Load configs from environment or defaults
const configs = {
  isOn: process.env.IS_ON !== 'false',
  density: process.env.DENSITY || '8',
  width: process.env.WIDTH || '4',
  height: process.env.HEIGHT || '6',
  unit: process.env.UNIT || '1',
  host: process.env.HOST || '0.0.0.0',
  port: process.env.PORT || '9100',
  bufferSize: process.env.BUFFER_SIZE || '4096',
  keepTcpSocket: process.env.KEEP_TCP_SOCKET !== 'false',
  saveLabels: process.env.SAVE_LABELS === 'true',
  filetype: process.env.FILETYPE || '3',
  path: process.env.LABELS_PATH || '/app/labels',
  counter: 0,
  // Status flags
  zplHeadOpen: process.env.ZPL_HEAD_OPEN === 'true',
  zplPaperOut: process.env.ZPL_PAPER_OUT === 'true',
  zplRibbonOut: process.env.ZPL_RIBBON_OUT === 'true',
  zplCutterFault: process.env.ZPL_CUTTER_FAULT === 'true',
  zplHeadTooHot: process.env.ZPL_HEAD_TOO_HOT === 'true',
  zplMotorOverheat: process.env.ZPL_MOTOR_OVERHEAT === 'true',
  zplPrinterPaused: process.env.ZPL_PRINTER_PAUSED === 'true',
  zplPaperJam: process.env.ZPL_PAPER_JAM === 'true',
  zplRewindFault: process.env.ZPL_REWIND_FAULT === 'true',
};

const zplCommands = new ZplCommands(configs);

// Base64 decode helper
function base64DecodeUnicode(base64) {
  try {
    const binary = Buffer.from(base64, 'base64').toString('binary');
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return Buffer.from(bytes).toString('utf8');
  } catch (e) {
    return base64;
  }
}

// Simple notification function (no-op for headless mode)
function notify(text, glyphicon, type, delay) {
  console.log(`[NOTIFY] ${text}`);
}

// ZPL processing function (extracted from desktop app logic)
async function zpl(data) {
  let textData = data.toString('utf8');

  // Only try base64 decode if data doesn't look like ZPL commands or labels
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
  const cmdResult = zplCommands.matchCommand(textData);
  if (cmdResult) {
    if (cmdResult.action) {
      cmdResult.action(configs, notify);
      return cmdResult.response ? Buffer.from(cmdResult.response, 'utf8') : null;
    }
    const response = zplCommands.getResponse(textData);
    return Buffer.from(response, 'utf8');
  }

  // Extract tilde commands from mixed input
  const { commands, labelData } = zplCommands.extractCommands(textData);
  let responseBuffers = [];

  // Process any tilde commands found
  for (const cmd of commands) {
    const result = zplCommands.matchCommand(cmd);
    if (result) {
      if (result.action) {
        result.action(configs, notify);
      } else {
        const response = zplCommands.getResponse(cmd);
        responseBuffers.push(Buffer.from(response, 'utf8'));
      }
    }
  }

  // Note: Desktop app doesn't render labels, it just processes commands
  // Label rendering would require Labelary API calls

  if (responseBuffers.length > 0) {
    return Buffer.concat(responseBuffers);
  }
  return null;
}

// Start TCP server
if (!configs.isOn) {
  console.log('Server is disabled (IS_ON=false)');
  process.exit(0);
}

const server = net.createServer();
server.listen(parseInt(configs.port), configs.host, () => {
  console.log(`ZPL Printer Desktop Server started on ${configs.host}:${configs.port}`);
  console.log(`Configuration:`, {
    density: configs.density,
    width: configs.width,
    height: configs.height,
    unit: configs.unit,
    keepTcpSocket: configs.keepTcpSocket,
  });
});

server.on('connection', (sock) => {
  console.log(`CONNECTED: ${sock.remoteAddress}:${sock.remotePort}`);
  let buffer = Buffer.alloc(0);
  let processTimeout = null;
  const keepConnection = configs.keepTcpSocket;

  async function processData(data) {
    let textView = data.toString('utf8');

    // Handle HTTP POST requests
    const regex = /POST.*\r\n\r\n/gs;
    if (regex.test(textView)) {
      const response = JSON.stringify({ success: true });
      sock.write(
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ' +
        Buffer.byteLength(response) + '\r\n\r\n' + response
      );
      sock.end();
      textView = textView.replace(regex, '');
      data = Buffer.from(textView, 'utf8');
    }

    // Reject HTTP keep-alive requests
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
          Buffer.byteLength(responseError) + '\r\n\r\n' + responseError
        );
        sock.end();
      } catch (error) {}
      return;
    }

    try {
      const response = await zpl(data);
      if (response) sock.write(response);

      if (!keepConnection) {
        sock.end();
      } else {
        buffer = Buffer.alloc(0);
      }
    } catch (err) {
      console.error('ZPL processing error:', err);
      if (!keepConnection) {
        sock.end();
      } else {
        buffer = Buffer.alloc(0);
      }
    }
  }

  sock.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    if (processTimeout) clearTimeout(processTimeout);
    processTimeout = setTimeout(() => {
      const dataToProcess = buffer;
      processData(dataToProcess);
    }, 100);
  });

  sock.on('close', () => {
    console.log(`DISCONNECTED: ${sock.remoteAddress}:${sock.remotePort}`);
  });

  sock.on('error', (err) => {
    console.error('Socket error:', err.message);
  });
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

