"""
KRAM -- Kartavya Roster & App Management
Standalone Launcher

Bundles FastAPI backend + React frontend into a single executable.
Starts the server on localhost, opens the browser, shows a system tray icon.

Data is stored per-user in %APPDATA%/KRAM/ so every user who receives
the shared EXE gets their own clean, isolated database.
"""
import sys
import os

# GUI app (console=False) has sys.stdout/stderr = None — redirect to devnull
# so any library that calls stream.isatty() or stream.write() doesn't crash.
if getattr(sys, "frozen", False) and sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
    sys.stderr = open(os.devnull, "w")
import time
import socket
import threading
import traceback
import webbrowser
import logging
import multiprocessing


# ── Single-instance guard ──────────────────────────────────────────────────────
def is_already_running(port: int = 8765) -> bool:
    """Return True if KRAM is already listening on the given port."""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except OSError:
        return False


# ── Resolve resource paths (works both in dev and PyInstaller bundle) ──────────
def resource_path(relative: str) -> str:
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, relative)


# ── Per-user data directory ────────────────────────────────────────────────────
def get_data_dir() -> str:
    if getattr(sys, "frozen", False):
        if sys.platform == "win32":
            base = os.environ.get("APPDATA", os.path.expanduser("~"))
        elif sys.platform == "darwin":
            base = os.path.expanduser("~/Library/Application Support")
        else:
            base = os.environ.get("XDG_DATA_HOME", os.path.expanduser("~/.local/share"))
        data_dir = os.path.join(base, "KRAM")
    else:
        data_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(data_dir, exist_ok=True)
    return data_dir


# ── Configure database path (must happen before app import) ───────────────────
data_dir = get_data_dir()
db_path = os.path.join(data_dir, "kram.db")
os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"

# ── Logging ───────────────────────────────────────────────────────────────────
log_path = os.path.join(data_dir, "kram.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(log_path, encoding="utf-8"),
    ],
)
logger = logging.getLogger("kram")

PORT = 8765


def find_free_port(start: int = 8765) -> int:
    for p in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    return start


def wait_for_server(port: int, timeout: int = 60) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.5)
    return False


def start_server(port: int):
    """Start the FastAPI/uvicorn server. All exceptions are logged."""
    try:
        import uvicorn
        logger.info(f"Importing application modules...")
        from app.main import app  # triggers DB init, router registration etc.
        logger.info(f"Starting uvicorn on 127.0.0.1:{port}")
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=port,
            log_config=None,   # disable uvicorn logging (stdout=None in GUI app)
            access_log=False,
        )
    except Exception:
        logger.error("FATAL: Server crashed on startup:\n" + traceback.format_exc())


def find_edge() -> str | None:
    """Return path to Microsoft Edge executable, or None if not found."""
    candidates = [
        os.path.join(os.environ.get("ProgramFiles", ""), "Microsoft", "Edge", "Application", "msedge.exe"),
        os.path.join(os.environ.get("ProgramFiles(x86)", ""), "Microsoft", "Edge", "Application", "msedge.exe"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "Application", "msedge.exe"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def open_app_window(port: int):
    """Open KRAM in a dedicated app window (no browser chrome)."""
    if not wait_for_server(port):
        logger.error(f"Server did not respond within 60 s — open http://localhost:{port} manually.")
        return

    url = f"http://localhost:{port}"
    logger.info(f"Server ready — opening app window at {url}")

    edge = find_edge()
    if edge:
        try:
            import subprocess
            subprocess.Popen([
                edge,
                f"--app={url}",
                "--window-size=1280,860",
                "--window-position=100,60",
                f"--user-data-dir={os.path.join(data_dir, 'edge-profile')}",
                "--no-first-run",
                "--disable-extensions",
            ])
            logger.info("Opened in Edge app mode")
            return
        except Exception as e:
            logger.warning(f"Edge app mode failed: {e} — falling back to browser")

    # Fallback: regular browser
    webbrowser.open(url)


def _build_tray_icon():
    from PIL import Image, ImageDraw
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=12, fill="#1e40af")
    try:
        from PIL import ImageFont
        font = ImageFont.truetype(resource_path("assets/DejaVuSans-Bold.ttf"), 32)
    except Exception:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), "K", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        ((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]),
        "K", fill="white", font=font,
    )
    return img


def run_tray(port: int):
    """System tray icon — runs in background thread on Windows."""
    try:
        import pystray

        def on_open(_icon, _item):
            open_app_window(port)

        def on_quit(icon, _item):
            icon.stop()
            os._exit(0)

        icon = pystray.Icon(
            "KRAM",
            _build_tray_icon(),
            "KRAM - Kartavya Roster & App Management",
            menu=pystray.Menu(
                pystray.MenuItem("Open KRAM", on_open, default=True),
                pystray.MenuItem("Quit", on_quit),
            ),
        )
        icon.run()
    except Exception as e:
        logger.warning(f"System tray not available: {e} -- running headless")
        # Keep process alive
        while True:
            time.sleep(60)


def main():
    # Required for PyInstaller multiprocessing support on Windows
    multiprocessing.freeze_support()

    global PORT
    PORT = find_free_port(8765)

    # Single-instance: if server already up on 8765, just open browser and exit
    if PORT != 8765:
        # Port 8765 was busy -- check if it's our own server already running
        if is_already_running(8765):
            logger.info("KRAM already running -- opening app window")
            open_app_window(8765)
            return

    os.environ["KRAM_PORT"] = str(PORT)
    logger.info(f"KRAM starting | data={data_dir} | port={PORT}")

    # FastAPI server in background thread
    server_thread = threading.Thread(target=start_server, args=(PORT,), daemon=True)
    server_thread.start()

    # App window opener (waits for server to be ready)
    browser_thread = threading.Thread(target=open_app_window, args=(PORT,), daemon=True)
    browser_thread.start()

    # System tray (blocks main thread -- keeps process alive)
    run_tray(PORT)


if __name__ == "__main__":
    main()
