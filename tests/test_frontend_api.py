"""Contract checks: no provider calls, no production DB writes or vector changes."""
import importlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def backend(tmp_path, monkeypatch):
    from app.services import audit
    monkeypatch.setattr(audit.settings, "audit_db_path", str(tmp_path / "audit.db"))
    monkeypatch.setattr(audit.settings, "upload_dir", str(tmp_path / "uploads"))
    monkeypatch.setattr(audit.settings, "admin_api_key", "test-admin")
    module = importlib.import_module("app.frontend_api")
    audit.init_db()
    return module, TestClient(module.app)


def test_health_and_cors(backend):
    _, client = backend
    assert client.get("/api/health").json()["status"] == "ok"
    allowed = client.options("/api/ingest", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "X-Admin-Key"})
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    denied = client.options("/api/chat", headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in denied.headers


def test_existing_chat_contract_and_audit(backend, monkeypatch):
    _, client = backend
    from app.api import routes
    monkeypatch.setattr(routes, "ask", lambda question: {"answer": "VPN steps", "source_used": "private_kb", "trace": ["Router -> KB"], "citations": [], "retry_count": 0})
    response = client.post("/api/chat", json={"question": "VPN help"})
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"answer": "VPN steps", "source_used": "private_kb", "trace": ["Router -> KB"], "citations": [], "retry_count": 0, "status": "success"}
    assert client.post("/api/chat", json={"question": "a"}).status_code == 422
    assert client.get("/api/admin/audit").status_code == 401
    entries = client.get("/api/admin/audit", headers={"X-Admin-Key": "test-admin"}).json()["entries"]
    assert entries[0]["question"] == "VPN help"


def test_upload_auth_validation_and_ingestion(backend, monkeypatch):
    _, client = backend
    from app.api import routes
    from langchain_core.documents import Document
    headers = {"X-Admin-Key": "test-admin"}
    assert client.post("/api/ingest", files={"file": ("p.md", b"policy")}).status_code == 401
    assert client.post("/api/ingest", headers=headers, files={"file": ("p.exe", b"x")}).status_code == 400
    assert client.post("/api/ingest", headers=headers, files={"file": ("p.md", b"")}).status_code == 400
    monkeypatch.setattr(routes, "load_file", lambda path: [Document(page_content="policy")])
    monkeypatch.setattr(routes, "chunk_documents", lambda docs: docs)
    monkeypatch.setattr(routes, "add_documents", lambda docs: ["vector-id"])
    result = client.post("/api/ingest", headers=headers, files={"file": ("p.md", b"policy")})
    assert result.json() == {"message": "Document indexed successfully.", "file": "p.md", "chunks": 1, "vectors_created": 1}


def test_sample_ingestion_is_admin_only(backend, monkeypatch, tmp_path):
    module, client = backend
    (tmp_path / "policy.md").write_text("VPN policy", encoding="utf-8")
    monkeypatch.setattr(module.settings, "sample_kb_dir", str(tmp_path))
    monkeypatch.setattr(module, "add_documents", lambda docs: ["id"] * len(docs))
    assert client.post("/api/admin/ingest-samples").status_code == 401
    result = client.post("/api/admin/ingest-samples", headers={"X-Admin-Key": "test-admin"})
    assert result.json()["files"] == 1
    assert result.json()["vectors_created"] >= 1
