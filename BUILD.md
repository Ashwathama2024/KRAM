# DutySync Master — Desktop App Build Guide

Converts the web application into a **standalone Windows/Mac/Linux desktop app**
that installs like normal software — no Docker, no Python, no Node required on
the target machine.

---

## What you get

```
release/
└── DutySyncMaster/
    ├── DutySyncMaster.exe     ← double-click to run (Windows)
    ├── DutySyncMaster         ← executable (Linux/Mac)
    └── ...                    ← bundled Python runtime + frontend

installer/
└── Output/
    └── DutySyncMaster-Setup.exe  ← one-click Windows installer
```

**Behaviour after launch:**
- Server starts silently on `localhost:8765`
- Browser opens automatically
- System tray icon appears (right-click → Quit)
- Data stored in `DutySyncData/dutysync.db` beside the executable

---

## Prerequisites (build machine only)

| Tool | Version | Link |
|------|---------|------|
| Python | 3.11+ | https://python.org |
| Node.js | 20+ | https://nodejs.org |
| Inno Setup (Windows installer, optional) | 6+ | https://jrsoftware.org/isinfo.php |

---

## Build (one command)

```bash
# 1. Clone repo and switch branch
git clone https://github.com/Ashwathama2024/marinegpt-backend.git
cd marinegpt-backend
git checkout claude/dutysync-master-app-YVW4n
cd dutysync

# 2. Install Python build dependencies
cd backend
pip install -r requirements.txt
cd ..

# 3. Run the all-in-one build script
python build_app.py
```

Done. The app is in `release/DutySyncMaster/`.

---

## Step-by-step (manual)

### Step 1 — Build React frontend
```bash
cd frontend
npm install
npm run build        # → frontend/dist/
cd ..
```

### Step 2 — Package with PyInstaller
```bash
cd backend
pip install pyinstaller==6.6.0 pystray==0.19.5 Pillow==10.3.0
pyinstaller dutysync.spec --noconfirm
cd ..
```

Output: `backend/dist/DutySyncMaster/`

### Step 3 — Run directly
```
backend/dist/DutySyncMaster/DutySyncMaster.exe
```

---

## Create Windows Installer (.exe)

After `python build_app.py` completes:

```
1. Install Inno Setup from https://jrsoftware.org/isinfo.php
2. Open a terminal and run:
   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\DutySyncMaster.iss
3. Installer: installer\Output\DutySyncMaster-Setup.exe
```

Or open `installer/DutySyncMaster.iss` in Inno Setup IDE → press **F9**.

---

## Create macOS DMG (optional)

```bash
brew install create-dmg
python build_app.py                # builds the .app bundle
create-dmg release/DutySyncMaster.dmg release/DutySyncMaster/
```

---

## App Data Location

| Platform | Path |
|----------|------|
| Windows | `C:\Program Files\DutySync Master\DutySyncData\` |
| macOS | `<app folder>/DutySyncData/` |
| Linux | `<app folder>/DutySyncData/` |

Database file: `DutySyncData/dutysync.db` (SQLite — can be backed up freely)

---

## Troubleshooting

| Problem | Solution |
|---------|---------|
| Browser doesn't open | Manually visit http://localhost:8765 |
| Port 8765 in use | App auto-selects next free port |
| Antivirus blocks exe | Add exception — PyInstaller binaries often trigger false positives |
| `frontend/dist not found` warning | Run `npm run build` in `frontend/` first |
| Blank white screen | Wait 5 seconds and refresh — server needs a moment to start |

---

## Docker mode (alternative)

If you prefer Docker over the desktop app:

```bash
cd dutysync
docker compose up --build
# → http://localhost
```
