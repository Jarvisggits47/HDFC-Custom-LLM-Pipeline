"""
Minimal model gateway stub. Real deployments must add: authentication,
retrieval of authoritative context, guardrail input/output checks, and
trace/audit logging (see docs/api). This stub exists to prove the wiring:
adapter in, structured response out, matching the /v1/inference contract.
"""
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE_MODEL = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
ADAPTER_PATH = "runs/adapter-v0/adapter"

state = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    base_model = AutoModelForCausalLM.from_pretrained(BASE_MODEL)
    model = PeftModel.from_pretrained(base_model, ADAPTER_PATH)
    model.eval()
    state["tokenizer"] = tokenizer
    state["model"] = model
    yield
    state.clear()


app = FastAPI(title="HDFC model gateway (stub)", lifespan=lifespan)


class InferenceRequest(BaseModel):
    purpose: str
    task: str
    prompt: str
    max_new_tokens: int = 150


class InferenceResponse(BaseModel):
    answer: str
    citations: list[str] = []
    confidence_band: str = "unverified"
    escalation_required: bool = False
    trace_id: str


@app.post("/v1/inference", response_model=InferenceResponse)
def infer(req: InferenceRequest):
    # NOTE: a real gateway attaches retrieval context here before generation,
    # and runs input/output guardrail validation before returning.
    tokenizer = state["tokenizer"]
    model = state["model"]

    inputs = tokenizer(req.prompt, return_tensors="pt")
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=req.max_new_tokens, do_sample=False)
    answer = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)

    return InferenceResponse(
        answer=answer.strip(),
        confidence_band="unverified",
        escalation_required=False,
        trace_id="local-dev-trace",
    )


@app.get("/health")
def health():
    return {"status": "ok", "adapter_loaded": "model" in state}
