import json
import os
import hmac
import sqlite3
from pathlib import Path
from fastapi import FastAPI, Request, Header, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings, BASE_DIR
from app.core.logging import configure_logging
from app.services.audit import init_db
from app.services.ingestion import SUPPORTED, load_file, chunk_documents
from app.rag.vectorstore import add_documents


configure_logging()
settings = get_settings()
init_db()


def get_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "")
    if not raw:
        return [
            "http://localhost:3000",
            "http://localhost:8080",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:8080",
        ]
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, str):
            return [parsed]
    except Exception:
        pass
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Enterprise IT Support Agentic RAG Copilot for NovaRetail",
)

cors_origins = get_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True if "*" not in cors_origins else False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Admin-Key", "Authorization"],
)

app.include_router(router)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


def require_admin(x_admin_key: str = Header(default="")) -> None:
    if settings.admin_api_key == "change-me" or not hmac.compare_digest(x_admin_key, settings.admin_api_key):
        raise HTTPException(status_code=401, detail="A configured admin key is required.")


@app.get("/api/admin/audit", dependencies=[Depends(require_admin)])
def recent_audit():
    """Same five recent entries shown by Streamlit; never expose them publicly."""
    try:
        with sqlite3.connect(settings.audit_db_path) as con:
            con.row_factory = sqlite3.Row
            rows = con.execute(
                "SELECT created_at, question, source_used, duration_ms FROM query_audit ORDER BY id DESC LIMIT 5"
            ).fetchall()
        return {"entries": [dict(row) for row in rows]}
    except sqlite3.Error as exc:
        raise HTTPException(status_code=503, detail="Audit storage is unavailable.") from exc


@app.post("/api/admin/ingest-samples", dependencies=[Depends(require_admin)])
def ingest_samples():
    """Expose the existing Streamlit sample ingestion operation without changing it."""
    try:
        files = sorted(p for p in Path(settings.sample_kb_dir).iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED)
        docs = [doc for path in files for doc in load_file(path)]
        chunks = chunk_documents(docs)
        ids = add_documents(chunks)
        return {"message": "Sample documents indexed.", "files": len(files), "chunks": len(chunks), "vectors_created": len(ids)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Sample indexing failed. Check backend logs.") from exc


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"app_name": settings.app_name},
    )
