# Local run and opt-in deployment

No deployment, production settings change, provider operation, or data migration has been performed. Preserve the current Streamlit deployment until the new services pass acceptance checks. These instructions target the code under the **inner** project folder containing `requirements.txt`.

## Local run (PowerShell)

For an already installed project, one command starts both services, waits for Python health, and reuses an existing frontend if present:

```powershell
cd C:\Users\dell\Downloads\Enterprise-IT-Support-Agentic-RAG-Copilot-main\Enterprise-IT-Support-Agentic-RAG-Copilot-main
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

This applies execution policy to that PowerShell process only. The launcher prefers `.venv/Scripts/python.exe`, then `venv`, then `python` from PATH. Keep the window open; Ctrl+C stops the backend only if this launcher started it. Backend startup errors are in `.local-backend.stderr.log`. If dependencies are not yet installed, use the setup steps below first. The UI checks health every 15 seconds and on window focus, so it reconnects after the backend starts.

From the outer downloaded workspace:

```powershell
cd C:\Users\dell\Downloads\Enterprise-IT-Support-Agentic-RAG-Copilot-main\Enterprise-IT-Support-Agentic-RAG-Copilot-main
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
# Only if you do not already have .env:
Copy-Item .env.example .env
# Edit .env locally; do not overwrite your working credentials.
python -m uvicorn app.frontend_api:app --host 127.0.0.1 --port 8080 --reload
```

Second terminal, same inner project folder (Node 24 LTS recommended):

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`; API docs: `http://127.0.0.1:8080/docs`. `.env.local` contains only `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`. This is the server **origin**, without `/api`. Keep the frontend on port 3000 or add its exact origin to `CORS_ORIGINS`.

Fallback commands, from the Python project root:

```powershell
python -m streamlit run streamlit_app.py
# Original FastAPI + HTML UI:
python run.py
```

Stop the new API before using `python run.py` on the same port. Streamlit typically uses 8501 and can run separately. Do not run `ingest_sample_kb.py` or click indexing controls merely to start/test the app; those modify Pinecone.

## Environment reference

All values below except `NEXT_PUBLIC_API_BASE_URL` belong on the **Python service**, not Vercel and not browser code. Continue using the working backend `.env` locally. Never copy it into `frontend/`.

| Variable | Default / requirement |
| --- | --- |
| `GROQ_API_KEY` | Required for chat; use current backend secret |
| `GROQ_MODEL` | `openai/gpt-oss-120b`; preserve working model |
| `PINECONE_API_KEY` | Required for private retrieval/ingestion; same account |
| `PINECONE_INDEX_NAME` | `fde-it-support-rag`; preserve existing index |
| `PINECONE_NAMESPACE` | `company-it-kb`; preserve existing namespace |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2`; must match stored embeddings/dimensions |
| `TAVILY_API_KEY` | Required for existing web fallback |
| `ADMIN_API_KEY` | Set a strong secret for upload and added admin controls; do not use `change-me` |
| `CORS_ORIGINS` | JSON array, e.g. `["http://localhost:3000","http://127.0.0.1:3000"]`; used by `app.frontend_api` only |
| `AUDIT_DB_PATH` | Original: project `data/audit.db`; opt-in container: `/var/data/audit.db` |
| `UPLOAD_DIR` | Original: project `uploads`; opt-in container: `/var/data/uploads` |
| `SAMPLE_KB_DIR` | Project `data/sample_kb`; container `/app/data/sample_kb` |
| `HF_HOME` | HuggingFace cache; opt-in container `/var/data/huggingface` |
| `TOP_K`, `MAX_RETRIES` | `4`, `1`; preserve existing tuning |
| `CHUNK_SIZE`, `CHUNK_OVERLAP` | `900`, `120`; preserve existing tuning |
| `APP_NAME`, `APP_ENV` | Existing app name; environment defaults `development` |
| `PORT` | Opt-in Docker image defaults `8080`; provider may override |
| `NEXT_PUBLIC_API_BASE_URL` | **Frontend only**, `https://YOUR-PYTHON-SERVICE` in Vercel; public build-time value |

OpenAI credentials are not used by the inspected application. No provider keys belong in a `NEXT_PUBLIC_` variable. The frontend's admin key field uses the same `X-Admin-Key` contract as the existing upload UI; enter it only as an administrator over HTTPS.

## Before migrating the backend

1. Verify the deployed Streamlit code/version and effective settings, including secrets supplied by the hosting service. Local `.env` values alone cannot establish production identity.
2. Stop writes briefly or use SQLite's backup API to obtain a consistent backup of the **deployed** audit DB. Example on the source host, after substituting the actual paths:
   ```bash
   python -c "import sqlite3; src=sqlite3.connect('/actual/data/audit.db'); dst=sqlite3.connect('/safe-backup/audit.db'); src.backup(dst); dst.close(); src.close()"
   ```
3. Back up original uploaded documents and any separately stored company documents. Compare counts/checksums on transfer. The local PDF is not proof of the full deployed upload collection. Streamlit-hosted ephemeral files may require recovery/export from the running host; do this before restarting or replacing it.
4. Inspect the existing Pinecone index in its dashboard: account, index name, namespace, vector count, **dimension**, metric, and embedding model identity. Default MiniLM requires 384 dimensions. Take an export/backup appropriate to your Pinecone setup. The current initializer deletes an index on a dimension mismatch: resolve any mismatch before any chat/index operation. Do not test by changing `EMBEDDING_MODEL` on production.
5. Keep existing provider secrets and exact retrieval settings. Record the working deployment so you can route users back to Streamlit. Do not re-ingest on startup.

## Separate Python hosting: Render Docker service example

Use a persistent service capable of running Python 3.11, sentence-transformers/PyTorch on CPU, and long requests. Render with an attached persistent disk is one concrete option. Size memory from your measured model/workflow workload; a small serverless or ephemeral container can exhaust memory or lose local files. See [Render persistent disk documentation](https://render.com/docs/disks) and [Docker service documentation](https://render.com/docs/docker).

After approval to deploy:

1. Create a new Render Web Service connected to the repository. Choose Docker. If GitHub has `app/` at its root, use the repository root as service root (the extra local download wrapper is not a Git directory).
2. Set Dockerfile path to `deployment/Dockerfile.api`, with Docker build context at the repository root. This opt-in image copies only backend code, requirements, and sample documents; it does not copy `.env`, frontend dependencies, uploaded files, or audit DB. The original Dockerfile remains available for rollback.
3. Attach a persistent disk mounted at `/var/data`. Choose a disk-backed plan; an ephemeral/free service does not preserve audit/upload files. Run **one instance and one worker** with the existing SQLite setup.
4. Enter backend provider/admin secrets and settings from the table. Set `APP_ENV=production`, `AUDIT_DB_PATH=/var/data/audit.db`, `UPLOAD_DIR=/var/data/uploads`, `HF_HOME=/var/data/huggingface`. Do not paste a local Windows path into a Linux service.
5. Before accepting user traffic, restore the consistent DB backup and uploads into that disk, ensuring read/write permissions. Compare source and destination file checksums and audit row counts. If the new service created an empty DB during initial health startup, replace it only during maintenance with writes stopped. Do not merge/delete the source data automatically. Mount paths persist; files outside them do not.
6. Set `CORS_ORIGINS` to a JSON list of exact approved browser origins, for example `["https://your-frontend.vercel.app"]`. Add a custom domain and stable preview origin explicitly when needed. Do not allow arbitrary preview wildcards. Restart the service after environment changes.
7. The image starts `python -m uvicorn app.frontend_api:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1`. Set the health-check path to `/api/health`. Allow outbound connections to Groq, Pinecone, Tavily, and HuggingFace for the first model download. Health verifies configuration flags, not remote provider connectivity or a writable audit DB.
8. Inspect logs and persistent DB after a controlled acceptance request. Audit errors are logged but the existing service can still return chat success. Confirm a new audit row is actually present.
9. Keep existing Streamlit available. Cut over users only after verifying KB responses, fallback, uploads, admin audit access, and persistence across a restart. Keep upload and sample-index tests on a dedicated test namespace or approved disposable document; production ingest is a real write. Establish provider-side quotas and your existing network access policy before making the unauthenticated chat route public. No new identity system is included in this UI migration.

Optional local container build (does not deploy):

```powershell
docker build -f deployment/Dockerfile.api -t it-copilot-api .
docker volume create it-copilot-data
docker run --rm -p 8080:8080 --env-file .env -e 'CORS_ORIGINS=["http://localhost:3000"]' -v it-copilot-data:/var/data it-copilot-api
```

This local volume starts empty; transfer audit/uploads first if it must use existing local history. The container path variables take precedence over project defaults. Docker was not built during this task.

## Vercel frontend

After approval to deploy:

1. Import the same GitHub repository as a **new** Vercel project. Choose Next.js and set Root Directory to **`frontend`**. For a monorepo, Vercel uses that directory's package/lockfile. See [Vercel monorepo configuration](https://vercel.com/docs/monorepos).
2. Set Node.js to 24.x (or a supported version satisfying `engines`). Use install command `npm ci`, build command `npm run build`, default Next.js output settings. Do not upload Python credentials or the root `.env`.
3. Add `NEXT_PUBLIC_API_BASE_URL=https://YOUR-PYTHON-SERVICE` to the intended Preview/Production environments. It is baked into the client bundle; changing it requires a rebuild. Never use `localhost` for a deployed frontend and never use HTTP from an HTTPS frontend.
4. Add the exact Vercel URL to the Python service's `CORS_ORIGINS`, then restart the Python service. Each distinct Preview URL needs explicit approval/configuration, or use a stable preview domain and a separate test backend.
5. Deploy only after approval. Verify health, a known company policy question, returned citations and trace, error recovery, mobile navigation, admin upload and recent audits. Use a test namespace for ingestion acceptance. Confirm no AI secrets appear in frontend environment variables or browser requests.
6. Leave the current Streamlit production configuration intact until acceptance. Reverting frontend traffic to Streamlit does not revert vectors or audit writes; keep data backups.

No Vercel `rootDirectory` key or automatic deployment workflow was added. The application uses direct browser-to-Python HTTP requests, so 20 MB uploads and long RAG responses do not pass through a Next.js function proxy.

## Validation commands and scope

```powershell
cd frontend
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

With both services running, `npm run check:local` verifies the real Python health endpoint and browser connection (without mocked HTTP, provider calls, or document writes), and saves a dark-theme screenshot under ignored `frontend/test-results/`.

Browser tests use installed Microsoft Edge for desktop/mobile Chromium emulation. If Edge is absent, install Edge or change Playwright `channel` to an installed browser and install its browser binary. They run against a production Next.js server with mock HTTP responses, never real providers.

Backend API tests:

```powershell
cd ..
python -m pytest tests/test_frontend_api.py -q
```

The added tests redirect audit storage and uploads to temporary paths and mock all vector/LLM writes. The original `tests/test_workflow.py` audit test uses configured storage; to run the entire suite safely, set `AUDIT_DB_PATH` to a new temporary location before starting pytest. No test should target your production DB.

See `VALIDATION_NEXTJS.md` for the final verified results. Live provider behavior, remote deployed data, hosting persistence, real TLS/CORS domains, and cloud deployments require controlled post-approval acceptance checks. The existing LangChain community embedding import can emit a deprecation warning; it was not rewritten as part of this UI migration.
