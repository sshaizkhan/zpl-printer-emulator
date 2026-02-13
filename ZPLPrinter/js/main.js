const $ = global.$ = global.jQuery = require('jquery');
const createPopper = global.createPopper = require('@popperjs/core');
const Bootstrap = global.Bootstrap = require('bootstrap');
const { ipcRenderer } = require('electron');
const fs = require('fs');
const net = require('net');

// ── Multi-printer state ─────────────────────────────────────────────
let printers = [];
let activePrinterId = null;
let servers = {};   // printerId → { server, clientSocketInfo, zplCommands }
let designer = null;

const defaults = {
    isOn: true,
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
    path: null,
    counter: 0,
    // ~HS status flags
    zplHeadOpen: false,
    zplPaperOut: false,
    zplRibbonOut: false,
    zplCutterFault: false,
    zplHeadTooHot: false,
    zplMotorOverheat: false,
    zplPrinterPaused: false,
    zplPaperJam: false,
    zplRewindFault: false,
    // ~HQES error flags
    hqesMediaOut: false,
    hqesRibbonOut: false,
    hqesHeadOpen: false,
    hqesCutterFault: false,
    hqesPrintheadOverTemp: false,
    hqesMotorOverTemp: false,
    hqesBadPrintheadElement: false,
    hqesPrintheadDetectionError: false,
    // ~HQES warning flags
    hqesMediaNearEnd: false,
    hqesRibbonNearEnd: false,
    hqesReplacePrinthead: false,
    hqesCleanPrinthead: false,
};

// ── Printer helpers ─────────────────────────────────────────────────
function getActivePrinter() {
    return printers.find(p => p.id === activePrinterId) || printers[0];
}
function getPrinterById(id) {
    return printers.find(p => p.id === id);
}
function savePrintersToStorage() {
    global.localStorage.setItem('printers', JSON.stringify(printers));
    global.localStorage.setItem('activePrinterId', activePrinterId);
}
function generatePrinterId() {
    return 'printer-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
}
function getNextAvailablePort() {
    const usedPorts = printers.map(p => parseInt(p.port));
    let port = 9100;
    while (usedPorts.includes(port)) port++;
    return String(port);
}

// ── Migration from legacy flat localStorage ─────────────────────────
function migrateIfNeeded() {
    if (global.localStorage.getItem('printers')) return;

    const legacy = {};
    Object.keys(defaults).forEach(k => {
        const v = global.localStorage.getItem(k);
        if (v !== null) legacy[k] = v;
    });

    const printer = {
        id: 'printer-1',
        name: 'Printer 1',
        ...defaults,
        ...legacy
    };

    global.localStorage.setItem('printers', JSON.stringify([printer]));
    global.localStorage.setItem('activePrinterId', printer.id);

    // Clean up legacy keys
    Object.keys(defaults).forEach(k => global.localStorage.removeItem(k));
    global.localStorage.removeItem('counter');
}

// ── Init ────────────────────────────────────────────────────────────
$(function () {
    $(window).bind('focus', function () {
        $('#panel-head').removeClass('panel-heading-blur');
    });
    $(window).bind('blur', function () {
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') return;
        $('#panel-head').addClass('panel-heading-blur');
    });

    migrateIfNeeded();
});

$(document).ready(function () {
    printers = JSON.parse(global.localStorage.getItem('printers') || '[]');
    activePrinterId = global.localStorage.getItem('activePrinterId');

    // Ensure at least one printer exists
    if (printers.length === 0) {
        printers = [{ id: 'printer-1', name: 'Printer 1', ...defaults }];
        activePrinterId = 'printer-1';
        savePrintersToStorage();
    }

    if (!activePrinterId || !getPrinterById(activePrinterId)) {
        activePrinterId = printers[0].id;
    }

    renderPrinterTabs();
    initEvents();
    initDesigner();

    // Auto-start servers for printers that were previously on
    printers.forEach(p => {
        if ([true, 'true', 1, '1'].includes(p.isOn)) {
            startTcpServer(p.id);
        }
    });
});

// ── Size helper ─────────────────────────────────────────────────────
function getSize(width, height) {
    const defaultWidth = 386;
    const factor = width / height;
    return { width: defaultWidth, height: defaultWidth / factor };
}

// ── Label saving ────────────────────────────────────────────────────
async function saveLabel(blob, ext, counter, printer) {
    const fileName = `LBL${counter.padLeft(6)}.${ext}`;
    const savePath = !printer.path || printer.path === 'null' ? '' : printer.path.trimCharEnd('\\').trimCharEnd('/');

    try {
        fs.writeFileSync(savePath + '/' + fileName, typeof blob === 'string' ? blob : (Buffer.isBuffer(blob) ? blob : new Uint8Array(await blob.arrayBuffer())));
        notify('Label <b>{0}</b> saved in folder <b>{1}</b>'.format(fileName, savePath), 'floppy-saved', 'info', 1000);
    } catch (err) {
        console.error(err);
        notify(`error in saving label to ${fileName} ${err.message}`, 'floppy-saved', 'danger', 0);
    }
}

async function fetchAndSavePDF(api_url, zpl, counter, printer) {
    let r1 = await fetch(api_url, {
        method: "POST",
        body: zpl,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/pdf'
        }
    });

    if (!r1.ok || r1.status !== 200) {
        console.log('error in fetching pdf', `status = ${r1.status}`, await r1.text(), `zpl=${zpl}`);
        return;
    }

    let blob = await r1.blob();
    await saveLabel(blob, 'pdf', counter, printer);
}

// ── Notification ────────────────────────────────────────────────────
function notify(text, glyphicon, type, delay) {
    const log = $('<p>' + text + '</p>').text();
    if (type === 'danger') {
        console.error(log);
    } else {
        console.info(log);
    }

    let el = $(`<div class="alert alert-${type || 'success'} alert-dismissible fade show position-relative m-1" role="alert">
        <i class="glyphicon glyphicon-${glyphicon || 'info-sign'} float-start" style="font-size: 2em;top:-3px; margin-right: 10px;" aria-hidden="true"></i>
        <span class="msg">${text}<span>
    </div>`).appendTo('.bottom-left');
    setTimeout(function () { el.fadeOut(1000); }, delay || 2000);
}

// ── ZPL Processing (per-printer) ────────────────────────────────────
async function zplForPrinter(printerId, data) {
    const printer = getPrinterById(printerId);
    const entry = servers[printerId];
    if (!printer || !entry) return null;
    const zplCmds = entry.zplCommands;

    data = data.toString('utf8');
    try { data = base64DecodeUnicode(data.trim()); } catch (e) {}

    // Fast path: exact single command match
    const cmdResult = zplCmds.matchCommand(data);
    if (cmdResult) {
        if (cmdResult.action) {
            cmdResult.action(printer, notify);
            notify('Command <b>' + data.trim() + '</b> executed: ' + cmdResult.message);
            return cmdResult.response ? Buffer.from(cmdResult.response, 'utf8') : null;
        }
        const response = zplCmds.getResponse(data);
        console.log('Command: ' + response.toString('utf8'));
        notify('A response has been sent to the received internal command.');
        return response;
    }

    // Extract tilde commands from mixed input
    const { commands, labelData } = zplCmds.extractCommands(data);
    let responseBuffers = [];

    for (const cmd of commands) {
        const result = zplCmds.matchCommand(cmd);
        if (result) {
            if (result.action) {
                result.action(printer, notify);
                notify('Command <b>' + cmd + '</b> executed: ' + result.message);
            } else {
                const response = zplCmds.getResponse(cmd);
                console.log('Command: ' + response.toString('utf8'));
                notify('A response has been sent to the received internal command.');
                responseBuffers.push(response);
            }
        }
    }

    const dataToRender = commands.length > 0 ? labelData : data;
    if (dataToRender && dataToRender.trim().length > 0) {
        await renderLabels(dataToRender, printerId);
    }

    if (responseBuffers.length > 0) {
        return Buffer.concat(responseBuffers);
    }
    return null;
}

// ── Label rendering (per-printer) ───────────────────────────────────
async function renderLabels(data, printerId) {
    const printer = getPrinterById(printerId);
    if (!printer) return;

    const zpls = data.split(/\^XZ|\^xz/);
    const factor = printer.unit === '1' ? 1 : (printer.unit === '2' ? 2.54 : (printer.unit === '3' ? 25.4 : 96.5));
    const width = Math.round(parseFloat(printer.width) * 1000 / factor) / 1000;
    const height = Math.round(parseFloat(printer.height) * 1000 / factor) / 1000;

    if (zpls.length > 1 && zpls[zpls.length - 1].trim() === '') {
        zpls.pop();
    }

    for (let zpl of zpls) {
        if (!zpl || !zpl.trim().length) {
            console.warn(`zpl = '${zpl}', seems invalid`);
            continue;
        }

        zpl = zpl.replace(/^\s+/, '') + '^XZ';

        let api_url = atob('aHR0cDovL2FwaS5sYWJlbGFyeS5jb20vdjEvcHJpbnRlcnMvezB9ZHBtbS9sYWJlbHMvezF9eHsyfS8wLw==')
            .format(printer.density, width > 15.0 ? 15 : width, height);
        let blob = await displayZplImage(api_url, zpl, width, height, printerId);

        if (![1, '1', true, 'true'].includes(printer.saveLabels)) {
            continue;
        }

        let counter = getCounter(printerId);
        if (printer.filetype === '1') {
            await saveLabel(blob, "png", counter, printer);
        } else if (printer.filetype === '2') {
            await fetchAndSavePDF(api_url, zpl, counter, printer);
        } else if (printer.filetype === '3') {
            await saveLabel(zpl, "raw", counter, printer);
        }
    }
}

async function displayZplImage(api_url, zpl, width, height, printerId) {
    let r1 = await fetch(api_url, {
        method: "POST",
        body: zpl,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!r1.ok || r1.status !== 200) {
        let text = await r1.text();
        notify(`Error in fetching ZPL image, status = ${r1.status}, ` + text, 'remove-sign', 'danger');
        console.log('Error in fetching ZPL image', `status = ${r1.status}`, text, `zpl = ${zpl}`);
        return;
    }

    const blob = await r1.blob();
    const size = getSize(width, height);
    const img = document.createElement('img');
    img.setAttribute('height', size.height);
    img.setAttribute('width', size.width);
    img.setAttribute('class', 'label-zpl border');
    img.onload = function (e) {
        window.URL.revokeObjectURL(img.src);
    };

    img.src = window.URL.createObjectURL(blob);

    const offset = size.height + 20;
    const containerId = `#label-zpl-${printerId}`;
    $(containerId).prepend(img).css({ 'top': `-${offset}px` }).animate({ 'top': '0px' }, 1500);

    return blob;
}

function getCounter(printerId) {
    const printer = getPrinterById(printerId);
    let counter = parseInt(printer.counter) || 0;
    counter = isNaN(counter) ? 1 : counter;
    printer.counter = ++counter;
    savePrintersToStorage();
    return counter;
}

// ── TCP Server (per-printer) ────────────────────────────────────────
function startTcpServer(printerId) {
    const printer = getPrinterById(printerId);
    if (!printer || servers[printerId]?.server) return;

    const zplCmds = new ZplCommands(printer);
    const srv = net.createServer();
    srv.listen(parseInt(printer.port), printer.host);

    servers[printerId] = { server: srv, clientSocketInfo: null, zplCommands: zplCmds };

    notify('Printer "{0}" started on <b>{1}</b>:<b>{2}</b>'.format(printer.name, printer.host, printer.port));

    // Update the ON radio for this printer
    $(`#isOn-${printerId}`).prop('checked', true);
    $(`#isOff-${printerId}`).prop('checked', false);

    srv.on('connection', function (sock) {
        console.log(`CONNECTED [${printer.name}]: ${sock.remoteAddress}:${sock.remotePort}`);
        servers[printerId].clientSocketInfo = {
            peerAddress: sock.remoteAddress,
            peerPort: sock.remotePort
        };

        let buffer = Buffer.alloc(0);
        let processTimeout = null;
        const keepConnection = [1, '1', true, 'true'].includes(printer.keepTcpSocket);

        async function processData(data) {
            let textView = data.toString('utf8');

            const regex = /POST.*\r\n\r\n/gs;
            if (regex.test(textView)) {
                const response = JSON.stringify({ success: true });
                sock.write('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ' + Buffer.byteLength(response) + '\r\n\r\n' + response);
                sock.end();
                textView = textView.replace(regex, '');
                data = Buffer.from(textView, 'utf8');
            }

            if (textView.includes('Host:') && textView.includes('Connection: keep-alive') && textView.includes('HTTP')) {
                const responseErrorMsg = 'Ajax call could not be handled!',
                    responseError = JSON.stringify({ success: false, message: responseErrorMsg });
                notify(responseErrorMsg, 'remove', 'danger', 0);
                try {
                    sock.write('HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nContent-Length: ' + Buffer.byteLength(responseError) + '\r\n\r\n' + responseError);
                    sock.end();
                } catch (error) {}
                return;
            }

            try {
                let response = await zplForPrinter(printerId, data);
                if (response) sock.write(response);

                if (!keepConnection) {
                    sock.end();
                } else {
                    buffer = Buffer.alloc(0);
                }
            } catch (err) {
                console.error(err);
                notify('ERROR: {0}'.format(err.message), 'print', 'danger', 0);
                if (!keepConnection) {
                    sock.end();
                } else {
                    buffer = Buffer.alloc(0);
                }
            }
        }

        sock.on('data', function (data) {
            buffer = Buffer.concat([buffer, data]);
            notify(`${buffer.length} bytes received from Client: <b>${sock.remoteAddress}</b> Port: <b>${sock.remotePort}</b>`, 'print', 'info', 1000);
            if (processTimeout) clearTimeout(processTimeout);
            processTimeout = setTimeout(() => {
                const dataToProcess = buffer;
                processData(dataToProcess);
            }, 100);
        });
    });

    srv.on('error', function (err) {
        notify(`Server error on "${printer.name}": ${err.message}`, 'remove-sign', 'danger', 0);
        delete servers[printerId];
        $(`#isOn-${printerId}`).prop('checked', false);
        $(`#isOff-${printerId}`).prop('checked', true);
    });
}

function stopTcpServer(printerId) {
    const entry = servers[printerId];
    if (!entry?.server) return;
    const printer = getPrinterById(printerId);
    entry.server.close();
    delete servers[printerId];
    notify('Printer "{0}" stopped on <b>{1}</b>:<b>{2}</b>'.format(printer?.name || '', printer?.host || '', printer?.port || ''));

    $(`#isOn-${printerId}`).prop('checked', false);
    $(`#isOff-${printerId}`).prop('checked', true);
}

function stopAllTcpServers() {
    Object.keys(servers).forEach(id => stopTcpServer(id));
}

// ── Printer Tab Management ──────────────────────────────────────────
function createPrinterTabPane(printer) {
    const isActive = printer.id === activePrinterId;
    const isRunning = !!servers[printer.id]?.server;

    // Tab button
    const tabLi = $(`
        <li class="nav-item" role="presentation">
            <button class="nav-link printer-sub-tab ${isActive ? 'active' : ''} d-flex align-items-center gap-1"
                    id="ptab-btn-${printer.id}"
                    data-printer-id="${printer.id}"
                    type="button" role="tab">
                <span class="printer-status-dot ${isRunning ? 'running' : ''}"></span>
                <span class="printer-tab-name">${printer.name}</span>
                <span class="badge bg-secondary printer-port-badge">${printer.port}</span>
                ${printers.length > 1 ? `<span class="btn-close btn-close-sm ms-1 printer-tab-close" data-printer-id="${printer.id}"></span>` : ''}
            </button>
        </li>
    `);

    // Tab content pane
    const tabPane = $(`
        <div class="tab-pane fade ${isActive ? 'show active' : ''}" id="ptab-pane-${printer.id}" role="tabpanel">
            <nav class="navbar navbar-light bg-light border rounded pb-0 pt-1 ps-2 pe-2 mb-3">
                <div class="d-flex float-start mb-1">
                    <button class="btn btn-outline-primary btn-test-printer" data-printer-id="${printer.id}" data-bs-toggle="modal" data-bs-target="#printer-test" title="Test Printer">
                        <i class="glyphicon glyphicon-edit"></i>
                    </button>
                    <button class="btn btn-outline-danger ms-2 btn-errors-printer" data-printer-id="${printer.id}" data-bs-toggle="modal" data-bs-target="#errors-warnings-window" title="Errors &amp; Warnings">
                        <i class="glyphicon glyphicon-alert"></i> Errors &amp; Warnings
                    </button>
                </div>
                <div class="d-flex float-end mb-1">
                    <div class="btn-group" role="group">
                        <input id="isOn-${printer.id}" type="radio" class="btn-check printer-on" name="on_off_${printer.id}" data-printer-id="${printer.id}" autocomplete="off" ${isRunning ? 'checked' : ''}>
                        <label class="btn btn-outline-primary" for="isOn-${printer.id}">ON</label>
                        <input id="isOff-${printer.id}" type="radio" class="btn-check printer-off" name="on_off_${printer.id}" data-printer-id="${printer.id}" autocomplete="off" ${!isRunning ? 'checked' : ''}>
                        <label class="btn btn-outline-primary" for="isOff-${printer.id}">OFF</label>
                    </div>
                    <button class="btn btn-outline-primary ms-2 btn-remove-labels" data-printer-id="${printer.id}" title="Remove Labels">
                        <i class="glyphicon glyphicon-trash"></i>
                    </button>
                    <button class="btn btn-outline-primary ms-2 btn-settings-printer" data-printer-id="${printer.id}" data-bs-toggle="modal" data-bs-target="#settings-window" title="Printer Settings">
                        <i class="glyphicon glyphicon-cog"></i>
                    </button>
                </div>
            </nav>
            <div class="label-container bg-light border rounded overflow-auto">
                <div id="label-zpl-${printer.id}" class="position-relative"></div>
            </div>
        </div>
    `);

    return { tabLi, tabPane };
}

function renderPrinterTabs() {
    const $tabs = $('#printerSubTabs').empty();
    const $content = $('#printerSubTabContent').empty();

    printers.forEach(printer => {
        const { tabLi, tabPane } = createPrinterTabPane(printer);
        $tabs.append(tabLi);
        $content.append(tabPane);
    });
}

function switchToPrinter(printerId) {
    activePrinterId = printerId;
    global.localStorage.setItem('activePrinterId', printerId);

    $('#printerSubTabs .nav-link').removeClass('active');
    $(`#ptab-btn-${printerId}`).addClass('active');

    $('#printerSubTabContent .tab-pane').removeClass('show active');
    $(`#ptab-pane-${printerId}`).addClass('show active');

    if (designer) {
        designer.configs = getActivePrinter();
        designer.updateLabelSize();
        updateDesignerStatus();
    }
}

function addNewPrinter() {
    const id = generatePrinterId();
    const port = getNextAvailablePort();
    const name = `Printer ${printers.length + 1}`;

    const newPrinter = { ...defaults, id, name, port, isOn: false, counter: 0 };
    printers.push(newPrinter);
    savePrintersToStorage();

    renderPrinterTabs();
    switchToPrinter(id);
}

function removePrinter(printerId) {
    if (printers.length <= 1) {
        notify('Cannot remove the last printer.', 'warning-sign', 'warning');
        return;
    }
    const printer = getPrinterById(printerId);
    if (!confirm(`Remove printer "${printer?.name}"? This will stop its server and clear its labels.`)) {
        return;
    }

    stopTcpServer(printerId);
    printers = printers.filter(p => p.id !== printerId);

    if (activePrinterId === printerId) {
        activePrinterId = printers[0].id;
    }

    savePrintersToStorage();
    renderPrinterTabs();
}

// ── HQES Preview ────────────────────────────────────────────────────
function computeHqesPreview() {
    const printer = getActivePrinter();
    if (!printer) return '';

    let errorFlags = 0;
    if ([1, "1", true, "true"].includes(printer.hqesMediaOut)) errorFlags |= 0x00000001;
    if ([1, "1", true, "true"].includes(printer.hqesRibbonOut)) errorFlags |= 0x00000002;
    if ([1, "1", true, "true"].includes(printer.hqesHeadOpen)) errorFlags |= 0x00000004;
    if ([1, "1", true, "true"].includes(printer.hqesCutterFault)) errorFlags |= 0x00000008;
    if ([1, "1", true, "true"].includes(printer.hqesPrintheadOverTemp)) errorFlags |= 0x00000010;
    if ([1, "1", true, "true"].includes(printer.hqesMotorOverTemp)) errorFlags |= 0x00000020;
    if ([1, "1", true, "true"].includes(printer.hqesBadPrintheadElement)) errorFlags |= 0x00000040;
    if ([1, "1", true, "true"].includes(printer.hqesPrintheadDetectionError)) errorFlags |= 0x00000080;

    let warningFlags = 0;
    if ([1, "1", true, "true"].includes(printer.hqesMediaNearEnd)) warningFlags |= 0x00000008;
    if ([1, "1", true, "true"].includes(printer.hqesRibbonNearEnd)) warningFlags |= 0x00000001;
    if ([1, "1", true, "true"].includes(printer.hqesReplacePrinthead)) warningFlags |= 0x00000004;
    if ([1, "1", true, "true"].includes(printer.hqesCleanPrinthead)) warningFlags |= 0x00000002;

    const errHex = errorFlags.toString(16).padStart(8, '0');
    const warnHex = warningFlags.toString(16).padStart(8, '0');

    return `PRINTER STATUS\nERRORS: 1 00000000 ${errHex}\nWARNINGS: 1 00000000 ${warnHex}`;
}

function updateHqesPreview() {
    const preview = $('#hqes-preview');
    if (preview.length) {
        preview.text(computeHqesPreview());
    }
}

// ── Events ──────────────────────────────────────────────────────────
function initEvents() {
    // Printer ON/OFF toggles (delegated)
    $(document).on('change', '.printer-on', function () {
        const printerId = $(this).data('printer-id');
        if ($(this).is(':checked')) {
            startTcpServer(printerId);
            const printer = getPrinterById(printerId);
            if (printer) { printer.isOn = true; savePrintersToStorage(); }
        }
    });
    $(document).on('change', '.printer-off', function () {
        const printerId = $(this).data('printer-id');
        if ($(this).is(':checked')) {
            stopTcpServer(printerId);
            const printer = getPrinterById(printerId);
            if (printer) { printer.isOn = false; savePrintersToStorage(); }
        }
    });

    // Remove labels (delegated)
    $(document).on('click', '.btn-remove-labels', function () {
        const printerId = $(this).data('printer-id');
        const labels = $(`#label-zpl-${printerId} .label-zpl`);
        const size = labels.length;

        if (!size) {
            notify('No labels to remove.', null, 'info');
            return;
        }

        const msg = '{0} zpl {1}'.format(size, size === 1 ? 'label' : 'labels');
        const btn = $('#btn-modal-confirm-action');

        $('#modal-remove-msg').html(msg);
        $('#btn-modal-confirm').trigger('click');
        btn.off("click");
        btn.on("click", function (e) {
            btn.prev().trigger('click');
            labels.remove();
            notify('{0} successfully removed.'.format(msg), 'trash', 'info');
        });
    });

    // Settings button (delegated) — populate modal from the right printer
    $(document).on('click', '.btn-settings-printer', function () {
        const printerId = $(this).data('printer-id');
        activePrinterId = printerId;
        global.localStorage.setItem('activePrinterId', printerId);

        // Stop TCP if running, so port can be changed
        if (servers[printerId]?.server) {
            stopTcpServer(printerId);
        }
        initConfigs($('#settings-window'));
    });

    // Errors button (delegated)
    $(document).on('click', '.btn-errors-printer', function () {
        const printerId = $(this).data('printer-id');
        activePrinterId = printerId;
        global.localStorage.setItem('activePrinterId', printerId);
        initConfigs($('#errors-warnings-window'));
        updateHqesPreview();
    });

    // Test button (delegated)
    $(document).on('click', '.btn-test-printer', function () {
        const printerId = $(this).data('printer-id');
        activePrinterId = printerId;
        global.localStorage.setItem('activePrinterId', printerId);
    });

    // Printer sub-tab click (delegated)
    $(document).on('click', '#printerSubTabs .nav-link', function (e) {
        if ($(e.target).hasClass('printer-tab-close')) return;
        const printerId = $(this).data('printer-id');
        switchToPrinter(printerId);
    });

    // Remove printer tab (delegated)
    $(document).on('click', '.printer-tab-close', function (e) {
        e.stopPropagation();
        const printerId = $(this).data('printer-id');
        removePrinter(printerId);
    });

    // Add printer button
    $('#btn-add-printer').on('click', function () {
        addNewPrinter();
    });

    // Close app
    $('#btn-close').on('click', function () {
        // Save isOn state for each printer
        printers.forEach(p => {
            p.isOn = !!servers[p.id]?.server;
        });
        savePrintersToStorage();
        stopAllTcpServers();
        window.close();
    });

    $('#path').on('keydown', function (e) {
        e.preventDefault();
    });

    // Settings form
    $('#configsForm').on('submit', function (e) {
        e.preventDefault();
        saveConfigs();
    });

    // Errors & Warnings form
    $('#errorsWarningsForm').on('submit', function (e) {
        e.preventDefault();
        saveConfigs($('#errors-warnings-window'));
        notify('Errors & Warnings settings saved', 'alert', 'info');
        $('#errors-warnings-window').find('[data-bs-dismiss="modal"]').first().trigger('click');
    });

    // Live preview update for HQES checkboxes
    $('#errors-warnings-window').on('change', 'input[type=checkbox]', function () {
        const printer = getActivePrinter();
        const tempConfigs = {};
        $('#errors-warnings-window').find('input[type=checkbox]').each(function () {
            tempConfigs[this.id] = $(this).is(':checked');
        });
        Object.assign(printer, tempConfigs);
        updateHqesPreview();
    });

    // Test form
    $('#testsForm').on('submit', function (e) {
        e.preventDefault();
        let val = $('#test-data').val();
        $('#btn-close-test-md').trigger('click');
        notify('Printing raw ZPL text test', 'print', 'info', 1000);

        val = val.replaceAll(/\\n/g, '\n').replaceAll(/\\t/g, '\t').replaceAll(/\\r/g, '\r').replaceAll(/\\b/g, '\b');

        return zplForPrinter(activePrinterId, val);
    });

    $('.btn-close-test-md').on('click', function () {
        $('#test-data').val('');
    });

    $('#btn-run-test-hw').on('click', function () {
        const data = btoa('^xa^cfa,50^fo100,100^fdHello World^fs^xz');
        $('#test-data').val(data);
        $('#testsForm').submit();
    });

    $('#btn-raw-file').on('click', function (e) {
        e.preventDefault();
        ipcRenderer.send('select-file');
    });

    $('#saveLabels').on('change', function () {
        $('#btn-filetype, #btn-path, #filetype, #path').prop('disabled', !$(this).is(':checked'));
    });

    $('.btn-close-save-settings').on('click', function () {
        const printer = getActivePrinter();
        if (printer && printer.keepTcpSocket && !servers[printer.id]?.server) {
            startTcpServer(printer.id);
            printer.isOn = true;
            savePrintersToStorage();
        }
    });

    $('#btn-path').on('click', function (e) {
        e.preventDefault();
        ipcRenderer.send('select-dir');
    });

    ipcRenderer.on('selected-dir', function (event, response) {
        if (response && typeof Array.isArray(response) && response[0]) {
            $('#path').val(response[0]);
        }
    });

    ipcRenderer.on('selected-file', function (event, response) {
        if (response && typeof Array.isArray(response) && response[0]) {
            const base64 = fs.readFileSync(response[0]).toString('base64');
            $('#btn-close-test-md').trigger('click');
            zplForPrinter(activePrinterId, base64);
        }
    });

    ipcRenderer.on('window-focus-change', (event, status) => {
        if (status === 'blurred') {
            $(window).trigger('blur');
        } else if (status === 'focused') {
            $(window).trigger('focus');
        }
    });

    ipcRenderer.on('app-version-response', (event, version) => {
        if (version) {
            $('#app-version').html(' v' + version);
        }
    });

    ipcRenderer.send('get-app-version');
}

// ── Toggle switch helper ────────────────────────────────────────────
function toggleSwitch(group) {
    let radios = $(group).find('input[type=radio]');
    let first = $(radios[0]).is(':checked');
    $(radios[first ? 1 : 0]).prop('checked', true).trigger('change');
}

// ── Label Template Designer ─────────────────────────────────────────
function initDesigner() {
    const printer = getActivePrinter();
    designer = new LabelDesigner('designer-canvas', 'props-content', printer);
    updateDesignerStatus();

    $('#add-text-el').on('click', function () {
        designer.addTextElement();
        updateDesignerStatus();
    });
    $('#add-box-el').on('click', function () {
        designer.addBoxElement();
        updateDesignerStatus();
    });
    $('#add-barcode-el').on('click', function () {
        designer.addBarcodeElement();
        updateDesignerStatus();
    });

    $('#toggle-grid-btn').on('click', function () {
        designer.toggleGrid();
        $(this).toggleClass('active');
    });

    $('#delete-el-btn').on('click', function () {
        if (designer.selectedElement) {
            designer.deleteElement(designer.selectedElement);
            updateDesignerStatus();
        }
    });

    $('#clear-all-btn').on('click', function () {
        if (designer.elements.length === 0) return;
        if (confirm('Remove all elements from the canvas?')) {
            designer.clearAll();
            updateDesignerStatus();
        }
    });

    $('#template-name').on('input', function () {
        designer.templateName = $(this).val();
    });

    $('#export-template-btn').on('click', function () {
        designer.templateName = $('#template-name').val() || '';
        const json = designer.exportTemplate();
        const text = JSON.stringify(json, null, 2);
        $('#template-io-data').val(text);
        $('#template-io-label').text('Export Template');
        $('#template-io-action').hide();
        $('#template-io-copy').removeClass('d-none').show();
        const modal = new Bootstrap.Modal(document.getElementById('template-io-modal'));
        modal.show();
    });

    $('#import-template-btn').on('click', function () {
        $('#template-io-data').val('');
        $('#template-io-label').text('Import Template');
        $('#template-io-action').show();
        $('#template-io-action-label').text('Import');
        $('#template-io-copy').addClass('d-none');
    });

    $('#template-io-action').on('click', function () {
        const text = $('#template-io-data').val();
        if (!text || !text.trim()) {
            notify('Please paste template JSON data.', 'warning-sign', 'warning');
            return;
        }
        try {
            designer.importTemplate(text);
            $('#template-name').val(designer.templateName);
            updateDesignerStatus();
            Bootstrap.Modal.getInstance(document.getElementById('template-io-modal')).hide();
            notify('Template imported successfully with ' + designer.elements.length + ' elements.', 'ok', 'success');
        } catch (e) {
            notify('Import error: ' + e.message, 'remove-sign', 'danger', 5000);
        }
    });

    $('#preview-label-btn').on('click', async function () {
        if (designer.elements.length === 0) {
            notify('Add elements to the template first.', 'warning-sign', 'warning');
            return;
        }
        const previewModal = new Bootstrap.Modal(document.getElementById('preview-modal'));
        $('#preview-image-container').html('<p class="text-muted">Generating preview...</p>');
        $('#preview-zpl-code').val('');
        previewModal.show();
        try {
            const { blob, zplCode } = await designer.previewViaLabelary();
            const imgUrl = window.URL.createObjectURL(blob);
            $('#preview-image-container').html('<img src="' + imgUrl + '" style="max-width:100%; border: 1px solid #ccc;">');
            $('#preview-zpl-code').val(zplCode);
        } catch (e) {
            $('#preview-image-container').html('<p class="text-danger">Preview failed: ' + e.message + '</p>');
            try { $('#preview-zpl-code').val(designer.generateZPL()); } catch (e2) {}
        }
    });

    $('#preview-copy-zpl').on('click', function () {
        const textarea = document.getElementById('preview-zpl-code');
        textarea.select();
        document.execCommand('copy');
        notify('ZPL code copied to clipboard.', 'copy', 'info');
    });

    $('#template-io-copy').on('click', function () {
        const textarea = document.getElementById('template-io-data');
        textarea.select();
        document.execCommand('copy');
        notify('Template JSON copied to clipboard.', 'copy', 'info');
    });

    $('button[data-bs-target="#designer-pane"]').on('shown.bs.tab', function () {
        designer.configs = getActivePrinter();
        designer.updateLabelSize();
        updateDesignerStatus();
    });

    $('#designer-settings-btn').on('click', function () {
        const printer = getActivePrinter();
        if (printer && servers[printer.id]?.server) {
            stopTcpServer(printer.id);
        }
        initConfigs($('#settings-window'));
    });
}

function updateDesignerStatus() {
    if (!designer) return;
    const printer = getActivePrinter();
    if (!printer) return;
    const unit = printer.unit || '1';
    const unitLabel = unit === '1' ? 'in' : (unit === '2' ? 'cm' : (unit === '3' ? 'mm' : 'px'));
    $('#designer-label-size').text(
        (printer.width || '4') + ' x ' + (printer.height || '6') + ' ' + unitLabel +
        ' (' + designer.labelWidthMm.toFixed(1) + ' x ' + designer.labelHeightMm.toFixed(1) + ' mm)'
    );
    $('#designer-el-count').text(designer.elements.length);
}

// ── Save/Load configs (scoped to active printer) ────────────────────
function saveConfigs(context) {
    const printer = getActivePrinter();
    if (!printer) return;

    context = context || $('body');
    for (let key in defaults) {
        let $el = context.find('#' + key);

        if (!$el.length) continue;

        if (['checkbox', 'radio'].includes(($el.attr('type') || '').toLowerCase())) {
            printer[key] = $el.is(':checked');
        } else {
            printer[key] = $el.val();
        }
    }

    // Also save printer name
    const $name = context.find('#printerName');
    if ($name.length && $name.val()) printer.name = $name.val();

    savePrintersToStorage();

    notify('Printer settings changes successfully saved', 'cog', 'info');
    $('.btn-close-save-settings').trigger('click');

    // Update tab label
    $(`#ptab-btn-${printer.id} .printer-tab-name`).text(printer.name);
    $(`#ptab-btn-${printer.id} .printer-port-badge`).text(printer.port);

    if (designer) {
        designer.configs = printer;
        designer.updateLabelSize();
        updateDesignerStatus();
    }
}

function initConfigs(context) {
    const printer = getActivePrinter();
    if (!printer) return;

    context = context || $('body');

    for (let key in defaults) {
        let $el = context.find('#' + key);
        if (!$el.length) continue;

        if (['checkbox', 'radio'].includes(($el.attr('type') || '').toLowerCase())) {
            $el.prop('checked', [true, 'true', 1, '1'].includes(printer[key])).trigger('change');
        } else {
            $el.val(printer[key]);
        }
    }

    // Printer name
    const $name = context.find('#printerName');
    if ($name.length) $name.val(printer.name);
}

// ── Base64 helpers ──────────────────────────────────────────────────
function base64EncodeUnicode(str) {
    let bytes = new TextEncoder().encode(str);
    let binary = String.fromCharCode(...bytes);
    return btoa(binary);
}
function base64DecodeUnicode(base64) {
    let binary = atob(base64);
    let bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

// ── Prototype extensions ────────────────────────────────────────────
String.prototype.format = function () {
    let s = this, i = arguments.length;
    while (i--) {
        s = s.replace(new RegExp('\\{' + i + '\\}', 'gm'), arguments[i]);
    }
    return s;
};
String.prototype.fixCharForRegex = function () {
    let c = this + '';
    c = !c ? ' ' : (c === "]" ? "\\]" : (c === "^" ? "\\^" : ((c === "\\" ? "\\\\" : c))));
    return c;
};
String.prototype.trimCharEnd = function (c) {
    return this.replace(new RegExp('[' + ((c || '') + '').fixCharForRegex() + ']+$', 'g'), '');
};
Number.prototype.padLeft = function (width, character) {
    character = character || '0';
    let str = this + '';
    return str.length >= width ? str : new Array(width - str.length + 1).join(character) + str;
}
