# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for KRAM — Kartavya Roster & App Management.

Produces a single-folder build (onedir):
  - KRAM.exe          (Windows entry point)
  - All Python runtime dependencies
  - Compiled React frontend (frontend/dist/)

Prerequisites:
  1. cd frontend && npm run build
  2. pip install -r backend/requirements.txt
  3. cd backend && pyinstaller KRAM.spec --noconfirm

Or simply run: python build_app.py
"""

import sys
import os
from PyInstaller.utils.hooks import collect_submodules

# ── Hidden imports ─────────────────────────────────────────────────────────────
hidden = [
    # uvicorn core
    "uvicorn", "uvicorn.logging", "uvicorn.main",
    "uvicorn.loops", "uvicorn.loops.auto", "uvicorn.loops.asyncio",
    "uvicorn.protocols", "uvicorn.protocols.http", "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets", "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan", "uvicorn.lifespan.on", "uvicorn.lifespan.off",
    # ASGI / async
    "anyio", "anyio._backends._asyncio",
    "asyncio",
    # FastAPI / Starlette
    "fastapi", "starlette", "starlette.routing", "starlette.middleware.base",
    # SQLAlchemy
    "sqlalchemy", "sqlalchemy.dialects.sqlite", "sqlalchemy.dialects.sqlite.pysqlite",
    "sqlalchemy.sql.default_comparator", "sqlalchemy.ext.baked",
    # Pydantic v2
    "pydantic", "pydantic_settings",
    "pydantic.deprecated.class_validators",
    # System tray + icon rendering
    "pystray", "pystray._win32",
    "PIL", "PIL.Image", "PIL.ImageDraw", "PIL.ImageFont",
    # PDF export
    "fpdf",
    "reportlab", "reportlab.pdfbase.pdfmetrics", "reportlab.pdfbase._fontdata",
    # Email stdlib
    "email.mime.text", "email.mime.multipart",
    # Windows-specific
    "winreg", "ctypes", "ctypes.wintypes",
    # h11 (HTTP/1.1 for uvicorn)
    "h11",
]

# Collect all submodules for packages that have dynamic imports
hidden += collect_submodules("uvicorn")
hidden += collect_submodules("fastapi")
hidden += collect_submodules("starlette")
hidden += collect_submodules("sqlalchemy")
hidden += collect_submodules("pydantic")
hidden += collect_submodules("anyio")

# ── Data files ─────────────────────────────────────────────────────────────────
frontend_dist = os.path.join("..", "frontend", "dist")
assets_dir    = os.path.join("assets")

datas = []
if os.path.exists(frontend_dist):
    datas.append((frontend_dist, "frontend/dist"))
else:
    print("\n  WARNING: frontend/dist not found — run 'npm run build' first.\n")

# Font for tray icon rendering (bundled for cross-machine compatibility)
font_path = os.path.join(assets_dir, "DejaVuSans-Bold.ttf")
if os.path.exists(font_path):
    datas.append((font_path, "assets"))

# App icon
icon_path = os.path.join(assets_dir, "icon.ico")

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
    excludes=[
        "tkinter", "matplotlib", "numpy", "scipy",
        "IPython", "jupyter", "trio",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="KRAM",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,  # No black console window on Windows
    icon=icon_path if os.path.exists(icon_path) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="KRAM",
)
