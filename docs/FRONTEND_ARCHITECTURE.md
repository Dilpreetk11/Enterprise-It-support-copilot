# Inspected application and frontend integration

Inspected the local Git checkout of `https://github.com/Dilpreetk11/IT-Support-Agentic-RAG-Copilot.git`, starting at commit `674bcba`. The checkout is nested inside the outer downloaded directory. Run commands from the inner directory containing `app/`, `streamlit_app.py`, and `requirements.txt`. No remote branch was fetched or changed.

## Existing runtime

- `app/main.py` exports `app`; `run.py` starts `app.main:app` on **127.0.0.1:8080**, with reload. The original Dockerfile runs the same app on **0.0.0.0:${PORT:-8080}**. `/` renders `templates/index.html`, with assets under `static/`.
- `streamlit_app.py` is an independent UI. It imports and calls Python services directly, rather than calling FastAPI. Its `st.session_state` holds messages and session metrics only; clearing the conversation does not delete audit records or vectors.
- `app/rag/workflow.py` compiles a LangGraph: route → retrieve private KB → grade → answer, or Tavily fallback → grade → query rewrite/retry → answer/insufficient evidence. Greetings use a direct response. `ask(question)` creates fresh state on every invocation. There is **no checkpoint, conversation ID, shared message memory, token stream, SSE, or WebSocket**.
- Groq (`ChatGroq`) handles routing, grading, rewriting, and generation; default model `openai/gpt-oss-120b`. That model name does not mean OpenAI credentials are used. FastEmbed/ONNX runs `sentence-transformers/all-MiniLM-L6-v2`, 384 dimensions, on CPU with one thread and small batches to fit constrained hosts. Pinecone is the remote vector store; Tavily is fallback web search. Providers/models are initialized lazily.
- `app/services/ingestion.py` loads PDF with PyPDFLoader, UTF-8 TXT/MD with TextLoader, DOCX paragraphs with python-docx. Limits: **20 MiB**, supported `.pdf`, `.txt`, `.md`, `.docx`. Recursive chunks default to 900 characters, overlap 120; metadata retains source paths. DOCX tables and image OCR are not implemented.
- `app/services/audit.py` initializes/migrates `query_audit` in SQLite and records questions, source, grades, trace JSON, retry count, timestamp, duration, and request ID. Logging failures are swallowed by the existing implementation.
- Root `requirements.txt` is the application dependency list, including Streamlit, FastAPI, LangChain/LangGraph, Groq, Pinecone, Tavily, FastEmbed, parsers, and pytest. `Agentic-RAG-demo/requirements.txt` is a separate notebook/demo list, not the application install target. `create_project.py` is an old scaffold generator and should not be run on the working checkout. `steps.md` and portions of README describe older OpenAI embeddings and port 8000; actual code and `.env.example` take precedence.
- Existing deployment configuration consists of the root Dockerfile, `.dockerignore`, and `.streamlit/config.toml`. No existing Vercel deployment configuration or CI pipeline was present. The Streamlit server does not automatically publish a separate FastAPI listener.

## Existing API contracts (unchanged)

| Method / path | Request | Response |
| --- | --- | --- |
| GET `/api/health` | none | `status`, `service`, `environment`, `llm_provider`, `llm_model`, `embedding_model`, `groq_configured`, `pinecone_configured`, `tavily_configured`, `admin_key_set` |
| POST `/api/chat` | JSON `{ "question": "..." }`, 2–3000 characters | JSON `{ answer, source_used, citations, trace, retry_count, status }` |
| POST `/api/ingest` | Multipart `file`; `X-Admin-Key` header | JSON `{ message, file, chunks, vectors_created }` |

Chat is blocking at the HTTP level and returns **one complete JSON response**. No simulated token or agent-stage streaming was added. `source_used` can be `private_kb`, `web_search`, `direct`, or `insufficient_evidence`. Citations are dictionary objects, generally `{title,url,type,document_id?}`; private sources have no downloadable URL. The response model does not include `duration_ms`; frontend response timing measures client round-trip time.

Errors: chat validation is 422; provider/workflow exceptions are sanitized 500. Upload can return 401 (key), 400 (type/empty), 413 (size), 422 (text extraction), or 500 (indexing). No list/search/delete-document or manual retrieval-mode API exists, so the frontend does not expose those controls. Existing chat and health routes have no user authentication; CORS is not authentication.

## Additive integration

- `frontend/` is a separate Next.js App Router, TypeScript, Tailwind v4, Motion, Lucide React app. It uses React Markdown/GFM without raw HTML and allows only HTTP(S) citation links. It needs Node 22.12+; Node 24 LTS is recommended for the locked toolchain.
- `src/lib/api.ts` is the centralized typed client. It preserves the original JSON/multipart contracts, handles FastAPI validation arrays and network failures, and uses 10s health, 180s chat, and 300s ingestion timeouts. It does not automatically retry writes. A client timeout does not cancel Python or roll back ingestion.
- Chat history and metrics live in component memory. Reloading/new conversation clears them. They are not sent as model context. No browser storage holds credentials or chat text.
- `app/frontend_api.py` is an **optional new ASGI entry point**, reusing the original API router and services. It adds `CORS_ORIGINS` as a JSON list; defaults allow only localhost/127.0.0.1 on port 3000. Original `app.main`, Streamlit, environment file, prompts, tools, retrieval, and deployment defaults were not edited.
- GET `/api/admin/audit`: same last five SQLite query summaries Streamlit shows, as `{entries:[{created_at,question,source_used,duration_ms}]}`.
- POST `/api/admin/ingest-samples`: calls the existing load/chunk/add functions on `SAMPLE_KB_DIR`; returns `{message,files,chunks,vectors_created}`.
- Both added routes require `X-Admin-Key` and reject the default `change-me`. The existing upload authentication contract is unchanged. Admin keys are entered for each operation, sent directly to Python, cleared after the request, and never persisted. They are administrative credentials, not AI provider credentials. Audit reads are protected because questions may contain private data.
- Browser UI includes connectivity/missing-key states, suggestions from existing IT topics, loading/error/retry states, source citations, decision traces, retry counts, session metrics, upload, explicit sample-index action, audit empty states, responsive navigation, keyboard submission, native modal focus trapping, and reduced-motion support.

## Storage inspection and migration risks

Local storage at inspection: `data/audit.db` (12,288 bytes), two sample Markdown documents (9,113 and 7,018 bytes), and `uploads/novacore_company_information.pdf` (27,703 bytes). No document contents or secret values were printed. Current settings point to those project-local paths, the `fde-it-support-rag` index, `company-it-kb` namespace, and MiniLM embeddings. These settings were inspected, but remote Pinecone contents were not queried.

**Existing destructive behavior:** `app/rag/vectorstore.py:ensure_index` deletes and recreates an existing index when its dimension differs from the configured embedding dimension. This pre-existing behavior was deliberately left unchanged to preserve the pipeline. Do not send retrieval or ingestion requests against production until the existing index dimension and embedding identity have been verified and backups taken. A failed retrieval can also fall back to web, so a successful answer alone does not prove the private KB survived. No live provider operation was run during this work.

Pinecone remains external persistent storage. Retain the exact account, index, namespace, embedding model, and dimensions; changing any of them can disconnect the frontend from existing knowledge. Avoid re-indexing as an automatic deploy/start step: `add_documents` creates IDs and repeated sample ingestion can duplicate vectors. Existing upload code writes to the same basename and can overwrite a prior uploaded file. Only upload deliberately and retain original-file backups.

SQLite and uploads need a persistent backend volume. Copying Git alone does not transfer them: Git ignores the audit DB/uploads. FastEmbed model files use a separate download cache; bake them into the Docker image for Render so the service does not download them at runtime. Keep `SAMPLE_KB_DIR` pointed at the bundled Markdown directory. SQLite is a single-instance design here: use one worker/instance and a persistent volume; shared multi-instance audit storage needs a separately reviewed backend change. Render's Free plan cannot attach a persistent disk, so audit rows and uploaded local files can be lost on restart; Pinecone vectors are separate and persist there.

See `DEPLOYMENT_NEXTJS.md` for exact commands, environment variables, migration steps, and verification limits.
