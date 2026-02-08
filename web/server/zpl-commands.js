/**
 * ZPL Command Handler
 * Handles Zebra tilde commands (~HS, ~HQES, ~HI, ~WC, ~WD, ~JA, ~PS)
 */
class ZplCommands {
  constructor(configs = {}) {
    this.configs = configs;
    this.commands = {
      getStatus: '~HS',
      getErrorStatus: '~HQES',
      getInfo: '~HI',
      getConfig: '~WC',
      getDirectory: '~WD',
      cancelAll: '~JA',
      printStart: '~PS',
    };
  }

  matchCommand(data) {
    const cmd = data.trim().toUpperCase();
    const match = Object.values(this.commands).find((c) => c === cmd);
    if (!match) return false;

    if (cmd === this.commands.cancelAll) {
      return {
        action: (configs) => {
          console.log('~JA: Cancel All - clearing print buffer');
        },
        message: 'All pending formats cancelled',
        response: null,
      };
    }

    if (cmd === this.commands.printStart) {
      return {
        action: (configs) => {
          if (configs.zplPrinterPaused) {
            configs.zplPrinterPaused = false;
          }
          console.log('~PS: Print Start - resuming from pause');
        },
        message: 'Printing resumed',
        response: null,
      };
    }

    return true;
  }

  extractCommands(data) {
    const commandPattern = /~(HQES|HS|HI|WC|WD|JA|PS)/gi;
    const commands = [];
    let match;
    while ((match = commandPattern.exec(data)) !== null) {
      commands.push('~' + match[1].toUpperCase());
    }
    const labelData = data.replace(commandPattern, '').trim();
    return { commands, labelData };
  }

  getResponse(data) {
    const cmd = data.trim().toUpperCase();
    switch (cmd) {
      case this.commands.getStatus:
        return this.getPrinterStatus();
      case this.commands.getErrorStatus:
        return this.getHostQueryErrorStatus();
      case this.commands.getInfo:
        return this.getPrinterInfo();
      case this.commands.getConfig:
        return this.getPrinterConfig();
      case this.commands.getDirectory:
        return this.getPrinterDirectory();
    }
  }

  _isTruthy(val) {
    return [1, '1', true, 'true'].includes(val);
  }

  getPrinterStatus() {
    const c = this.configs;
    const t = this._isTruthy.bind(this);

    const paperOut = t(c.zplPaperOut) ? 1 : 0;
    const paused = t(c.zplPrinterPaused) ? 1 : 0;
    const string1 = [
      '030', paperOut, paused, '0832', '0', '0', '0', '0', '000', '0',
      t(c.zplHeadTooHot) ? '1' : '0', '0',
    ].join(',');

    const headOpen = t(c.zplHeadOpen) ? 1 : 0;
    const ribbonOut = t(c.zplRibbonOut) ? 1 : 0;
    const string2 = [
      '001', '0', headOpen, ribbonOut, '1', '0', '0', '0', '0', '0', '0',
    ].join(',');

    const string3 = ['0', '0'].join(',');

    return (
      '\x02' + string1 + '\x03\r\n' +
      '\x02' + string2 + '\x03\r\n' +
      '\x02' + string3 + '\x03\r\n'
    );
  }

  getHostQueryErrorStatus() {
    const c = this.configs;
    const t = this._isTruthy.bind(this);

    let errorFlags = 0;
    if (t(c.hqesMediaOut)) errorFlags |= 0x00000001;
    if (t(c.hqesRibbonOut)) errorFlags |= 0x00000002;
    if (t(c.hqesHeadOpen)) errorFlags |= 0x00000004;
    if (t(c.hqesCutterFault)) errorFlags |= 0x00000008;
    if (t(c.hqesPrintheadOverTemp)) errorFlags |= 0x00000010;
    if (t(c.hqesMotorOverTemp)) errorFlags |= 0x00000020;
    if (t(c.hqesBadPrintheadElement)) errorFlags |= 0x00000040;
    if (t(c.hqesPrintheadDetectionError)) errorFlags |= 0x00000080;

    let warningFlags = 0;
    if (t(c.hqesMediaNearEnd)) warningFlags |= 0x00000008;
    if (t(c.hqesRibbonNearEnd)) warningFlags |= 0x00000001;
    if (t(c.hqesReplacePrinthead)) warningFlags |= 0x00000004;
    if (t(c.hqesCleanPrinthead)) warningFlags |= 0x00000002;

    const errHex = errorFlags.toString(16).padStart(8, '0');
    const warnHex = warningFlags.toString(16).padStart(8, '0');

    return (
      '\x02' +
      'PRINTER STATUS\r\n' +
      '    ERRORS: 1 00000000 ' + errHex + '\r\n' +
      '    WARNINGS: 1 00000000 ' + warnHex + '\r\n' +
      '\x03'
    );
  }

  getPrinterInfo() {
    return (
      '\x02EN SYSTEMS CORP.\x03\r\n' +
      '\x02ZEBRA ' + this.configs.density + 'dpmm EMULATOR\x03\r\n' +
      '\x02FIRMWARE' + (this.configs.version || '') + ' (JS EMULATOR)\x03\r\n'
    );
  }

  getPrinterConfig() {
    return '^XA^MMT^PR5,5,5^MD0^LH0,0^JMA^XZ';
  }

  getPrinterDirectory() {
    return (
      '\x02R:FILE1.ZPL,1024\r\n' +
      'R:LABEL.ZPL,512\r\n' +
      'R:LOGO.GRF,8192\r\n\x03\r\n'
    );
  }
}

module.exports = ZplCommands;
