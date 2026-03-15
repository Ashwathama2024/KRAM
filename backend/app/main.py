import sys
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .config import settings
from .database import Base, engine, ensure_schema
from .models import models  # ensure models registered
from .routers import staff, availability, calendar, roster

# Create DB tables
Base.metadata.create_all(bind=engine)
ensure_schema()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Logic-driven duty roster generator with fair rotation algorithm.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(staff.router, prefix="/api")
app.include_router(availability.router, prefix="/api")
app.include_router(calendar.router, prefix="/api")
app.include_router(roster.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}


# ── Resolve frontend dist path ─────────────────────────────────────────────────
def _find_frontend_dist() -> str | None:
    candidates = [
        # PyInstaller bundle (_MEIPASS)
        os.path.join(getattr(sys, "_MEIPASS", ""), "frontend", "dist"),
        # Docker / production mount
        "/app/frontend/dist",
        # Development: relative to this file
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"),
    ]
    for p in candidates:
        if os.path.isdir(p):
            return p
    return None


frontend_dist = _find_frontend_dist()

if frontend_dist:
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Try to serve the exact file
        file_path = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        # Fallback to SPA index
        return FileResponse(os.path.join(frontend_dist, "index.html"))
