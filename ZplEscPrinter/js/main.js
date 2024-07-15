const $ = global.$ = global.jQuery = require('jquery');
const createPopper = global.createPopper = require('@popperjs/core');
const Bootstrap = global.Bootstrap = require('bootstrap');
const { ipcRenderer } = require('electron');
const fs = require('fs');;
const net = require('net');
const bootbox = require('bootbox');

let clientSocketInfo;
let server;
let configs = {};

const defaults = {
    isZpl: true,
    isOn: true,
    density: '8',
    width: '4',
    height: '6',
    unit: '1',
    host: '127.0.0.1',
    port: '9100',
    bufferSize: '4096',
    keepTcpSocket: true,
    saveLabels: false,
    filetype: '3',
    path: null,
    counter: 0
};

$(function () {
    $(window).bind('focus blur', function () {
        $('#panel-head').toggleClass('panel-heading-blur');
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
        fs.writeFileSync(path + '/' + fileName, typeof blob === 'string' ? blob : new Uint8Array(await blob.arrayBuffer()))
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
    try{ data = atob(data.trim()); }catch(e){}
    const zpls = data.split(/\^XZ|\^xz/);
    const factor = configs.unit === '1' ? 1 : (configs.unit === '2' ? 2.54 : (configs.unit === '3' ? 25.4 : 96.5));
    const width = parseFloat(configs.width) / factor;
    const height = Math.round(parseFloat(configs.height) * 1000 / factor) / 1000;

    if (zpls.length > 1 && zpls[zpls.length - 1].trim() === '') {
        zpls.pop();
    }

    for (let zpl of zpls) {
        if (!zpl || !zpl.trim().length) {
            console.warn(`zpl = '${zpl}', seems invalid`);
            continue;
        }

        zpl += '^XZ';

        let api_url = atob('aHR0cDovL2FwaS5sYWJlbGFyeS5jb20vdjEvcHJpbnRlcnMvezB9ZHBtbS9sYWJlbHMvezF9eHsyfS8wLw==')
            .format(configs.density, width>15.0 ? 15 : width, height);
        let blob = await displayZplImage(api_url, zpl, width, height);

        if (![1, '1', true, 'true'].includes(configs.saveLabels)) {
            return;
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
}
async function displayZplImage(api_url, zpl, width, height) {
    let r1 = await fetch(api_url, {
        method: "POST",
        body: zpl,
        headers: {'Content-Type': 'application/x-www-form-urlencoded'}
    })

    if (!r1.ok || r1.status !== 200) {
        console.log('error in fetching image', `status = ${r1.status}`, await r1.text(), `zpl = ${zpl}`)
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
// Start tcp server and listen on configuret host/port
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
        sock.write(JSON.stringify({success: true}, 'text/html'));

        sock.on('data', async function (data) {
            notify('{0} bytes received from Client: <b>{1}</b> Port: <b>{2}</b>'.format(data.length, clientSocketInfo.peerAddress, clientSocketInfo.peerPort), 'print', 'info', 1000);
            //console.log(String.fromCharCode.apply(null, new Uint8Array(data)));
            const regex = /POST.*\r\n\r\n/gs;
            const code = String.fromCharCode.apply(null, new Uint8Array(data)).replace(regex,'');
            if (code.includes('Host:') && code.includes('Connection: keep-alive') && code.includes('HTTP')) {
                console.log('It\'s an ajax call');
                return;
            }

            if (![1, '1', true, 'true'].includes(configs.keepTcpSocket)) {
                toggleSwitch('#on_off');
            }

            try{
                if ($('#isZpl').is(':checked')) {
                    zpl(code);
                }
            }catch(err){
                console.error(err);
                notify('ERROR: {0}'.format(err.message), 'print', 'danger', 0)
            }
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
// Init ui events
function initEvents() {
    $('#isZpl').on('change', function () {
        const zplPrinter = $('#isZpl').is(':checked');
        $('.panel-printer-title').text('ZPL');
        $('.is-zpl')[zplPrinter ? 'show' : 'hide']();
    });

    $('#isOn, #isOff').on('change', function () {
        if ($('#isOn').is(':checked')) {
            startTcpServer();
        } else {
            stopTcpServer();
        }
    });

    $('#btn-remove').on('click', function () {
        const zplPrinter = $('#isZpl').is(':checked');
        const labels = $('.label-zpl');
        const size = labels.length;

        if (!size) {
            return;
        }

        const msg = '{0} {2} {1}'.format(size, size === 1 ? 'label' : 'labels', 'zpl');
        bootbox.confirm('Are you sure to remove {0}?'.format(msg), function (result) {
            if (result) {
                labels.remove();
                notify('{0} successfully removed.'.format(msg), 'trash', 'info');
            }
        });
    });

    $('#btn-close').on('click', function () {
        global.localStorage.setItem('isZpl', $('#isZpl').is(':checked'));
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

    $('#testsForm').on('submit', function (e) {
        e.preventDefault();
        let val = $('#test-data').val();
        const zplPrinter = $('#isZpl').is(':checked');
        $('#btn-close-test-md').trigger('click');
        notify('Printing raw ' + 'zpl' + ' text test', 'print', 'info', 1000);

        val = val.replaceAll(/\\n/g, '\n').replaceAll(/\\t/g, '\t').replaceAll(/\\r/g, '\r').replaceAll(/\\b/g, '\b')

        if (zplPrinter) {
            return zpl(val);
        }

        try{
            val = JSON.parse(JSON.stringify(val).replaceAll(/(\\\\|\/)[u|U]00/g, '\\u00').replaceAll(/\\\\[x|X]/g, '\\u00'));
        }catch(e){}

    });

    $('.btn-close-test-md').on('click', function () {
        $('#test-data').val('');
    });

    $('#btn-run-test-hw').on('click', function () {
        const data = $('#isZpl').is(':checked')
            ? btoa('^xa^cfa,50^fo100,100^fdHello World^fs^xz')
            : btoa("\u001B@\u001Ba\u0001\u001BE\u0001\u001B!VHello World\u001BE\u0000\u001Ba\u0000\u000A\u001DVA\u0003");
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
            if ($('#isZpl').is(':checked')) {
                zpl(base64);
            }
        }
    });
}
// Toggle on/off switch
// @param {Dom Object} btn Button group to toggle
function toggleSwitch(group) {
    let radios = $(group).find('input[type=radio]');
    let first = $(radios[0]).is(':checked');

    $(radios[first?1:0]).prop('checked', true).trigger('change');
}
// Save configs in local storage
function saveConfigs() {
    for (let key in configs) {
        let $el = $('#' + key);

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
    $('#btn-close-save-settings').trigger('click');
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