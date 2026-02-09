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

## Docker Deployment

The project supports both web application and desktop app server modes via Docker.

### Prerequisites
- **Docker** 20.10+
- **Docker Compose** 2.0+

### Quick Start

#### Web Application Mode (Default)
```bash
# Start web app with default profile
docker compose --profile web up -d

# Or explicitly
docker compose up -d zpl-printer-web
```

Access the web UI at `http://localhost:4000` and TCP port at `9100`.

#### Desktop App Server Mode (Headless)
```bash
# Start desktop server mode
docker compose --profile desktop up -d zpl-printer-desktop
```

This runs the desktop app's TCP server functionality without the GUI.

### Configuration

#### Environment Variables

**Web App:**
- `WEB_PORT` - Web UI port (default: 4000)
- `TCP_PORT` - ZPL TCP port (default: 9100)

**Desktop Server:**
- `TCP_PORT` - ZPL TCP port (default: 9100)
- `HOST` - Bind address (default: 0.0.0.0)
- `PORT` - TCP port (default: 9100)
- `IS_ON` - Enable server (default: true)
- `KEEP_TCP_SOCKET` - Keep connections alive (default: true)
- `SAVE_LABELS` - Save labels to disk (default: false)
- `LABELS_PATH` - Path to save labels (default: /app/labels)
- `DENSITY` - Print density (default: 8)
- `WIDTH` - Label width (default: 4)
- `HEIGHT` - Label height (default: 6)
- `UNIT` - Unit type (default: 1)

#### Custom Ports
```bash
# Use custom ports
WEB_PORT=5000 TCP_PORT=9200 docker compose --profile web up -d
```

#### Volumes
- `zpl-config` - Web app configuration storage
- `zpl-labels` - Saved labels storage

### Building Images

```bash
# Build web app
docker build --build-arg APP_MODE=web -t zpl-printer-web .

# Build desktop server
docker build --build-arg APP_MODE=desktop -t zpl-printer-desktop .
```

### Docker Compose Examples

```yaml
# docker-compose.override.yml (optional)
version: '3.8'
services:
  zpl-printer-web:
    environment:
      - PORT=4000
    ports:
      - "4000:4000"
      - "9100:9100"
  
  zpl-printer-desktop:
    environment:
      - PORT=9100
      - SAVE_LABELS=true
      - DENSITY=12
    ports:
      - "9100:9100"
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
