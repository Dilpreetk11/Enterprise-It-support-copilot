# Validation results — 17 October 2026

## Dark-theme and local-connection follow-up

Question shortcuts now stay above the composer throughout a conversation. The welcome cards switch to compact persistent buttons after the first message. The desktop/mobile chat regression also checks that all four buttons remain available and that clicking a different suggestion submits a second question.

The UI now uses a dark navy theme, larger readable text, stronger contrast, and violet accents. Health polling runs every 15 seconds and on window focus. A `start-local.ps1` launcher starts the API, waits for health, and starts/reuses the frontend; `START_HERE.md` documents a fresh Windows setup.

The local API originally was not listening. Starting it exposed broken HuggingFace Hub distribution metadata in the available shared Python runtime. A project-local ignored `.venv` was created, a valid Hub package installed there, and a local `.pth` reused the existing runtime libraries with repaired local packages taking precedence. No shared Python installation, provider configuration, or RAG implementation was modified. This machine-specific environment is excluded from the download; fresh downloads install dependencies from requirements in their own environment.

Verified after the changes: production build, lint, standalone TypeScript, six desktop/mobile UI tests, four isolated Python API tests in the repaired environment, and **a real browser → FastAPI health check without mocked HTTP** (`npm run check:local`). The latter reported `Real Python API: healthy` and `Real browser → FastAPI: connected; dark theme verified`. No live chat/provider call or indexing operation was run. Screenshots were reviewed on desktop/mobile.

The original validation record below describes the initial implementation; its statement that no live provider operation occurred remains true.

Implemented in the existing local checkout; no Git commit, push, cloud deployment, production configuration change, or live AI/vector operation was performed.

## Verified checks

| Check | Result | Evidence / scope |
| --- | --- | --- |
| Frontend production build | PASS | Next.js 16.4.2 compiled, type-checked, and generated `/` and `/_not-found`; static pages |
| ESLint | PASS | `npm run lint`, no errors/warnings; TypeScript recommended, React hooks, and JSX accessibility rules |
| TypeScript | PASS | `npm run typecheck`; final build also ran TypeScript checks |
| API-client tests | PASS, 6 tests | Exact question JSON; multipart `file` and admin header; 401/422 errors; offline/timeout/non-JSON handling; unsafe-link rejection |
| Desktop/mobile browser tests | PASS, 6 tests | Production Next server in Microsoft Edge; iPhone-sized Chromium emulation; chat, Markdown, citations, decision trace, metrics, clearing, upload, empty audit, offline/error/retry state, no horizontal overflow, compact-screen cards and trace visibility above composer |
| Python tests | PASS, 8 tests | Existing tests plus 4 new API contract tests; temporary SQLite/uploads; mocked LLM/vector writes; existing schema/chunk/audit tests |
| npm dependency audit | PASS, 0 vulnerabilities | Final dependency install reported zero advisories after updating Vitest and replacing the vulnerable lint-config dependency chain |
| Git packaging | PASS | API client explicitly unignored from pre-existing `lib/` ignore pattern; frontend dependencies, secrets, build output, test reports ignored; lockfile included |
| Existing application preservation | PASS | No tracked Python implementation, prompt, tool, Streamlit source, root requirements, `.env`, original Dockerfile, or Streamlit production configuration was changed; tracked README only gained integration links and current-code guidance |

Browser tests stub HTTP API responses; Python tests exercise real FastAPI handlers with external service calls mocked. These are complementary contract/integration checks, not evidence of live Groq/Pinecone/Tavily connectivity. Desktop and mobile screenshots were visually inspected. Mobile testing is emulation, not physical iPhone/Safari testing.

Initial validation found and fixed: lint violations, unsafe broad error-test selector matching Next's accessibility announcer, vulnerable test/lint dependencies, an ignored API-client directory, trace visibility behind the composer, and suggestion visibility on short desktop screens. Final checks pass. Sandbox access failures for test compilers/temp files were resolved by approved test runs outside the filesystem sandbox; they are not outstanding application failures.

Existing Python dependency deprecation warning remains: `langchain-community` imports are being sunset upstream. The backend and document loaders were intentionally preserved.

## Boundaries verified

| Boundary | Status |
| --- | --- |
| UI renders and responds on desktop/mobile | Verified with screenshots and browser tests |
| Browser request shape → API-client contract | Verified using HTTP interception and request assertions |
| Original FastAPI route → Python service contract | Verified with TestClient and controlled provider replacements |
| Backend audit write → admin audit read | Verified against temporary SQLite |
| Upload → parser/chunk/index response | Verified with isolated handler tests and browser multipart contract; sample route uses real text loading/chunking with mocked vector writes |
| Returned answer/citations/trace → UI | Verified using fixture responses |
| Private production KB → provider → live grounded answer | Not executed; existing Pinecone deletion-on-dimension-mismatch behavior makes unreviewed provider calls inappropriate |

## Remaining acceptance checks

- Inspect/backup the actual deployed audit/uploads and existing Pinecone index/namespace/dimensions. Local storage is not proof of deployed contents.
- Verify live Groq, Pinecone, Tavily, embedding downloads, and private KB grounding after confirming index safety.
- Build/run the opt-in Docker image on the chosen host and check memory, first model download, request timeouts, and persistent-disk behavior across restart.
- Verify cloud HTTPS, exact CORS origins, and Vercel's build-time API URL against deployed services.
- Confirm a real chat produces a durable audit row; existing audit errors are logged and do not fail chat responses.
- Run deliberate upload/sample-index acceptance only with an approved test namespace/document; ingestion is a real vector write and can duplicate records.
- Retain Streamlit until acceptance and rollback readiness are confirmed.

Exact commands and migration/deployment steps are in `DEPLOYMENT_NEXTJS.md`; architecture, storage findings, and API schemas are in `FRONTEND_ARCHITECTURE.md`.
