# ZPL Printer Emulator

Printer emulator for ZPL (Zebra Programming Language) rendering engine. The emulator is based on the [labelary](http://labelary.com/service.html) web service.
You can configure print density, label size and the tcp server to listen for any incoming labels.

[Releases](https://github.com/erikn69/ZplEscPrinter/releases/latest)

## Supported ZPL Commands

| Command | Name | Description |
|---------|------|-------------|
| `~HS` | Host Status | Returns printer status (3-string response with STX/ETX framing) |
| `~HQES` | Host Query Error Status | Returns error/warning bitmask flags (configurable via Errors & Warnings page) |
| `~HI` | Host Identification | Returns printer model and firmware info |
| `~WC` | Configuration Label | Returns printer configuration |
| `~WD` | Directory Listing | Returns stored file listing |
| `~JA` | Cancel All | Cancels all pending formats in the buffer |
| `~PS` | Print Start | Resumes printing after pause |

## Installation

#### Windows
- Download `zpl-printer-*-setup.exe` from releases
- Run the installer

#### Linux
```bash
# Debian/Ubuntu
sudo dpkg -i zpl-printer_*_amd64.deb

# RedHat/CentOS
sudo rpm -i zpl-printer-*.x86_64.rpm
```

#### macOS
```bash
# Unzip the file
unzip ZPL.Printer-darwin-*.zip
# Move to Applications
mv "ZPL Printer.app" /Applications/
```

## Development

### Prerequisites
- **Node.js** 18+ (recommended : 20 LTS)
- **yarn** (recommended) or **npm**
- **Git**

### Installation
```bash
git clone https://github.com/sshaizkhan/zpl-printer-emulator.git
cd zpl-printer-emulator
yarn install  # or: npm install
```

### Commands
```bash
yarn start       # Development mode with logs
yarn package     # Package for current OS
yarn make        # Generate multi-OS binaries
```

*npm equivalent :* `npm start`, `npm run package`, `npm run make`

## References
* [ZPL Command Support](http://labelary.com/docs.html)
* [ZPL Web Service](http://labelary.com/service.html)
* [Zebra ZPL Programming Guide](https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands.html)
* [Electron](https://www.electronjs.org)
* [Electron Forge](https://www.electronforge.io)

## Release notes

### Version 4.0
* **Removed** ESC/POS support (ZPL-only emulator)
* **New** `~HQES` (Host Query Error Status) command with configurable error/warning flags
* **New** `~JA` (Cancel All) command support
* **New** `~PS` (Print Start) command support
* **Improved** `~HS` (Host Status) response with proper field structure per Zebra spec
* **New** Dedicated Errors & Warnings page for ~HQES emulation
* **Removed** Promo directory

### Version 3.0
* **Refactor** Reworked code
* **Fix** Bug fixes

### Version 2.2
* **Refactor** Reworked code
* **Upgrade** Bump dependencies

### Version 2.1
* **Refactor** Reworked entire app
* **Fix** Save labels
* **New** Support raw text file on save labels
* **New** Support pixels for width/height

### Version 2.0
* **Refactor** Reworked entire app to run in an Electron app instead of the Chrome Plugin API

### Version 1.6
* **Fix** PDF label export.
* **New** TCP input buffer size can be configure in settings.

### Version 1.5
* **New** Support to print multiple labels in one request.
* **New** Optional setting to keep tcp connection alive.

### Contributing

checkout the project. run `yarn install`. use `yarn start` to run in development mode and use `yarn make` to generate binaries for your OS
