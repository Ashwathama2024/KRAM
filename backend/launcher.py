"""
DutySync Master — Standalone Launcher
Bundles FastAPI backend + React frontend into a single executable.
Starts the server on localhost, opens the browser, shows a system tray icon.
"""
import sys
import os
import time
import socket
import threading
import webbrowser
import logging

# ── Resolve resource paths (works both in dev and PyInstaller bundle) ──────────
def resource_path(relative: str) -> str:
    """Get absolute path to resource, works for dev and PyInstaller."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, relative)

# ── Ensure data directory exists beside the executable ────────────────────────
def get_data_dir() -> str:
    if getattr(sys, "frozen", False):
        # Running as bundled exe — store data next to the exe
        exe_dir = os.path.dirname(sys.executable)
        data_dir = os.path.join(exe_dir, "DutySyncData")
    else:
        data_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(data_dir, exist_ok=True)
    return data_dir

# ── Configure database path ────────────────────────────────────────────────────
data_dir = get_data_dir()
db_path = os.path.join(data_dir, "dutysync.db")
os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"

# ── Logging ───────────────────────────────────────────────────────────────────
log_path = os.path.join(data_dir, "dutysync.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(log_path, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("dutysync")

PORT = 8765
URL = f"http://localhost:{PORT}"


def find_free_port(start: int = 8765) -> int:
    for p in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("localhost", p)) != 0:
                return p
    return start


def wait_for_server(port: int, timeout: int = 15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("localhost", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.3)
    return False


def start_server(port: int):
    import uvicorn
    # Import here so PyInstaller can find the module
    from app.main import app  # noqa: F401
    logger.info(f"Starting DutySync Master server on port {port}")
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
    )


def open_browser(port: int):
    if wait_for_server(port):
        logger.info(f"Opening browser at http://localhost:{port}")
        webbrowser.open(f"http://localhost:{port}")
    else:
        logger.error("Server did not start in time")


def run_tray(port: int):
    """Show a system tray icon with Open / Quit options."""
    try:
        import pystray
        from PIL import Image, ImageDraw

        # Build a simple icon
        size = 64
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.ellipse([(4, 4), (size - 4, size - 4)], fill="#1e40af")
        try:
            from PIL import ImageFont
            font = ImageFont.truetype(
                resource_path("assets/DejaVuSans-Bold.ttf"), 28
            )
        except Exception:
            font = ImageFont.load_default()
        draw.text((18, 14), "D", fill="white", font=font)

        def on_open(_icon, _item):
            webbrowser.open(f"http://localhost:{port}")

        def on_quit(icon, _item):
            icon.stop()
            os._exit(0)

        icon = pystray.Icon(
            "DutySync Master",
            img,
            "DutySync Master",
            menu=pystray.Menu(
                pystray.MenuItem("Open DutySync", on_open, default=True),
                pystray.MenuItem("Quit", on_quit),
            ),
        )
        icon.run()
    except Exception as e:
        logger.warning(f"System tray not available: {e} — running headless")
        # Keep the main thread alive
        while True:
            time.sleep(60)


def main():
    global PORT, URL
    PORT = find_free_port(8765)
    URL = f"http://localhost:{PORT}"

    logger.info(f"DutySync Master starting — data: {data_dir}")

    # Start FastAPI in a background thread (daemon=False so it keeps process alive)
    server_thread = threading.Thread(target=start_server, args=(PORT,), daemon=True)
    server_thread.start()

    # Open browser after server is ready
    browser_thread = threading.Thread(target=open_browser, args=(PORT,), daemon=True)
    browser_thread.start()

    # System tray (blocking — keeps app alive)
    run_tray(PORT)


if __name__ == "__main__":
    main()
