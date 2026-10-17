# Run the complete IT Support Copilot locally

This folder contains the original Python backend, Streamlit fallback, and the new dark Next.js frontend. No cloud deployment is needed.

## Requirements

- Python **3.11** installed and available as `python`.
- Node.js **24 LTS** installed (`node --version` and `npm --version` should work).
- Your existing Groq, Pinecone, Tavily, and backend admin credentials.

## Windows setup

Extract the ZIP first. Open PowerShell in the extracted `IT-Support-Copilot` folder (the folder containing `requirements.txt` and `start-local.ps1`).

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

Fill in your existing backend credentials. Keep the existing Pinecone index, namespace, and embedding model values. Do not place provider credentials in the frontend.

Then install the frontend:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
cd ..
```

Start both services:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

Leave that window open. Visit **http://localhost:3000**. The status should change to **API connected**. Initial Python startup can take a minute while ML libraries load. The launcher logs Python errors to `.local-backend.stderr.log`. Ctrl+C stops services started by the launcher. The execution-policy setting applies only to that PowerShell process.

For subsequent runs, only the `start-local.ps1` command is needed. If either `.env` file already exists, edit it instead of overwriting it with `Copy-Item`.

## Start separately instead

Backend, from the project folder:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.frontend_api:app --host 127.0.0.1 --port 8080
```

Frontend, from another terminal:

```powershell
cd frontend
npm run dev
```

Backend docs: **http://127.0.0.1:8080/docs**. Frontend API setting: `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080` in `frontend/.env.local`.

## Existing Streamlit fallback

```powershell
.\.venv\Scripts\python.exe -m streamlit run streamlit_app.py
```

## Data and credentials

The download contains source code and the bundled sample knowledge documents. It intentionally excludes `.env`, API keys, `.git`, installed dependencies, virtual environments, logs, local audit databases, and private uploaded documents. Add your keys locally and copy your own backed-up uploads/audit data only if needed. Existing remote Pinecone data remains in your account; this ZIP does not export or modify it.

The existing vector-store initializer can delete/recreate a Pinecone index if its dimension mismatches the embedding configuration. Before asking questions or indexing documents against an existing index, confirm its dimension and embedding model match (the default MiniLM model uses **384 dimensions**). Do not click sample indexing simply to start the app.

## More details

- `docs/FRONTEND_ARCHITECTURE.md`: actual API and pipeline architecture.
- `docs/DEPLOYMENT_NEXTJS.md`: environment variables, backup/migration, and optional hosting instructions.
- `docs/VALIDATION_NEXTJS.md`: tests and verification scope.

The backend must remain running while you use the frontend. The UI reconnects automatically every 15 seconds and on window focus.
