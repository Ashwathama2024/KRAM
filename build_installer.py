#!/usr/bin/env python3
"""
KRAM - Build Windows Installer
================================
Produces:  installer/Output/KRAM-Setup.exe

This script:
  1. Checks that the PyInstaller release build exists
  2. Generates wizard images (installer banner + logo)
  3. Downloads and installs Inno Setup if not found
  4. Compiles KRAM.iss into a single KRAM-Setup.exe

Usage:
  python build_installer.py

Run build_app.py first if you haven't built the app yet:
  python build_app.py
  python build_installer.py
"""

import os
import sys
import subprocess
import urllib.request
import tempfile
import platform
import shutil

ROOT         = os.path.dirname(os.path.abspath(__file__))
RELEASE_DIR  = os.path.join(ROOT, "release", "KRAM")
INSTALLER_DIR = os.path.join(ROOT, "installer")
ISS_FILE     = os.path.join(INSTALLER_DIR, "KRAM.iss")
OUTPUT_FILE  = os.path.join(INSTALLER_DIR, "Output", "KRAM-Setup.exe")

INNO_PATHS = [
    r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    r"C:\Program Files\Inno Setup 6\ISCC.exe",
    r"C:\Program Files (x86)\Inno Setup 5\ISCC.exe",
]

INNO_DOWNLOAD_URL = "https://jrsoftware.org/download.php/is.exe"
INNO_INSTALLER_NAME = "innosetup-installer.exe"


def find_inno() -> str | None:
    for p in INNO_PATHS:
        if os.path.isfile(p):
            return p
    iscc = shutil.which("ISCC") or shutil.which("iscc")
    return iscc


def download_inno():
    print("\n  Inno Setup not found. Downloading installer...")
    print(f"  URL: {INNO_DOWNLOAD_URL}")
    tmp = os.path.join(tempfile.gettempdir(), INNO_INSTALLER_NAME)
    try:
        urllib.request.urlretrieve(INNO_DOWNLOAD_URL, tmp,
            reporthook=lambda b, bs, ts: print(f"  {min(b*bs, ts)//1024} / {ts//1024} KB\r", end=""))
        print()
    except Exception as e:
        print(f"\n  Download failed: {e}")
        print("  Please download manually from:  https://jrsoftware.org/isdl.php")
        print("  Then re-run this script.")
        sys.exit(1)

    print("  Running Inno Setup installer (follow the prompts)...")
    subprocess.run([tmp, "/SILENT", "/NORESTART"], check=True)
    print("  Inno Setup installed.")

    iscc = find_inno()
    if not iscc:
        print("  ERROR: ISCC.exe still not found after install.")
        print("  Try restarting this script, or compile manually:")
        print(f"    Open Inno Setup IDE and load:  {ISS_FILE}")
        sys.exit(1)
    return iscc


def step_check_release():
    print("\n[1/4] Checking release build...")
    exe = os.path.join(RELEASE_DIR, "KRAM.exe")
    if not os.path.isfile(exe):
        print("  ERROR: release/KRAM/KRAM.exe not found.")
        print("  Run this first:  python build_app.py")
        sys.exit(1)
    size_mb = os.path.getsize(exe) / 1_000_000
    print(f"  OK   release/KRAM/KRAM.exe  ({size_mb:.1f} MB)")


def step_wizard_images():
    print("\n[2/4] Generating installer wizard images...")
    script = os.path.join(INSTALLER_DIR, "generate_wizard_images.py")
    if not os.path.isfile(script):
        print("  SKIP (generate_wizard_images.py not found)")
        return
    result = subprocess.run([sys.executable, script], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  WARNING: wizard image generation failed: {result.stderr.strip()}")
    else:
        print("  OK   installer/wizard.bmp + wizard_sm.bmp")

    # Also refresh the icon
    src_ico = os.path.join(ROOT, "backend", "assets", "icon.ico")
    dst_ico = os.path.join(INSTALLER_DIR, "icon.ico")
    if os.path.isfile(src_ico):
        shutil.copy2(src_ico, dst_ico)
        print("  OK   installer/icon.ico")


def step_get_inno():
    print("\n[3/4] Locating Inno Setup...")
    iscc = find_inno()
    if iscc:
        print(f"  OK   {iscc}")
        return iscc
    if platform.system() != "Windows":
        print("  ERROR: Inno Setup is Windows-only.")
        print("  Use Wine or a Windows machine to create the installer.")
        sys.exit(1)
    return download_inno()


def step_compile(iscc: str):
    print("\n[4/4] Compiling installer...")
    os.makedirs(os.path.join(INSTALLER_DIR, "Output"), exist_ok=True)
    result = subprocess.run(
        [iscc, ISS_FILE],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print("  FAILED. Inno Setup output:")
        print(result.stdout[-2000:])
        print(result.stderr[-1000:])
        sys.exit(1)

    if not os.path.isfile(OUTPUT_FILE):
        print("  ERROR: Output file not found after compile.")
        sys.exit(1)

    size_mb = os.path.getsize(OUTPUT_FILE) / 1_000_000
    print(f"  OK   installer/Output/KRAM-Setup.exe  ({size_mb:.1f} MB)")


def main():
    print()
    print("=" * 50)
    print("  KRAM - Windows Installer Builder")
    print("=" * 50)

    if platform.system() != "Windows":
        print("\nWARNING: This script is designed for Windows.")
        print("Inno Setup only runs on Windows.")

    step_check_release()
    step_wizard_images()
    iscc = step_get_inno()
    step_compile(iscc)

    print()
    print("=" * 50)
    print("  INSTALLER READY")
    print("=" * 50)
    print()
    print(f"  File: installer/Output/KRAM-Setup.exe")
    print()
    print("  Share this single file with anyone.")
    print("  Each user gets their own clean database on first launch.")
    print()


if __name__ == "__main__":
    main()
