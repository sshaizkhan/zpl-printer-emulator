const $ = global.$ = global.jQuery = require('jquery');
const createPopper = global.createPopper = require('@popperjs/core');
const Bootstrap = global.Bootstrap = require('bootstrap');
const { ipcRenderer } = require('electron');
const fs = require('fs');
const net = require('net');

let clientSocketInfo;
let server;
let configs = {};
const zplCommands = new ZplCommands(configs);

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

$(function () {
    $(window).bind('focus', function () {
        $('#panel-head').removeClass('panel-heading-blur');
    });
    $(window).bind('blur', function () {
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') return;
        $('#panel-head').addClass('panel-heading-blur');
    });
    // todo only on first run
    if (!global.localStorage.getItem('isOn')) {
        Object.entries(defaults).forEach(function ([k, v]) {
            if (global.localStorage.getItem(k)) {
                global.localStorage.setItem(k, v);
            }
        });
    }
});
$(document).ready(function () {
    Object.keys(defaults).forEach(function (k) {
        configs[k] = global.localStorage.getItem(k);
    });

    initEvents();
    initConfigs();
});
function getSize(width, height) {
    const defaultWidth = 386;

    const factor = width / height;
    return {
        width: defaultWidth,
        height: defaultWidth / factor
    };
}
async function saveLabel(blob, ext, counter) {
    const fileName = `LBL${counter.padLeft(6)}.${ext}`;
    const path = !configs.path || configs.path==='null' ? '' : configs.path.trimCharEnd('\\').trimCharEnd('/');

    try {
        fs.writeFileSync(path + '/' + fileName, typeof blob === 'string' ? blob : ( Buffer.isBuffer(blob) ? blob : new Uint8Array(await blob.arrayBuffer())))
        // file written successfully
        notify('Label <b>{0}</b> saved in folder <b>{1}</b>'.format(fileName, path), 'floppy-saved', 'info', 1000);
    } catch (err) {
        console.error(err);
        notify(`error in saving label to ${fileName} ${err.message}`, 'floppy-saved', 'danger', 0);
    }

}
async function fetchAndSavePDF(api_url, zpl, counter) {
    let r1 = await fetch(api_url, {
        method: "POST",
        body: zpl,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/pdf'
        }
    })

    if (!r1.ok || r1.status !== 200) {
        console.log('error in fetching pdf', `status = ${r1.status}`, await r1.text(), `zpl=${zpl}`)
        return
    }

    let blob = await r1.blob()
    await saveLabel(blob, 'pdf', counter);
}
// Display notification
// @param {String} text Notification text
// @param {Number} glyphicon Notification icon
// @param {String} type Notification type
// @param {Number} delay Notification fade out delay in ms
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
async function zpl(data){
    data = data.toString('utf8');
    try{ data = base64DecodeUnicode(data.trim()); }catch(e){}

    const cmdResult = zplCommands.matchCommand(data);
    if (cmdResult) {
        if (cmdResult.action) {
            // Handle action commands (~JA, ~PS)
            cmdResult.action(configs, notify);
            notify('Command <b>' + data.trim() + '</b> executed: ' + cmdResult.message);
            return cmdResult.response ? Buffer.from(cmdResult.response, 'utf8') : null;
        }
        const response = zplCommands.getResponse(data);
        console.log('Command: ' + response.toString('utf8'));
        notify('A response has been sent to the received internal command.');
        return response;
    }

    const zpls = data.split(/\^XZ|\^xz/);
    const factor = configs.unit === '1' ? 1 : (configs.unit === '2' ? 2.54 : (configs.unit === '3' ? 25.4 : 96.5));
    const width = Math.round(parseFloat(configs.width) * 1000 / factor) / 1000;
    const height = Math.round(parseFloat(configs.height) * 1000 / factor) / 1000;

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
            .format(configs.density, width>15.0 ? 15 : width, height);
        let blob = await displayZplImage(api_url, zpl, width, height);

        if (![1, '1', true, 'true'].includes(configs.saveLabels)) {
            continue;
        }

        console.info("configs", configs.saveLabels, "fileType", configs.filetype);
        let counter = getCounter();
        if (configs.filetype === '1') {
            await saveLabel(blob, "png", counter);
        }
        else if (configs.filetype === '2') {
            await fetchAndSavePDF(api_url, zpl, counter);
        }
        else if (configs.filetype === '3') {
            await saveLabel(zpl, "raw", counter);
        }
    }
    return null;
}

async function displayZplImage(api_url, zpl, width, height) {
    let r1 = await fetch(api_url, {
        method: "POST",
        body: zpl,
        headers: {'Content-Type': 'application/x-www-form-urlencoded'}
    })

    if (!r1.ok || r1.status !== 200) {
        let text = await r1.text()
        notify(`Error in fetching ZPL image, status = ${r1.status}, ` + text, 'remove-sign', 'danger');
        console.log('Error in fetching ZPL image', `status = ${r1.status}`, text, `zpl = ${zpl}`)
        return
    }

    const blob = await r1.blob()
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
    $('#label-zpl').prepend(img).css({'top': `-${offset}px`}).animate({'top': '0px'}, 1500);

    return blob;
}
function getCounter () {
    let item = global.localStorage.getItem('counter') || '0';
    let counter = parseInt(item);
    counter = isNaN(counter) ? 1 : counter;
    console.log('counter?', item, counter);
    global.localStorage.setItem('counter', `${++counter}`);
    return counter;
}
// Start tcp server and listen on configured host/port
function startTcpServer() {
    if (server != undefined) {
        return;
    }

    server = net.createServer();
    server.listen(parseInt(configs.port), configs.host);

    notify('Printer started on Host: <b>{0}</b> Port: <b>{1}</b>'.format(configs.host, configs.port));

    server.on('connection', function (sock) {
        console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
        clientSocketInfo = {
            peerAddress: sock.remoteAddress,
            peerPort: sock.remotePort
        };

        // Buffer to accumulate data chunks (fix for large data > 64KB)
        let buffer = Buffer.alloc(0);
        let processTimeout = null;
        const keepConnection = [1, '1', true, 'true'].includes(configs.keepTcpSocket);
        
        async function processData(data) {
            let textView = data.toString('utf8');

            const regex = /POST.*\r\n\r\n/gs;
            if (regex.test(textView)) {
                const response = JSON.stringify({success: true});
                sock.write('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ' + Buffer.byteLength(response) + '\r\n\r\n' + response);
                sock.end();
                textView = textView.replace(regex,'');
                data = Buffer.from(textView, 'utf8');
            }

            if (textView.includes('Host:') && textView.includes('Connection: keep-alive') && textView.includes('HTTP')) {
                const responseErrorMsg = 'Ajax call could not be handled!',
                    responseError = JSON.stringify({success: false, message: responseErrorMsg});
                notify(responseErrorMsg, 'remove', 'danger', 0);
                try {
                    sock.write('HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nContent-Length: ' + Buffer.byteLength(responseError) + '\r\n\r\n' + responseError);
                    sock.end();
                } catch (error) {}
                return;
            }

            if (!keepConnection) {
                toggleSwitch('#on_off');
            }

            try{
                let response = await zpl(data);
                if (response) sock.write(response);
                
                // Only close connection if keepTcpSocket is disabled
                if (!keepConnection) {
                    sock.end();
                } else {
                    // Reset buffer for next command on same connection
                    buffer = Buffer.alloc(0);
                }
            }catch(err){
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
            // Debounce: wait 100ms after last chunk before processing
            if (processTimeout) clearTimeout(processTimeout);
            processTimeout = setTimeout(() => {
                const dataToProcess = buffer;
                processData(dataToProcess);
            }, 100);
        });
    });
}
// Stop tcp server
function stopTcpServer() {
    if (server == undefined) {
        return;
    }
    server.close();
    notify('Printer stopped on <b>{0}</b> Port: <b>{1}</b>'.format(configs.host, configs.port));
    server = undefined;
}
// Compute HQES hex values from current configs for preview
function computeHqesPreview() {
    let errorFlags = 0;
    if ([1, "1", true, "true"].includes(configs.hqesMediaOut)) errorFlags |= 0x00000001;
    if ([1, "1", true, "true"].includes(configs.hqesRibbonOut)) errorFlags |= 0x00000002;
    if ([1, "1", true, "true"].includes(configs.hqesHeadOpen)) errorFlags |= 0x00000004;
    if ([1, "1", true, "true"].includes(configs.hqesCutterFault)) errorFlags |= 0x00000008;
    if ([1, "1", true, "true"].includes(configs.hqesPrintheadOverTemp)) errorFlags |= 0x00000010;
    if ([1, "1", true, "true"].includes(configs.hqesMotorOverTemp)) errorFlags |= 0x00000020;
    if ([1, "1", true, "true"].includes(configs.hqesBadPrintheadElement)) errorFlags |= 0x00000040;
    if ([1, "1", true, "true"].includes(configs.hqesPrintheadDetectionError)) errorFlags |= 0x00000080;

    let warningFlags = 0;
    if ([1, "1", true, "true"].includes(configs.hqesMediaNearEnd)) warningFlags |= 0x00000008;  // Bit 3: Paper-near-end Sensor
    if ([1, "1", true, "true"].includes(configs.hqesRibbonNearEnd)) warningFlags |= 0x00000001;  // Bit 0: Need to Calibrate Media (reusing for ribbon)
    if ([1, "1", true, "true"].includes(configs.hqesReplacePrinthead)) warningFlags |= 0x00000004;  // Bit 2: Replace Printhead
    if ([1, "1", true, "true"].includes(configs.hqesCleanPrinthead)) warningFlags |= 0x00000002;  // Bit 1: Clean Printhead

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
// Init ui events
function initEvents() {
    $('#isOn, #isOff').on('change', function () {
        if ($('#isOn').is(':checked')) {
            startTcpServer();
        } else {
            stopTcpServer();
        }
    });

    $('#btn-remove').on('click', function () {
        const labels = $('.label-zpl');
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
        btn.on("click", function(e) {
            btn.prev().trigger('click');
            labels.remove();
            notify('{0} successfully removed.'.format(msg), 'trash', 'info');
        });
    });

    $('#btn-close').on('click', function () {
        global.localStorage.setItem('isOn', $('#isOn').is(':checked'));
        stopTcpServer();
        window.close();
    });

    $('#path').on('keydown', function (e) {
        e.preventDefault();
    });

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
        // Temporarily read checkbox states for preview
        const tempConfigs = {};
        $('#errors-warnings-window').find('input[type=checkbox]').each(function () {
            tempConfigs[this.id] = $(this).is(':checked');
        });
        Object.assign(configs, tempConfigs);
        updateHqesPreview();
    });

    $('#btn-errors').on('click', function () {
        initConfigs($('#errors-warnings-window'));
        updateHqesPreview();
    });

    $('#testsForm').on('submit', function (e) {
        e.preventDefault();
        let val = $('#test-data').val();
        $('#btn-close-test-md').trigger('click');
        notify('Printing raw ZPL text test', 'print', 'info', 1000);

        val = val.replaceAll(/\\n/g, '\n').replaceAll(/\\t/g, '\t').replaceAll(/\\r/g, '\r').replaceAll(/\\b/g, '\b')

        return zpl(val);
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

    $('#btn-setting').on('click', function () {
        if ($('#isOn').is(':checked')) {
            toggleSwitch('#on_off');
        }
        initConfigs($('#settings-window'));
    });

    $('#saveLabels').on('change', function () {
        $('#btn-filetype, #btn-path, #filetype, #path').prop('disabled', !$(this).is(':checked'));
    });

    $('.btn-close-save-settings').on('click', function () {
        if (configs.keepTcpSocket && ! $('#isOn').is(':checked')) {
            toggleSwitch('#on_off');
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
            zpl(base64);
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
            configs['version'] = ' v' + version;
        }
    });

    ipcRenderer.send('get-app-version');
}
// Toggle on/off switch
// @param {Dom Object} btn Button group to toggle
function toggleSwitch(group) {
    let radios = $(group).find('input[type=radio]');
    let first = $(radios[0]).is(':checked');

    $(radios[first?1:0]).prop('checked', true).trigger('change');
}
// Save configs in local storage
function saveConfigs(context) {
    context = context || $('body');
    for (let key in configs) {
        let $el = context.find('#' + key);

        if (!$el.length) {
            continue;
        }

        if (['checkbox', 'radio'].includes(($el.attr('type') || '').toLowerCase())) {
            configs[key] = $el.is(':checked');
        } else {
            configs[key] = $el.val();
        }
    }

    Object.entries(configs).forEach(function ([k, v]) {
        global.localStorage.setItem(k, v);
    });

    notify('Printer settings changes successfully saved', 'cog', 'info');
    $('.btn-close-save-settings').trigger('click');
}
// Init/load configs from local storage
function initConfigs(context) {
    console.log('init', configs);
    context = context || $('body');

    for (let key in configs) {
        let $el = context.find('#' + key);

        if (!$el.length) {
            continue;
        }

        if (['checkbox', 'radio'].includes(($el.attr('type') || '').toLowerCase())) {
            $el.prop('checked', [true, 'true', 1, '1'].includes(configs[key])).trigger('change');
        } else {
            $el.val(configs[key]);
        }
    }
}
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
// Prototype for string/number datatypes
String.prototype.format = function () {
    let s = this, i = arguments.length;
    while (i--) {
        s = s.replace(new RegExp('\\{' + i + '\\}', 'gm'), arguments[i]);
    }
    return s;
};
String.prototype.fixCharForRegex = function () {
    let c = this + '';
    c = !c?' ' : (c==="]"? "\\]" : (c==="^"? "\\^" : ((c==="\\" ? "\\\\" : c))));
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
