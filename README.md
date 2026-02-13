# ZPL Printer Emulator

Printer emulator for ZPL (Zebra Programming Language) rendering engine. The emulator is based on the [labelary](http://labelary.com/service.html) web service.
You can configure print density, label size and the TCP server to listen for any incoming labels.

[Releases](https://github.com/erikn69/ZplEscPrinter/releases/latest)

## Multi-Printer Support

The **web application** mode supports multiple virtual printers, allowing you to emulate several ZPL printers simultaneously—each with its own TCP port, configuration, and label history.

### Features

- **Add/Remove printers** — Create multiple virtual printers; each can listen on a different port (e.g., 9100, 9101, 9102)
- **Per-printer configuration** — Each printer has its own density, label size, unit, host, port, and error/warning flags
- **Per-printer label history** — Labels are tracked separately for each printer (up to 50 labels per printer)
- **Per-printer TCP servers** — Start or stop each printer’s TCP server independently
- **Active printer selection** — Switch between printers in the UI to view labels and manage settings

### Usage (Web App)

1. Start the web app: `docker compose --profile web up -d` or run the web server locally
2. Access the UI at `http://localhost:4000`
3. Use the printer selector to add printers or switch between them
4. Configure each printer’s host, port, and label settings
5. Start the TCP server for each printer — each listens on its assigned port

### API Endpoints (Multi-Printer)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/printers` | List all printers and get state |
| POST | `/api/printers` | Add a new printer |
| DELETE | `/api/printers/:printerId` | Remove a printer (requires at least one remaining) |
| GET | `/api/printers/:printerId/config` | Get printer config |
| POST | `/api/printers/:printerId/config` | Update printer config |
| POST | `/api/printers/:printerId/tcp/start` | Start TCP server for printer |
| POST | `/api/printers/:printerId/tcp/stop` | Stop TCP server for printer |
| POST | `/api/printers/:printerId/print` | Send ZPL data to a specific printer |
| GET | `/api/printers/:printerId/labels` | Get labels for a printer |
| DELETE | `/api/printers/:printerId/labels` | Clear all labels for a printer |

### Socket.IO Events (Real-time)

- `printers-state` — Full state (printers, activePrinterId, tcpStatuses, labelHistories)
- `printers-updated` — Printer list changed (add/remove)
- `config-updated` — Printer config changed
- `tcp-status` — TCP server started/stopped for a printer
- `label` — New label rendered for a printer
- `labels-cleared` — Labels cleared for a printer

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
