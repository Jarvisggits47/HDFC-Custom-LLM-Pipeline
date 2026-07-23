# HDFC Banking AI Factory — Control Plane Web App

A full-stack Enterprise Banking AI Factory running **100% locally on CPU** — no API key, no paid usage, nothing leaves your machine. Supports the complete release control-plane workflow:

Dataset governance → Adaptation runs → Evaluation gate → Model registry → Canary deployment → Playground

---

## How it works

- **Document ingestion**: PDF and DOCX files are extracted, PII-scanned (PAN, Aadhaar, phone, email, account/card numbers), and chunked into sentence-boundary-aware segments.
- **RAG retrieval**: Document chunks are embedded with `sentence-transformers` (BAAI/bge-small-en-v1.5). At **every inference call**, the top-matching chunks for that specific question are retrieved fresh and injected into the prompt.
- **Generation**: A small local instruction-tuned model (`HuggingFaceTB/SmolLM2-360M-Instruct` by default) runs forward passes on your machine's CPU via `transformers`. No GPU required.
- **Evaluation gate**: 5 banking test cases × base/adapted model = 10 real model calls. Blocks promotion on any critical failure.
- **Monitoring**: Request count, latency, escalation rate tracked from real inference logs.

---

## Quick start

### Windows (PowerShell)

```powershell
cd webapp
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python -m uvicorn backend.app.main:app --reload --app-dir .
```

### macOS / Linux

```bash
cd webapp
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --reload --app-dir .
```

Open **http://localhost:8000**.

**Always use `python -m uvicorn ...`** — the bare `uvicorn` command uses a different Python interpreter on Windows and causes `ModuleNotFoundError`.

---

## First startup — model download

The first time you build an adapter or use the Playground, the app downloads models from Hugging Face:

| Component | Model | Size |
|---|---|---|
| Generator (LLM) | SmolLM2-360M-Instruct | ~360 MB |
| Embedder | BAAI/bge-small-en-v1.5 | ~130 MB |

Downloads are cached under `~/.cache/huggingface` and **never re-downloaded** on subsequent starts. After the first run the app works fully offline.

The **health endpoint** (`GET /api/health`) and the sidebar status dot show:
- `loading` — warm-up in progress (background thread downloading/loading models)
- `ready` — both LLM and embedder are loaded
- `failed` — model load failed (see `load_error` field for details)

---

## Concurrency

CPU inference is single-threaded. If a second request arrives while a generation is running it receives:

```
HTTP 503  Retry-After: 10
{"error": "Model busy. Please retry in a few seconds."}
```

This prevents OOM and slow responses from concurrent generation attempts. The evaluation gate always runs in a background thread and does not block the API.

---

## Configuring the model

Change `DEFAULT_MODEL` in `.env` to switch models — **no Python changes needed**:

```env
DEFAULT_MODEL=HuggingFaceTB/SmolLM2-360M-Instruct   # default — fastest
DEFAULT_MODEL=Qwen/Qwen2.5-0.5B-Instruct            # better grounding
DEFAULT_MODEL=Qwen/Qwen2.5-1.5B-Instruct            # best quality, slowest
```

Copy `.env.example` to `.env` and uncomment the line you want. The model is downloaded once and cached.

---

## Walkthrough

1. **Datasets** — register a dataset. Click **Load sample banking dataset** for a quick start, or leave records as `[]` and go straight to documents.
2. **Upload a document** — pick your dataset, upload a `.pdf` or `.docx`, or paste policy text directly. You'll see the chunk count and whether PII was found and redacted.
3. **Approve** the dataset once ready.
4. **Adaptation runs** — pick the approved dataset, choose a model, click **Build adapter**. Real work: loads the LLM and embedder, chunks and indexes your documents.
5. **Evaluation gate** — 10 real local generations (5 banking test cases × base vs. adapted). Takes 1–5 minutes on CPU.
6. **Model registry** → **Promote & deploy canary** (only enabled when the gate passes — a real block, not cosmetic).
7. **Deployments** — expand traffic or roll back.
8. **Playground** — ask a real question. If your deployment has indexed documents, you'll see **"Retrieved for this query"** under the answer — the actual chunks pulled live for that specific question.

---

## Deployment — Render (backend) + Firebase Hosting (frontend)

### Backend on Render (without Docker)

1. Push the repo to GitHub.
2. Create a new **Web Service** on [render.com](https://render.com).
3. Settings:
   - **Root directory**: `hdfc-app-local/webapp`
   - **Build command**: `pip install -r backend/requirements.txt`
   - **Start command**: `python -m uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT --app-dir .`
   - **Instance type**: at least 1 GB RAM (2 GB+ recommended for 0.5B model)
4. Environment variables (Render → Environment):
   ```
   DEFAULT_MODEL=HuggingFaceTB/SmolLM2-360M-Instruct
   PIPELINE_DB_PATH=/var/data/pipeline.db
   RETRIEVER_DIR=/var/data/runs
   FRONTEND_ORIGIN=https://your-app.web.app
   ```
5. Add a **Persistent Disk** mounted at `/var/data` — this persists the SQLite DB, retriever artifacts, and the Hugging Face model cache across deploys.
6. Set `HF_HOME=/var/data/hf_cache` in environment variables so the model is cached on the persistent disk.

**First deploy note**: the first request triggers a model download (~360 MB for SmolLM2). Subsequent deploys reuse the cache — no re-download.

### Backend on Railway

1. Create a new **Railway project** from your GitHub repo.
2. Set **Root directory**: `hdfc-app-local/webapp`.
3. Set **Start command**: `python -m uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT --app-dir .`
4. Add a **Volume** mounted at `/var/data`.
5. Environment variables:
   ```
   DEFAULT_MODEL=HuggingFaceTB/SmolLM2-360M-Instruct
   PIPELINE_DB_PATH=/var/data/pipeline.db
   RETRIEVER_DIR=/var/data/runs
   HF_HOME=/var/data/hf_cache
   FRONTEND_ORIGIN=https://your-app.web.app
   ```

### Frontend on Firebase Hosting

The frontend is plain HTML/CSS/JS — no build step needed.

1. Install Firebase CLI: `npm install -g firebase-tools`
2. In `hdfc-app-local/webapp/frontend/`, run `firebase init hosting`.
3. Set public directory to `.` (current directory).
4. In `app.js`, update `const API = "/api"` to your Render/Railway backend URL:
   ```js
   const API = "https://your-backend.onrender.com/api";
   ```
5. Deploy: `firebase deploy --only hosting`

---

## Environment variables reference

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_MODEL` | `HuggingFaceTB/SmolLM2-360M-Instruct` | HuggingFace model ID for generation |
| `EMBED_MODEL` | `BAAI/bge-small-en-v1.5` | HuggingFace model ID for embeddings |
| `PIPELINE_DB_PATH` | `./pipeline.db` | Path to SQLite database file |
| `RETRIEVER_DIR` | `./runs` | Directory for adapter/retriever artifacts |
| `HF_TOKEN` | *(unset)* | HuggingFace token — only needed for gated models |
| `HF_HOME` | `~/.cache/huggingface` | HuggingFace cache directory |
| `GENERATE_TIMEOUT_S` | `600` | Wall-clock timeout for a single generation |
| `FRONTEND_ORIGIN` | `*` | Comma-separated allowed CORS origins |
| `MIN_RETRIEVAL_SCORE` | `0.35` | Minimum cosine similarity for a retrieved chunk to be used |

---

## Architecture preserved

The Enterprise Banking AI Factory workflow is intact:

- PDF/DOCX upload → PII scan → semantic chunking → dedup → dataset
- Dataset governance → approval gate → immutable versioning
- Adaptation runs → phrasing prompt + embedding index → adapter artifact
- Evaluation gate → 5 banking test cases × base/adapted → gate pass/fail
- Model registry → signed entry linking run + eval + owner
- Canary deployment → traffic expansion → rollback
- Playground → live RAG retrieval + generation + citations + confidence score
- Monitoring → request count, latency, escalation rate, guardrail breakdown
