# HDFC custom LLM development pipeline

Two things live in this repo:

1. **`webapp/`** — a working full-stack control plane app (FastAPI backend +
   vanilla JS frontend, one Docker container) implementing the whole pipeline
   loop end to end: register a dataset → approve it → run LoRA fine-tuning →
   run the banking evaluation gate → register the model → promote to a canary
   deployment → serve inference. **Start here** — see `webapp/README.md` for
   run/deploy instructions. This has been tested end to end in this
   environment.
2. **The scaffold below** (`packages/finetuning/train_lora.py`,
   `services/evaluation-service/evaluate.py`, `data/`, `configs/`) — real,
   standalone PEFT/TRL scripts for when you have GPU + network access to
   Hugging Face. These are the "swap-in" path referenced from the webapp's
   simulation layer.

## Quickstart

```bash
cd webapp
docker compose up --build
# open http://localhost:8000
```

That's the whole app: dataset governance, fine-tuning runs, evaluation gate,
model registry, deployment console, and an inference playground, all in one
container with no external dependencies.

---

## Scaffold details (standalone real-model scripts)

The rest of this README describes the standalone scripts below, which are a
minimal, runnable slice of the full pipeline described in the product spec:
one synthetic dataset → one LoRA fine-tuning run → one evaluation gate →
one FastAPI serving stub. Folders under `apps/`, `services/`, and
`infrastructure/` beyond what's listed are stubbed as empty folders with
README placeholders so the full target structure is visible, but only the
core loop below and the `webapp/` app actually run.

## What's real vs. stubbed

| Piece | Status |
|---|---|
| `data/synthetic/banking_instructions.jsonl` | Real sample dataset (20 records) |
| `data/schemas/task_record.schema.json` | Real JSON schema for task records |
| `packages/finetuning/train_lora.py` | Real, runnable LoRA fine-tuning script |
| `services/evaluation-service/evaluate.py` | Real, runnable eval-gate script |
| `services/model-gateway/main.py` | Real FastAPI stub serving the adapter |
| `docs/model-risk/model_card_template.md` | Real template |
| Everything else under `apps/`, `services/`, `infrastructure/` | Empty folders — fill in as you build |

## Quickstart (local, small base model)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 1. Fine-tune a LoRA adapter on the synthetic dataset
python packages/finetuning/train_lora.py \
  --base-model TinyLlama/TinyLlama-1.1B-Chat-v1.0 \
  --dataset data/synthetic/banking_instructions.jsonl \
  --output-dir runs/adapter-v0

# 2. Run the evaluation gate against base vs adapted model
python services/evaluation-service/evaluate.py \
  --adapter runs/adapter-v0 \
  --base-model TinyLlama/TinyLlama-1.1B-Chat-v1.0 \
  --fixtures data/evaluation-fixtures/banking_eval_cases.jsonl

# 3. Serve the adapter behind a minimal gateway
uvicorn services.model-gateway.main:app --reload
```

## Suggested build order

1. Get `train_lora.py` running on a small open base model — this proves the
   core adaptation loop before anything else matters.
2. Get `evaluate.py` producing a pass/fail gate result on a handful of
   hardcoded banking test cases.
3. Wrap the trained adapter in the FastAPI gateway stub.
4. Only then build out dataset registry, model registry, and UI — they're
   bookkeeping around the loop above, not the hard part.

Do not use real customer data in this scaffold. `data/synthetic/` must stay
synthetic end to end.
