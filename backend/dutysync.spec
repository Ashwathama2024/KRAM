# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for DutySync Master.
Produces a single-folder build (onedir) containing:
  - DutySyncMaster.exe  (Windows) / DutySyncMaster (Linux/Mac)
  - All Python dependencies
  - The compiled React frontend (dist/)

Run:  pyinstaller dutysync.spec
"""

import sys
import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

# ── Collect hidden imports ─────────────────────────────────────────────────────
hidden = []
for pkg in [
    "uvicorn", "uvicorn.logging", "uvicorn.loops", "uvicorn.loops.auto",
    "uvicorn.protocols", "uvicorn.protocols.http", "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets", "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan", "uvicorn.lifespan.on",
    "fastapi", "starlette", "anyio", "anyio._backends._asyncio",
    "sqlalchemy", "sqlalchemy.dialects.sqlite",
    "pydantic", "pydantic_settings",
    "pystray", "PIL",
    "email.mime.text", "email.mime.multipart",
    "fpdf",
]:
    hidden.append(pkg)

hidden += collect_submodules("uvicorn")
hidden += collect_submodules("fastapi")
hidden += collect_submodules("starlette")
hidden += collect_submodules("sqlalchemy")
hidden += collect_submodules("pydantic")

# ── Data files ─────────────────────────────────────────────────────────────────
# Include the built React frontend (must be built first: npm run build)
frontend_dist = os.path.join("..", "frontend", "dist")

datas = []
if os.path.exists(frontend_dist):
    datas.append((frontend_dist, "frontend/dist"))
else:
    print(
        "\n⚠  WARNING: frontend/dist not found. "
        "Run 'npm run build' inside frontend/ before packaging.\n"
    )

# ── Analysis ───────────────────────────────────────────────────────────────────
a = Analysis(
    ["launcher.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "scipy", "test", "unittest"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="DutySyncMaster",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,          # No console window on Windows
    icon="assets/icon.ico" if os.path.exists("assets/icon.ico") else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="DutySyncMaster",
)
