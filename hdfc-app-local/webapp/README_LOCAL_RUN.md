# Running this locally (Windows / Mac / Linux)

This is the same control-plane app as before, with the Colab "Tier 1" upgrades
ported in: **embeddings retrieval (BAAI/bge-small-en-v1.5) instead of TF-IDF,
semantic sentence-boundary chunking with page numbers, real citations
(document + page + chunk id), a confidence score, and a guardrails
pre-check** that blocks prompt-injection attempts before the model is called.

Still: no API key, nothing leaves your machine, still real local inference —
not real LoRA weight fine-tuning yet (see `README.md` for that distinction).

## 1. Install

```bash
cd webapp/backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

First run will download two models from Hugging Face (one-time, needs
internet): `Qwen/Qwen2.5-1.5B-Instruct` (~3GB) and `BAAI/bge-small-en-v1.5`
(~130MB). After that, everything is offline.

## 2. Run

```bash
uvicorn app.main:app --reload --port 8000
```

Open **http://localhost:8000** — the frontend is served from the same app.

## 3. Use it

1. **Datasets tab** → create a dataset → upload a policy PDF (or paste text).
2. **Approve** the dataset (freezes it).
3. **AI Factory / Runs tab** → start a run against that dataset (pick a
   serving model; embedding model defaults to BGE-small).
4. Wait for the run to hit `completed` (loads models + embeds your chunks —
   first time is slower because it's downloading weights).
5. **Evaluation tab** → run the fixed 5-case banking gate. Read the `note`
   field in the result — it's a small sanity-check suite, not a release
   benchmark; treat pass/fail as directional, not proof.
6. **Registry → Promote** the model once the gate passes → creates a canary
   deployment.
7. **Playground tab** → pick the deployment → ask a real question. You'll now
   see the answer, a confidence %, and real citations (`file.pdf — Page 4 —
   file.pdf#p4-2 — similarity 0.81`).

## Speed expectations (be realistic)

CPU generation on a 1.5B model in float32 is genuinely slow — a few seconds
to tens of seconds per answer depending on your machine, versus near-instant
on the T4 GPU in Colab. That's a hardware difference, not a bug. Options if
this matters for a demo:
- Switch `LOCAL_MODEL` (in `.env` or `webapp/backend/.env`) to
  `HuggingFaceTB/SmolLM2-360M-Instruct` — much faster, lower quality.
- Use a machine with a CUDA GPU — `torch` will use it automatically if
  available (no code change needed for `device_map`, but you'd want to
  test `torch.cuda.is_available()` and move tensors to `.to("cuda")`, which
  the current CPU-only `local_llm.py` doesn't do yet — ask if you want that
  added).
- Keep using Colab for the "does the RAG design work" question and this
  local app for the "does the full pipeline UX work" question — they're
  answering different questions and don't have to converge yet.

## What changed vs. before (this version)

| Area | Before | Now |
|---|---|---|
| Retrieval | TF-IDF (keyword overlap only) | Sentence embeddings (BGE-small), catches paraphrases |
| Chunking | Fixed 500-char sliding window | Sentence-boundary-aware, paragraph-first, never cuts a fact mid-sentence |
| Citations | Filename only | Filename + page number + chunk id + similarity score |
| Confidence | None | Heuristic score (retrieval similarity + answer/context overlap) |
| Guardrails | Implicit in prompt only | Explicit deterministic pre-check (prompt injection blocked before model call; fraud/legal/medical/investment flagged) |
| Eval result | Bare pass/fail | Includes a `note` field flagging it as a small sanity suite, not a benchmark |

## Still not done (be upfront about this if it's graded)

- No real LoRA/QLoRA weight fine-tuning wired into the webapp — `local_llm.py`
  still does RAG + prompt, not weight adaptation. `packages/finetuning/train_lora.py`
  exists standalone and is the real starting point if/when you want to wire
  that in.
- Eval suite is 5 fixed cases — no held-out benchmark, no contamination
  checks, no entity/time-aware splits.
- No MLflow/K8s/vLLM — this is a single FastAPI process with SQLite, which is
  fine for local validation but is not what the enterprise spec doc describes
  for a production release.
