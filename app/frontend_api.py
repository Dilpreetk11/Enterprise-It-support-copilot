"""Optional API entry point for Next.js. Existing app.main and Streamlit are unchanged."""
import hmac
import sqlite3
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.api.routes import router, settings
from app.core.config import BASE_DIR
from app.core.logging import configure_logging
from app.services.audit import init_db
from app.services.ingestion import SUPPORTED, load_file, chunk_documents
from app.rag.vectorstore import add_documents


class FrontendSettings(BaseSettings):
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")


configure_logging()
init_db()
app = FastAPI(title=settings.app_name, version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=FrontendSettings().cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Admin-Key", "Authorization"],
)
app.include_router(router)


@app.get("/")
def root():
    return {
        "status": "online",
        "service": settings.app_name,
        "docs": "/docs",
        "health": "/api/health",
    }


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
