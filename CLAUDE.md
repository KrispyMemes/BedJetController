# BedJet Custom App — Developer Reference

## Project Overview

A custom BedJet V3 climate controller with two parts:

1. **Raspberry Pi backend** — maintains the single BLE connection to the BedJet and exposes a WiFi API + serves web UI
2. **Web app** — both phones access via browser on the same WiFi network

```
Phone 1 (Doug)    ──┐
                    ├──► Raspberry Pi (FastAPI + WebSocket + Static Web) ──BLE──► BedJet V3
Phone 2 (Leanna)  ──┘
  (browser)        http://PI_IP:8000                  (Bluetooth Low Energy)
```

**Why web instead of React Native/Expo?** Simpler architecture, no app install needed, works on any browser, avoids native module compatibility issues.

---

## BedJet V3 BLE Protocol Reference

### UUIDs

| Characteristic | UUID                                   | Purpose                        |
|----------------|----------------------------------------|--------------------------------|
| Service        | `00001000-bed0-0080-aa55-4265644a6574` | Primary service                |
| Status         | `00002000-bed0-0080-aa55-4265644a6574` | Live status notifications      |
| Command        | `00002004-bed0-0080-aa55-4265644a6574` | Send commands (write-only)     |

### Commands

| Action      | Bytes                          | Notes                                    |
|-------------|--------------------------------|------------------------------------------|
| Button press| `[0x01, BUTTON_ID]`            | See button ID table below                |
| Temperature | `[0x03, VALUE]`                | VALUE = half-degrees Celsius (40 = 20°C) |
| Fan speed   | `[0x07, STEP]`                 | STEP 0–19 maps to 5%–100%               |
| Timer       | `[0x02, HOURS, MINUTES]`       |                                          |
| Clock sync  | `[0x08, HOUR, MINUTE]`         | Set BedJet's internal clock              |

### Operating Modes

| Integer | Mode          |
|---------|---------------|
| 0       | Standby (off) |
| 1       | Heat          |
| 2       | Turbo         |
| 3       | Extended Heat |
| 4       | Cool          |
| 5       | Dry           |
| 6       | Wait          |

### Status Packet Layout (from BLE notification)

| Byte(s) | Field             | Notes                          |
|---------|-------------------|--------------------------------|
| 0       | Magic = `0x56`    | Validates packet               |
| 3       | Timer hours       |                                |
| 4       | Timer minutes     |                                |
| 5       | Timer seconds     |                                |
| 6       | Actual temp       | Half-degrees Celsius           |
| 7       | Setpoint temp     | Half-degrees Celsius           |
| 8       | Mode              | 0–6 (see table above)          |
| 9       | Fan step          | 0–19                           |
| last    | Checksum          | `(~SUM) & 0xFF`                |

### Temperature Conversion

```
BedJet value → Fahrenheit:  F = round((value / 2) * 9/5 + 32)
Fahrenheit → BedJet value:  value = round((F - 32) * 5/9 * 2)
```

Valid range: **66°F – 104°F** (33°C – 40°C)

---

## Folder Structure

```
BedJetController/
├── CLAUDE.md                  # This file
├── pi/                        # Raspberry Pi backend (FastAPI)
│   ├── main.py                # Entry point — starts API + serves static web
│   ├── bedjet_ble.py          # BLE connection + command layer
│   ├── api.py                 # FastAPI HTTP and WebSocket routes
│   ├── websocket_manager.py   # Broadcasts live status to clients
│   ├── requirements.txt       # Python dependencies
│   ├── bedjet.service         # systemd service for auto-start on boot
│   └── static/                # Static web files (served by FastAPI)
│       ├── index.html         # Main HTML page
│       ├── app.js             # React app (or vanilla JS)
│       ├── styles.css         # Styling
│       └── socket-client.js   # WebSocket connection logic
└── app/                       # (DEPRECATED: was React Native/Expo, pivoted to web)
```

---

## Raspberry Pi Setup

### First-time setup

```bash
# 1. Install system dependencies
sudo apt update && sudo apt install -y python3-pip python3-venv bluetooth bluez

# 2. Create a virtual environment
cd ~/BedJetController/pi
python3 -m venv venv
source venv/bin/activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Find your BedJet's Bluetooth MAC address
python3 -c "import asyncio; from bleak import BleakScanner; asyncio.run(BleakScanner.discover())" 
# Look for a device named "BedJet" in the output

# 5. Set your BedJet MAC address
export BEDJET_MAC="XX:XX:XX:XX:XX:XX"   # replace with your MAC

# 6. Run the server
python3 main.py
```

### Install as a system service (auto-start on boot)

```bash
# Edit bedjet.service and update BEDJET_MAC and the ExecStart path
nano bedjet.service

# Install the service
sudo cp bedjet.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable bedjet
sudo systemctl start bedjet
```

### Managing the service

```bash
sudo systemctl status bedjet        # Check if running
sudo systemctl restart bedjet       # Restart after code changes
sudo systemctl stop bedjet          # Stop the service
journalctl -u bedjet -f             # Watch live logs
journalctl -u bedjet --since today  # Today's logs
```

---

## Testing the Pi Backend

```bash
# Check current BedJet status
curl http://PI_IP:8000/status

# Turn off
curl -X POST http://PI_IP:8000/command/off

# Set mode to Cool (mode 4)
curl -X POST http://PI_IP:8000/command/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": 4}'

# Set temperature to 72°F
curl -X POST http://PI_IP:8000/command/temperature \
  -H "Content-Type: application/json" \
  -d '{"temp_f": 72}'

# Set fan to step 10 (55%)
curl -X POST http://PI_IP:8000/command/fan \
  -H "Content-Type: application/json" \
  -d '{"step": 10}'

# Set timer to 30 minutes
curl -X POST http://PI_IP:8000/command/timer \
  -H "Content-Type: application/json" \
  -d '{"hours": 0, "minutes": 30}'

# Watch live WebSocket stream (requires wscat: npm install -g wscat)
wscat -c ws://PI_IP:8000/ws

# Auto-generated API docs (open in browser)
http://PI_IP:8000/docs
```

---

## Web App Setup

The web UI is served directly from the Raspberry Pi. No separate build step needed for basic version.

### Option 1: Simple HTML/CSS/JavaScript (Recommended for simplicity)
1. Create `pi/static/index.html` with a form-based interface
2. The Pi's FastAPI serves it at `http://PI_IP:8000/`
3. On your phone, navigate to that URL in any browser

### Option 2: React-based Web App (if reusing existing React code)
```bash
# On your development machine (not the Pi)
cd web
npm install
npm run build
# Copy build output to pi/static/
```

Both phones access the app the same way:
- Open browser → `http://PI_IP:8000/`
- Bookmark or add to home screen for quick access
- WebSocket connection happens automatically in the browser

---

## Development Phases

### Phase 1 — Pi BLE Core ✅
- [x] BLE connection to BedJet (`bedjet_ble.py`)
- [x] FastAPI server with REST endpoints (`api.py`)
- [x] WebSocket status broadcast (`websocket_manager.py`)
- [x] systemd service for auto-start (`bedjet.service`)

### Phase 2 — React Native/Expo App (DEPRECATED ⚠️)
- [x] Settings screen (enter Pi IP)
- [x] Live WebSocket status display
- [x] Power on/off
- [x] Mode selection
- [x] Fan speed slider
- [x] Temperature control
- ⚠️ **PIVOTED TO WEB**: React Native SDK version conflicts made Expo Go unusable on physical iOS devices. Switching to browser-based web app for simplicity.

### Phase 3 — Web App (NEW) ⏳
- [ ] Static web UI served from Pi (`pi/static/index.html`)
- [ ] Control panel (mode, temp, fan, timer)
- [ ] Live WebSocket status display
- [ ] Responsive design (mobile + desktop)
- [ ] Power on/off, mode selection, temp/fan control

### Phase 4 — Polish (TODO)
- [ ] mDNS auto-discovery (easy URL like `http://bedjet.local`)
- [ ] Scheduling / timer UI
- [ ] Graceful error screens when Pi is offline
- [ ] Pi auto-starts on boot and auto-reconnects to BedJet

### Phase 5 — Optional / Future
- [ ] Remote access via Tailscale
- [ ] Scheduled temperature sequences (biorhythm)
- [ ] Dual-zone support (two BedJets)

---

## Coding Conventions

- **Python**: `async/await` throughout. BLE logic stays in `bedjet_ble.py` — never mix into API routes.
- **JavaScript**: Functional components and hooks only. No class components.
- **Temperatures**: Fahrenheit everywhere in the UI. Conversion happens only in `bedjet_ble.py`.
- **Logging**: Add `print()` or `logging` statements liberally on the Pi side — they help debug BLE issues.

---

## When Starting a New Claude Session

1. Read this file first
2. Check the Development Phases section above to see where we left off
3. Ask which specific task to tackle next
4. Before writing BLE or WebSocket code, confirm the approach
5. Test in small steps — don't write 200 lines before testing the first 20
