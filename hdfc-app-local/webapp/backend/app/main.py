import os
import time
import uuid
from datetime import datetime, timedelta

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from . import models, schemas, local_llm, document_prep
from .database import Base, engine, SessionLocal, get_db

Base.metadata.create_all(bind=engine)

app = FastAPI(title="HDFC custom LLM pipeline — control plane")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def dataset_record_count(db: Session, dataset_id: str) -> int:
    return db.query(models.DatasetRecord).filter(models.DatasetRecord.dataset_id == dataset_id).count()


def dataset_chunk_count(db: Session, dataset_id: str) -> int:
    return db.query(models.DocumentChunk).filter(models.DocumentChunk.dataset_id == dataset_id).count()


def ingest_pages(db: Session, dataset_id: str, filename: str, pages: list[tuple[int, str]]) -> dict:
    """Page-aware ingestion: PII redaction + semantic (sentence-boundary
    aware) chunking, keeping the page number of each chunk for citations."""
    _, pii_found_any = document_prep.redact_pii("\n".join(t for _, t in pages))
    chunk_dicts = document_prep.chunk_pages(pages)
    for c in chunk_dicts:
        db.add(models.DocumentChunk(
            id=new_id("chunk"),
            dataset_id=dataset_id,
            source_filename=filename,
            chunk_index=c["chunk_index"],
            page=c["page"],
            text=c["text"],
            pii_redacted=pii_found_any,
        ))
    db.commit()
    return {"filename": filename, "chunks_created": len(chunk_dicts), "pii_redacted": pii_found_any}


def ingest_document(db: Session, dataset_id: str, filename: str, raw_text: str) -> dict:
    """Text-paste ingestion (no page structure — everything is page 1)."""
    return ingest_pages(db, dataset_id, filename, [(1, raw_text)])


# ---------------------------------------------------------------- datasets
@app.post("/api/datasets", response_model=schemas.DatasetOut)
def create_dataset(payload: schemas.DatasetCreate, db: Session = Depends(get_db)):
    ds = models.Dataset(
        id=new_id("ds"),
        name=payload.name,
        source=payload.source,
        purpose=payload.purpose,
        classification=payload.classification,
    )
    db.add(ds)
    db.flush()

    for r in payload.records:
        db.add(models.DatasetRecord(
            id=new_id("rec"),
            dataset_id=ds.id,
            task_type=r.task_type,
            instruction=r.instruction,
            context=r.context,
            response=r.response,
            citations=r.citations,
            refusal_required=r.refusal_required,
            escalation_required=r.escalation_required,
        ))
    db.commit()
    db.refresh(ds)
    out = schemas.DatasetOut.model_validate(ds)
    out.record_count = dataset_record_count(db, ds.id)
    out.chunk_count = dataset_chunk_count(db, ds.id)
    return out


@app.get("/api/datasets", response_model=list[schemas.DatasetOut])
def list_datasets(db: Session = Depends(get_db)):
    datasets = db.query(models.Dataset).order_by(models.Dataset.created_at.desc()).all()
    out = []
    for ds in datasets:
        item = schemas.DatasetOut.model_validate(ds)
        item.record_count = dataset_record_count(db, ds.id)
        item.chunk_count = dataset_chunk_count(db, ds.id)
        out.append(item)
    return out


@app.post("/api/datasets/{dataset_id}/upload-pdf")
async def upload_pdf(dataset_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    ds = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "dataset not found")
    if ds.status == "approved":
        raise HTTPException(400, "dataset is already approved and frozen — register a new dataset for updated documents")
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "only .pdf files are accepted here — use /upload-text for pasted text")

    file_bytes = await file.read()
    try:
        pages = document_prep.extract_pdf_pages(file_bytes)
    except Exception as e:
        raise HTTPException(400, f"could not read PDF: {e}")
    if not any(t.strip() for _, t in pages):
        raise HTTPException(400, "no extractable text found in this PDF (it may be scanned/image-only)")

    result = ingest_pages(db, dataset_id, file.filename, pages)
    return result


@app.post("/api/datasets/{dataset_id}/upload-text")
def upload_text(dataset_id: str, filename: str = Form(...), text: str = Form(...), db: Session = Depends(get_db)):
    ds = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "dataset not found")
    if ds.status == "approved":
        raise HTTPException(400, "dataset is already approved and frozen — register a new dataset for updated documents")
    if not text.strip():
        raise HTTPException(400, "text is empty")

    result = ingest_document(db, dataset_id, filename, text)
    return result


@app.get("/api/datasets/{dataset_id}/chunks")
def list_chunks(dataset_id: str, db: Session = Depends(get_db)):
    chunks = db.query(models.DocumentChunk).filter(models.DocumentChunk.dataset_id == dataset_id).all()
    return [{"id": c.id, "source_filename": c.source_filename, "chunk_index": c.chunk_index,
             "page": c.page, "chunk_id": c.chunk_id, "text": c.text, "pii_redacted": c.pii_redacted}
            for c in chunks]


@app.post("/api/datasets/{dataset_id}/approve", response_model=schemas.DatasetOut)
def approve_dataset(dataset_id: str, db: Session = Depends(get_db)):
    ds = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "dataset not found")
    if dataset_record_count(db, dataset_id) == 0 and dataset_chunk_count(db, dataset_id) == 0:
        raise HTTPException(400, "dataset has no records and no documents — cannot approve an empty dataset")
    ds.status = "approved"
    db.commit()
    db.refresh(ds)
    out = schemas.DatasetOut.model_validate(ds)
    out.record_count = dataset_record_count(db, dataset_id)
    out.chunk_count = dataset_chunk_count(db, dataset_id)
    return out


# --------------------------------------------------------------------- runs
@app.post("/api/runs", response_model=schemas.RunOut)
def create_run(payload: schemas.RunCreate, db: Session = Depends(get_db)):
    ds = db.query(models.Dataset).filter(models.Dataset.id == payload.dataset_id).first()
    if not ds:
        raise HTTPException(404, "dataset not found")
    if ds.status != "approved":
        raise HTTPException(400, "dataset must be approved before it can be used in a run")
    run = models.Run(
        id=new_id("run"),
        name=payload.name,
        serving_model=payload.serving_model,
        embedding_model=payload.embedding_model,
        dataset_id=payload.dataset_id,
        status="queued",
        progress=0,
        build_steps=[],
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    local_llm.start_adapter_build(run.id, SessionLocal)
    return run


@app.get("/api/runs", response_model=list[schemas.RunOut])
def list_runs(db: Session = Depends(get_db)):
    return db.query(models.Run).order_by(models.Run.created_at.desc()).all()


@app.get("/api/runs/{run_id}", response_model=schemas.RunOut)
def get_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(models.Run).filter(models.Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "run not found")
    return run


# ------------------------------------------------------------- evaluations
@app.post("/api/evaluations", response_model=schemas.EvaluationOut)
def create_evaluation(payload: schemas.EvaluationCreate, db: Session = Depends(get_db)):
    run = db.query(models.Run).filter(models.Run.id == payload.run_id).first()
    if not run:
        raise HTTPException(404, "run not found")
    if run.status != "completed":
        raise HTTPException(400, "run must complete before it can be evaluated")
    ev = models.Evaluation(id=new_id("eval"), run_id=run.id, status="queued", progress=0)
    db.add(ev)
    db.commit()
    db.refresh(ev)

    local_llm.start_evaluation(ev.id, SessionLocal)
    return ev


@app.get("/api/evaluations", response_model=list[schemas.EvaluationOut])
def list_evaluations(db: Session = Depends(get_db)):
    return db.query(models.Evaluation).order_by(models.Evaluation.created_at.desc()).all()


@app.get("/api/evaluations/{evaluation_id}", response_model=schemas.EvaluationOut)
def get_evaluation(evaluation_id: str, db: Session = Depends(get_db)):
    ev = db.query(models.Evaluation).filter(models.Evaluation.id == evaluation_id).first()
    if not ev:
        raise HTTPException(404, "evaluation not found")
    return ev


# ------------------------------------------------------------------ registry
@app.post("/api/registry", response_model=schemas.RegistryOut)
def register_model(payload: schemas.RegistryCreate, db: Session = Depends(get_db)):
    run = db.query(models.Run).filter(models.Run.id == payload.run_id).first()
    ev = db.query(models.Evaluation).filter(models.Evaluation.id == payload.evaluation_id).first()
    if not run or not ev:
        raise HTTPException(404, "run or evaluation not found")
    if ev.run_id != run.id:
        raise HTTPException(400, "evaluation does not belong to this run")
    if ev.status != "completed":
        raise HTTPException(400, "evaluation has not completed yet")

    version = f"v{db.query(models.ModelRegistryEntry).count() + 1}"
    model_card = {
        "run_id": run.id,
        "serving_model": run.serving_model,
        "adapter_hash": run.adapter_hash,
        "record_count_used": run.record_count_used,
        "evaluation_id": ev.id,
        "gate_pass": ev.gate_pass,
        "critical_failures": ev.critical_failures,
        "owner": payload.owner,
        "expiry_date": (datetime.utcnow() + timedelta(days=180)).date().isoformat(),
        "intended_use": "Approved banking tasks only: terminology, intent classification, "
                        "drafting, summarization, grounded Q&A.",
        "prohibited_use": "Autonomous transaction decisions, customer commitments, legal/financial advice.",
    }
    entry = models.ModelRegistryEntry(
        id=new_id("model"),
        run_id=run.id,
        evaluation_id=ev.id,
        version=version,
        status="registered",
        model_card=model_card,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.get("/api/registry", response_model=list[schemas.RegistryOut])
def list_registry(db: Session = Depends(get_db)):
    return db.query(models.ModelRegistryEntry).order_by(models.ModelRegistryEntry.created_at.desc()).all()


@app.post("/api/registry/{model_id}/promote", response_model=schemas.DeploymentOut)
def promote_model(model_id: str, db: Session = Depends(get_db)):
    entry = db.query(models.ModelRegistryEntry).filter(models.ModelRegistryEntry.id == model_id).first()
    if not entry:
        raise HTTPException(404, "model not found")
    if not entry.model_card.get("gate_pass"):
        raise HTTPException(400, "cannot promote: evaluation gate did not pass (critical failure present)")

    entry.status = "promoted"
    db.commit()

    deployment = models.Deployment(
        id=new_id("dep"),
        model_id=entry.id,
        endpoint_name=f"banking-llm-{entry.version}",
        status="canary",
        traffic_pct=10,
    )
    db.add(deployment)
    db.commit()
    db.refresh(deployment)
    return deployment


# ---------------------------------------------------------------- deployments
@app.get("/api/deployments", response_model=list[schemas.DeploymentOut])
def list_deployments(db: Session = Depends(get_db)):
    return db.query(models.Deployment).order_by(models.Deployment.created_at.desc()).all()


@app.post("/api/deployments/{deployment_id}/expand", response_model=schemas.DeploymentOut)
def expand_deployment(deployment_id: str, db: Session = Depends(get_db)):
    dep = db.query(models.Deployment).filter(models.Deployment.id == deployment_id).first()
    if not dep:
        raise HTTPException(404, "deployment not found")
    if dep.status == "rolled_back":
        raise HTTPException(400, "cannot expand a rolled-back deployment")
    dep.traffic_pct = min(100, dep.traffic_pct + 30)
    dep.status = "active" if dep.traffic_pct >= 100 else "canary"
    db.commit()
    db.refresh(dep)
    return dep


@app.post("/api/deployments/{deployment_id}/rollback", response_model=schemas.DeploymentOut)
def rollback_deployment(deployment_id: str, db: Session = Depends(get_db)):
    dep = db.query(models.Deployment).filter(models.Deployment.id == deployment_id).first()
    if not dep:
        raise HTTPException(404, "deployment not found")
    dep.status = "rolled_back"
    dep.traffic_pct = 0
    db.commit()
    db.refresh(dep)
    return dep


# ----------------------------------------------------------------- inference
@app.post("/api/inference", response_model=schemas.InferenceResponse)
def infer(payload: schemas.InferenceRequest, db: Session = Depends(get_db)):
    served_by = "base model (no active deployment, no banking context)"
    retrieved_chunks: list[str] = []
    sources: list[str] = []
    citations: list[str] = []
    confidence = 0.0

    # Guardrails run BEFORE any model call — deterministic, cheap, and
    # catches prompt-injection attempts without spending a generation call.
    guard = local_llm.Guardrails.check(payload.prompt)

    start = time.time()
    try:
        if guard["blocked"]:
            answer = guard["response"]
            served_by = "blocked by guardrails (no model call)"
        elif payload.deployment_id:
            dep = db.query(models.Deployment).filter(models.Deployment.id == payload.deployment_id).first()
            if not dep:
                raise HTTPException(404, "deployment not found")
            if dep.status == "rolled_back":
                raise HTTPException(400, "deployment has been rolled back")
            entry = db.query(models.ModelRegistryEntry).filter(models.ModelRegistryEntry.id == dep.model_id).first()
            run = db.query(models.Run).filter(models.Run.id == entry.run_id).first()
            served_by = f"{dep.endpoint_name} ({dep.status}, {dep.traffic_pct}% traffic, adapter {run.adapter_hash})"
            out = local_llm.call_adapted_model(run, payload.prompt)
            answer = out["answer"]
            retrieved_chunks = out["retrieved_chunks"]
            sources = out["sources"]
            citations = out["citations"]
            confidence = out["confidence"]
        else:
            answer = local_llm.call_model(local_llm.DEFAULT_MODEL, local_llm.GENERIC_SYSTEM_PROMPT, payload.prompt)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"model call failed: {e}")
    latency_ms = int((time.time() - start) * 1000)

    escalation_required = any(w in answer.lower() for w in ["escalat", "fraud investigation", "temporary hold"])

    log = models.InferenceLog(
        id=new_id("trace"),
        deployment_id=payload.deployment_id,
        prompt=payload.prompt,
        response=answer,
        escalation_required=escalation_required,
        guardrail_category=guard["category"],
        confidence=int(confidence),
        latency_ms=latency_ms,
    )
    db.add(log)
    db.commit()

    return schemas.InferenceResponse(
        answer=answer,
        escalation_required=escalation_required,
        served_by=served_by,
        latency_ms=latency_ms,
        retrieved_chunks=retrieved_chunks,
        sources=sources,
        citations=citations,
        confidence=confidence,
        guardrail_category=guard["category"],
        guardrail_blocked=guard["blocked"],
    )


@app.get("/api/monitoring")
def monitoring(db: Session = Depends(get_db)):
    logs = db.query(models.InferenceLog).all()
    total = len(logs)
    avg_latency = int(sum(l.latency_ms for l in logs) / total) if total else 0
    escalations = sum(1 for l in logs if l.escalation_required)
    confidences = [l.confidence for l in logs if l.confidence]
    avg_confidence = round(sum(confidences) / len(confidences), 1) if confidences else 0
    guardrail_breakdown: dict[str, int] = {}
    for l in logs:
        guardrail_breakdown[l.guardrail_category] = guardrail_breakdown.get(l.guardrail_category, 0) + 1
    return {
        "total_requests": total,
        "avg_latency_ms": avg_latency,
        "escalation_count": escalations,
        "escalation_rate": round(escalations / total, 3) if total else 0,
        "avg_confidence": avg_confidence,
        "guardrail_breakdown": guardrail_breakdown,
    }


@app.get("/api/health")
def health():
    return {"status": "ok", **local_llm.model_status()}


# ---------------------------------------------------------------- frontend
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
