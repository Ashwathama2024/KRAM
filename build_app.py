#!/usr/bin/env python3
"""
KRAM — One-Command Build Script
================================
Builds the full standalone desktop application:

  1. npm run build      → React production bundle
  2. pyinstaller        → Single-folder Windows/Linux/Mac executable
  3. (Windows only)     → Prints Inno Setup command for installer

Usage:
  python build_app.py                  # full build
  python build_app.py --frontend-only  # only build React
  python build_app.py --package-only   # only run PyInstaller (frontend already built)
"""

import os
import sys
import shutil
import subprocess
import argparse
import platform

ROOT         = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(ROOT, "frontend")
BACKEND_DIR  = os.path.join(ROOT, "backend")
DIST_DIR     = os.path.join(BACKEND_DIR, "dist", "KRAM")
OUTPUT_DIR   = os.path.join(ROOT, "release")


def run(cmd, cwd=None, shell=False):
    print(f"\n>>  {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    result = subprocess.run(cmd, cwd=cwd, shell=shell, text=True)
    if result.returncode != 0:
        print(f"\nFAILED: Command failed with code {result.returncode}")
        sys.exit(result.returncode)


def step_build_frontend():
    print("\n" + "="*55)
    print("  STEP 1 - Building React frontend")
    print("="*55)

    npm = "npm.cmd" if platform.system() == "Windows" else "npm"

    if not os.path.isdir(os.path.join(FRONTEND_DIR, "node_modules")):
        run([npm, "install"], cwd=FRONTEND_DIR)

    run([npm, "run", "build"], cwd=FRONTEND_DIR)

    dist = os.path.join(FRONTEND_DIR, "dist")
    if not os.path.isdir(dist):
        print("FAILED: Frontend dist/ not created. Build failed.")
        sys.exit(1)

    print(f"\nOK: Frontend built -> {dist}")


def step_package():
    print("\n" + "="*55)
    print("  STEP 2 - Packaging with PyInstaller")
    print("="*55)

    try:
        import PyInstaller  # noqa
    except ImportError:
        print("Installing PyInstaller...")
        run([sys.executable, "-m", "pip", "install", "pyinstaller>=6.10"])

    for pkg in ["pystray", "PIL"]:
        try:
            __import__(pkg)
        except ImportError:
            run([sys.executable, "-m", "pip", "install",
                 "pystray==0.19.5" if pkg == "pystray" else "Pillow==10.3.0"])

    # Generate icon if missing
    assets_dir = os.path.join(BACKEND_DIR, "assets")
    os.makedirs(assets_dir, exist_ok=True)
    ico_path = os.path.join(assets_dir, "icon.ico")
    if not os.path.isfile(ico_path):
        _make_icon(ico_path)

    # Clean previous build
    for d in ["build", os.path.join("dist", "KRAM")]:
        p = os.path.join(BACKEND_DIR, d)
        if os.path.isdir(p):
            shutil.rmtree(p)

    run(
        [sys.executable, "-m", "PyInstaller", "KRAM.spec", "--noconfirm"],
        cwd=BACKEND_DIR,
    )

    if not os.path.isdir(DIST_DIR):
        print("FAILED: PyInstaller did not produce output. Check errors above.")
        sys.exit(1)

    print(f"\nOK: Executable built -> {DIST_DIR}")


def step_collect_release():
    print("\n" + "="*55)
    print("  STEP 3 - Collecting release package")
    print("="*55)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    dest = os.path.join(OUTPUT_DIR, "KRAM")
    if os.path.isdir(dest):
        shutil.rmtree(dest)
    shutil.copytree(DIST_DIR, dest)

    for f in ["README.md", "installer/KRAM.iss"]:
        src = os.path.join(ROOT, f)
        if os.path.isfile(src):
            shutil.copy(src, OUTPUT_DIR)

    print(f"\nOK: Release package -> {OUTPUT_DIR}/KRAM/")
    print("\n  To run directly:")
    if platform.system() == "Windows":
        print(f"    {dest}\\KRAM.exe")
    else:
        print(f"    {dest}/KRAM")


def _make_icon(path: str):
    """Generate KRAM icon — blue rounded square with 'K'."""
    try:
        from PIL import Image, ImageDraw, ImageFont
        sizes = [16, 32, 48, 64, 128, 256]
        imgs = []
        for s in sizes:
            img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
            draw.rounded_rectangle([(0, 0), (s-1, s-1)], radius=s//6, fill="#1e40af")
            try:
                font = ImageFont.truetype(
                    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                    int(s * 0.55)
                )
            except Exception:
                font = ImageFont.load_default()
            bbox = draw.textbbox((0, 0), "K", font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            draw.text(((s - tw) / 2 - bbox[0], (s - th) / 2 - bbox[1]), "K", fill="white", font=font)
            imgs.append(img)
        imgs[0].save(path, format="ICO", sizes=[(s, s) for s in sizes], append_images=imgs[1:])
        print(f"  OK: Generated icon -> {path}")
    except Exception as e:
        print(f"  WARNING: Could not generate icon ({e}) -- proceeding without")


def main():
    parser = argparse.ArgumentParser(description="Build KRAM desktop application")
    parser.add_argument("--frontend-only", action="store_true")
    parser.add_argument("--package-only",  action="store_true")
    args = parser.parse_args()

    print("\n" + "="*50)
    print("  KRAM -- Kartavya Roster & App Mgmt")
    print("  Desktop Application Builder")
    print("="*50)
    print(f"  Platform : {platform.system()} {platform.machine()}")
    print(f"  Python   : {sys.version.split()[0]}")
    print(f"  Root     : {ROOT}")

    if args.frontend_only:
        step_build_frontend()
    elif args.package_only:
        step_package()
        step_collect_release()
    else:
        step_build_frontend()
        step_package()
        step_collect_release()

    print("\n" + "="*55)
    print("  BUILD COMPLETE")
    print("="*55)

    if platform.system() == "Windows" and not args.frontend_only:
        iss = os.path.join(ROOT, "installer", "KRAM.iss")
        if os.path.isfile(iss):
            print(f"""
  To create the Windows installer (.exe):
    1. Install Inno Setup from https://jrsoftware.org/isinfo.php
    2. Run:  "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe" "{iss}"
    3. Installer will be in:  installer/Output/KRAM-Setup.exe
""")
    elif platform.system() == "Darwin" and not args.frontend_only:
        print("""
  To create a macOS .dmg:
    brew install create-dmg
    create-dmg release/KRAM.dmg release/KRAM/
""")


if __name__ == "__main__":
    main()
