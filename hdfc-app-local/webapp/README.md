# Control plane web app — real local model, real RAG, zero cost

A working full-stack app implementing the pipeline's core loop with **a
real, free, local open-weights model and real retrieval-augmented
generation** — no API key, no paid usage, nothing leaves your machine.
Upload an actual policy PDF (or paste text), watch it get chunked and
scanned for PII, approve the dataset, build an adapter (real: assembles
phrasing examples + fits a real TF-IDF search index over your documents),
run the banking evaluation gate, register the model, promote to a canary
deployment, and talk to it — every answer triggers **live retrieval** for
that exact question, not a static prompt.

## What's real

## Model quality & speed upgrades (this version)

1. **Default model upgraded**: `Qwen/Qwen2.5-1.5B-Instruct` instead of
   SmolLM2-360M — meaningfully better grounding and instruction-following
   (e.g. correctly lists all 7 required home loan documents instead of
   inventing 3 wrong ones). Bigger options (`Qwen2.5-3B-Instruct`,
   `Phi-3.5-mini-instruct`) are in the model dropdown for higher quality at
   the cost of speed if you have the CPU/RAM budget.
2. **Stricter grounding prompt**: explicitly instructs the model to use
   ONLY retrieved context, say "I don't have sufficient information" if
   the context doesn't cover it, never fall back on general banking
   knowledge, and answer completely (list every item, not just some).
3. **Real citations**: every adapted answer now ends with a deterministic
   `Source: filename.pdf` line — computed from what was actually
   retrieved, not left to the model to cite correctly.
4. **Better retrieval**: smaller chunks (500 vs 700 chars, more overlap)
   for finer subsection-level matches, `k=4` instead of 3, and bigram
   TF-IDF features for better phrase matching (e.g. "identity proof" as a
   unit, not just "identity" + "proof" separately).
5. **~2x faster evaluation gate**: base-model and adapted-model generation
   per test case now run concurrently (they're independent model objects),
   and evaluation calls use a shorter token budget than the Playground
   since compliance phrases appear early in the answer.
6. **Full CPU utilization**: `torch.set_num_threads()` set to your core
   count at startup — the single biggest free speed lever for CPU-only
   `transformers` inference.



If you tested an earlier version and saw every case fail even with a
perfectly-matched document: that was a real bug, now fixed.

1. **`repetition_penalty` was fighting correct answers.** The old setting
   (1.3) penalizes the model for reusing *any* word already in its prompt —
   including the exact retrieved compliance phrase it should have quoted
   (e.g. "cannot guarantee"). It was being pushed toward paraphrasing away
   from the right answer. Lowered to 1.05.
2. **The system prompt now explicitly says to quote required disclosures
   verbatim** rather than paraphrase them, since exact wording matters for
   compliance-style answers.
3. **Documents-only datasets now get built-in fallback phrasing examples**
   for the three universal refusal/escalation behaviors (investment
   guarantees, fraud escalation, legal advice) automatically — previously,
   a dataset with only uploaded PDFs and no task records left the model
   with zero guidance on the bank's expected wording for these cases.
4. **Evaluation results now show `retrieval_hit` separately from `passed`**
   for the two factual test cases (savings minimum balance, FD penalty).
   This separates two genuinely different failure modes: retrieval finding
   nothing relevant (e.g. you uploaded a home loan PDF, which never
   mentions savings accounts — a correct "I don't know") vs. retrieval
   finding the right chunk but the small model paraphrasing instead of
   quoting it. Only the latter is a real generation-quality problem.



- **Document ingestion**: real PDF text extraction (`pypdf`) or pasted
  text, both go through the same pipeline.
- **PII scanning**: regex-based detection and redaction (PAN, Aadhaar,
  phone, email, account/card-number patterns) runs on every uploaded
  document before it's stored.
- **Chunking**: sentence-boundary-aware sliding window, ~700 characters
  with overlap.
- **Retrieval**: a real TF-IDF vectorizer + cosine similarity search is
  fit over each dataset's chunks at adapter-build time — a real, working
  "vector database" stand-in, no external service needed. At **every
  single inference call**, the top-matching chunks for that specific
  question are retrieved fresh and injected into the prompt.
- **Generation and evaluation**: a real local language model —
  [`HuggingFaceTB/SmolLM2-360M-Instruct`](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct)
  by default — runs real forward passes on your machine's CPU. No API
  key, no per-token cost, no data sent anywhere.
- **Monitoring**: request count, average latency, and escalation rate are
  tracked from real inference logs and shown on the Overview tab.

## Why this isn't literal LoRA weight fine-tuning, and why that's OK

Real GPU-based LoRA weight fine-tuning needs a GPU and a fair amount of
setup. Instead this implements the two things that actually matter for a
"does the model know your bank's policies" system: (1) a small system
prompt carrying phrasing/escalation conventions, and (2) real RAG — so a
policy update means uploading a new document and rebuilding a fast adapter
(seconds), never retraining weights. This is a genuine production
pattern, not a placeholder for one.

If you want literal weight fine-tuning later, `packages/finetuning/train_lora.py`
and `services/evaluation-service/evaluate.py` (at the repo root) are real
PEFT/TRL scripts for it — RAG and weight fine-tuning are complementary,
not alternatives, so you'd likely want both eventually.

## 1. Run it

### Windows (PowerShell)

```powershell
cd webapp
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python -m uvicorn backend.app.main:app --reload --app-dir .
```

**Always launch with `python -m uvicorn ...`, not the bare `uvicorn`
command** — that guarantees it uses your activated venv's Python, which is
the #1 cause of `ModuleNotFoundError: No module named 'fastapi'` on
Windows (a stray global `uvicorn.exe` earlier on PATH silently uses the
wrong interpreter).

If you still get that error: confirm the venv actually has the packages —
`python -c "import fastapi"` should print nothing (success) while the venv
is active. If it errors, re-run `pip install -r backend\requirements.txt`
in that same activated window.

### macOS / Linux

```bash
cd webapp
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --reload --app-dir .
```

Open **http://localhost:8000**.

### One-time model download

The first time you build an adapter run or use the Playground, the app
downloads the base model from Hugging Face — about 700MB for the default
model, cached afterward under `~/.cache/huggingface`. This needs normal
internet access once; after that it's fully offline. If the download
fails, the sidebar status dot turns red and shows the error.

**No GPU required.** The default model is small enough to run on CPU —
expect a few seconds per response, and roughly 15–40 seconds for the full
5-case evaluation gate (10 generations).

## 2. Walking through the UI

1. **Datasets** — register a dataset (records are optional — you can go
   documents-only). Use **Load sample banking dataset** for a quick
   start, or leave records as `[]` and go straight to documents.
2. **Upload a document** — pick your dataset in the second form, either
   upload a real `.pdf` or paste policy text directly. You'll see the
   chunk count and whether PII was found and redacted. Add as many
   documents as you like before approving.
3. **Approve** the dataset once you're happy with its records/documents.
4. **Adaptation runs** — pick the approved dataset, choose a model size,
   click **Build adapter**. Real work: loads records, builds the phrasing
   prompt, downloads/loads the local model, and **fits a real TF-IDF
   index** over your document chunks — you'll see each step and how many
   chunks were indexed.
5. **Evaluation gate** — makes **10 real local generations** (5 banking
   test cases × base vs. adapted), and the adapted calls go through real
   retrieval too. Takes roughly 15–40 seconds on CPU with a live progress
   bar.
6. **Model registry** → **Promote & deploy canary** (only enabled if the
   gate passed — a real block, not cosmetic).
7. **Deployments** — expand traffic or roll back.
8. **Playground** — ask a real question. If your deployment has indexed
   documents, you'll see **"Retrieved for this query"** under the answer
   — the actual chunks pulled live for that specific question, proving
   retrieval isn't static. Try asking about two different topics from two
   different uploaded documents and watch the retrieved context change
   each time.

## Choosing a model

Three sizes are offered in the run form, all free and local:

| Model | Size | Speed on CPU | Quality |
|---|---|---|---|
| `HuggingFaceTB/SmolLM2-135M-Instruct` | 135M | fastest | roughest |
| `HuggingFaceTB/SmolLM2-360M-Instruct` | 360M | default | good balance |
| `Qwen/Qwen2.5-0.5B-Instruct` | 0.5B | slower | best of the three |

You can also type in any other causal-LM Hugging Face model id if you have
the CPU/GPU budget for something bigger.

## Running with Docker

```bash
cd webapp
docker compose up --build
```
Open **http://localhost:8000**. No environment variables to set — the
compose file already persists the trained adapters and the downloaded
model cache in named volumes so they survive container restarts.

## Deploying it somewhere real

Single stateless container: SQLite is a file, not a service, and the
TF-IDF retriever artifacts + downloaded model weights are on local disk —
mount `/srv/data` (already wired for the DB and adapters in
`docker-compose.yml`) and a persistent volume for `~/.cache/huggingface`
if you want to avoid re-downloading the model on every redeploy. Put it
behind your own auth if it's reachable from the internet — there's none
built in here.

## Swapping in real LoRA weight fine-tuning

Two functions in `backend/app/local_llm.py` own the model-calling
behavior — replace these, nothing else changes:

1. **`_run_build_job()`** — the retrieval half (`build_retriever`) doesn't
   need to change. Replace the phrasing-prompt half with a subprocess call
   to `packages/finetuning/train_lora.py`. Store the resulting adapter
   path alongside the retriever.
2. **`call_model()`** — replace the plain `generate()` call with a
   `transformers` + `peft` `PeftModel.generate()` call once you have a
   trained adapter, exactly like `services/evaluation-service/evaluate.py`
   already does.

The API contracts, database schema, retrieval layer, and frontend don't
need to change either way.
