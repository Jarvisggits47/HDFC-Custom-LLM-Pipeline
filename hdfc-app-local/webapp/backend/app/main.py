import os
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

# Load .env from the webapp directory (two levels up from this file)
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text as _sql
from sqlalchemy.orm import Session

from . import models, schemas, local_llm, document_prep
from .database import Base, engine, SessionLocal, get_db

Base.metadata.create_all(bind=engine)

app = FastAPI(title="HDFC custom LLM pipeline — control plane")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    """On every server start:
    1. Schema migration: add content_hash column to document_chunks if missing
       (SQLite ALTER TABLE is safe to run on existing DBs — ignored if present).
    2. Mark any runs/evals that were mid-flight when the server last stopped
       as failed — their background threads died with the process and will
       never finish. This prevents them from being stuck in "building" forever.
    3. Kick off a background model preload so the first inference or eval
       call doesn't block on a cold model load.
    """
    with engine.connect() as conn:
        try:
            conn.execute(_sql("ALTER TABLE document_chunks ADD COLUMN content_hash VARCHAR"))
            conn.commit()
        except Exception:
            pass  # column already exists — safe to ignore

        try:
            conn.execute(_sql("ALTER TABLE employees ADD COLUMN password VARCHAR DEFAULT 'Hdfc@2026'"))
            conn.commit()
        except Exception:
            pass  # column already exists — safe to ignore

    db = SessionLocal()
    try:
        stale_runs = db.query(models.Run).filter(models.Run.status.in_(["building", "queued"])).all()
        for run in stale_runs:
            run.status = "failed"
            run.error = "Server restarted while this build was in progress — re-trigger the run."
        stale_evals = db.query(models.Evaluation).filter(models.Evaluation.status.in_(["running", "queued"])).all()
        for ev in stale_evals:
            ev.status = "failed"
            ev.error = "Server restarted while this evaluation was in progress — re-trigger the evaluation."
        db.commit()

        # Seed authorized HDFC employee directory if table is empty
        if db.query(models.Employee).count() == 0:
            initial_emps = [
                {"employee_id": "HDFC-AI-101", "full_name": "Abhi", "email": "jarvisanand85@gmail.com", "role": "Lead AI Engineer", "department": "AI & Machine Learning"},
                {"employee_id": "HDFC-AI-102", "full_name": "Senior AI Architect", "email": "ai-arch@hdfcbank.com", "role": "Senior AI Systems Architect", "department": "AI & Machine Learning"},
                {"employee_id": "HDFC-AI-103", "full_name": "RAG Alignment Specialist", "email": "rag-eval@hdfcbank.com", "role": "RAG & LLM Alignment Specialist", "department": "AI & Machine Learning"},
                {"employee_id": "HDFC-AI-104", "full_name": "MLOps Infrastructure Lead", "email": "mlops@hdfcbank.com", "role": "MLOps Infrastructure Lead", "department": "AI & Machine Learning"},
                {"employee_id": "HDFC-AI-105", "full_name": "NLP Data Scientist", "email": "nlp@hdfcbank.com", "role": "NLP Data Scientist", "department": "AI & Machine Learning"},

                {"employee_id": "HDFC-EMP-4829", "full_name": "Senior Ops Manager", "email": "ops-lead@hdfcbank.com", "role": "Senior Banking Operations Manager", "department": "Banking Operations"},
                {"employee_id": "HDFC-EMP-4830", "full_name": "Branch Executive", "email": "branch-ops@hdfcbank.com", "role": "Branch Operations Executive", "department": "Banking Operations"},
                {"employee_id": "HDFC-EMP-5101", "full_name": "Personal Banking Officer", "email": "loans@hdfcbank.com", "role": "Personal Banking & Loans Officer", "department": "Banking Operations"},
                {"employee_id": "HDFC-EMP-5102", "full_name": "Savings & FD Specialist", "email": "savings@hdfcbank.com", "role": "Fixed Deposit & Savings Specialist", "department": "Banking Operations"},
                {"employee_id": "HDFC-EMP-5103", "full_name": "Corporate Relationship Lead", "email": "corporate@hdfcbank.com", "role": "Corporate Banking Relationship Manager", "department": "Banking Operations"},

                {"employee_id": "HDFC-GOV-9901", "full_name": "Chief Compliance Officer", "email": "compliance@hdfcbank.com", "role": "Chief Risk & Compliance Officer", "department": "Governance & Compliance"},
                {"employee_id": "HDFC-GOV-9902", "full_name": "Nodal Grievance Officer", "email": "nodal-officer@hdfcbank.com", "role": "Nodal Grievance Redressal Officer", "department": "Governance & Compliance"},
                {"employee_id": "HDFC-GOV-9903", "full_name": "Regulatory Auditor", "email": "audit@hdfcbank.com", "role": "Financial Regulatory Nodal Auditor", "department": "Governance & Compliance"},
                {"employee_id": "HDFC-GOV-9904", "full_name": "Data Privacy Officer", "email": "privacy@hdfcbank.com", "role": "Data Privacy & Compliance Officer", "department": "Governance & Compliance"},

                {"employee_id": "HDFC-SEC-7701", "full_name": "Fraud Investigation Lead", "email": "fraud-prevent@hdfcbank.com", "role": "Senior Fraud Investigation Specialist", "department": "Cybersecurity & Fraud"},
                {"employee_id": "HDFC-SEC-7702", "full_name": "InfoSec Access Officer", "email": "infosec@hdfcbank.com", "role": "Information Security & Access Control Lead", "department": "Cybersecurity & Fraud"},
                {"employee_id": "HDFC-SEC-7703", "full_name": "AML Analyst", "email": "aml@hdfcbank.com", "role": "Anti-Money Laundering (AML) Analyst", "department": "Cybersecurity & Fraud"},

                {"employee_id": "HDFC-DEV-3301", "full_name": "Core Pipeline Developer", "email": "pipeline-dev@hdfcbank.com", "role": "Core Pipeline Integration Developer", "department": "Enterprise IT"},
                {"employee_id": "HDFC-DEV-3302", "full_name": "Cloud Platform Engineer", "email": "cloud-ops@hdfcbank.com", "role": "Cloud Platform Infrastructure Engineer", "department": "Enterprise IT"},
                {"employee_id": "HDFC-DEV-3303", "full_name": "Full-Stack Engineer", "email": "fullstack@hdfcbank.com", "role": "Full-Stack Systems Engineer", "department": "Enterprise IT"},
            ]
            for emp in initial_emps:
                db.add(models.Employee(id=f"emp-{uuid.uuid4().hex[:8]}", **emp))
            db.commit()

        # Update existing lead record email to jarvisanand85@gmail.com
        lead_emp = db.query(models.Employee).filter(models.Employee.employee_id == "HDFC-AI-101").first()
        if lead_emp:
            lead_emp.email = "jarvisanand85@gmail.com"
            db.commit()
    finally:
        db.close()
    local_llm.preload_models_background()


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def dataset_record_count(db: Session, dataset_id: str) -> int:
    return db.query(models.DatasetRecord).filter(models.DatasetRecord.dataset_id == dataset_id).count()


def dataset_chunk_count(db: Session, dataset_id: str) -> int:
    return db.query(models.DocumentChunk).filter(models.DocumentChunk.dataset_id == dataset_id).count()


def ingest_pages(db: Session, dataset_id: str, filename: str, pages: list[tuple[int, str]]) -> dict:
    """Page-aware ingestion: PII redaction + semantic (sentence-boundary
    aware) chunking, keeping the page number of each chunk for citations.
    Skips chunks whose content_hash already exists in this dataset (dedup).
    Raises HTTPException 422 when the document has text but zero usable chunks."""
    _, pii_found_any = document_prep.redact_pii("\n".join(t for _, t in pages))
    chunk_dicts = document_prep.chunk_pages(pages)

    has_text = any(t.strip() for _, t in pages)
    if not chunk_dicts and has_text:
        raise HTTPException(
            422,
            "document extracted but produced no usable text chunks — "
            "check if it is a scanned/image-only PDF (needs OCR), "
            "or if the text is too short/garbled to pass quality filters.",
        )

    created = 0
    skipped = 0
    for c in chunk_dicts:
        content_hash = c.get("content_hash")
        if content_hash:
            exists = db.query(models.DocumentChunk).filter(
                models.DocumentChunk.dataset_id == dataset_id,
                models.DocumentChunk.content_hash == content_hash,
            ).first()
            if exists:
                skipped += 1
                continue
        db.add(models.DocumentChunk(
            id=new_id("chunk"),
            dataset_id=dataset_id,
            source_filename=filename,
            chunk_index=c["chunk_index"],
            page=c["page"],
            text=c["text"],
            content_hash=content_hash,
            pii_redacted=pii_found_any,
        ))
        created += 1
    db.commit()
    return {
        "filename": filename,
        "chunks_created": created,
        "duplicate_chunks_skipped": skipped,
        "pii_redacted": pii_found_any,
    }


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
    fname_lower = file.filename.lower()
    if not (fname_lower.endswith(".pdf") or fname_lower.endswith(".docx")):
        raise HTTPException(400, "only .pdf and .docx files are accepted here — use /upload-text for pasted text")

    file_bytes = await file.read()
    try:
        if fname_lower.endswith(".docx"):
            pages = document_prep.extract_docx_pages(file_bytes)
        else:
            pages = document_prep.extract_pdf_pages(file_bytes)
    except Exception as e:
        raise HTTPException(400, f"could not read document: {e}")
    if not any(t.strip() for _, t in pages):
        raise HTTPException(400, "no extractable text found in this document (PDF may be scanned/image-only, or DOCX is empty)")

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


@app.post("/api/runs/{run_id}/cancel")
def cancel_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(models.Run).filter(models.Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "run not found")
    if run.status not in ("building", "queued"):
        raise HTTPException(400, f"run is already {run.status} — nothing to cancel")
    local_llm.cancel_build(run_id)
    run.status = "failed"
    run.error = "Cancelled by user."
    db.commit()
    return {"cancelled": True, "run_id": run_id}


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


@app.post("/api/evaluations/{evaluation_id}/cancel")
def cancel_evaluation(evaluation_id: str, db: Session = Depends(get_db)):
    ev = db.query(models.Evaluation).filter(models.Evaluation.id == evaluation_id).first()
    if not ev:
        raise HTTPException(404, "evaluation not found")
    if ev.status not in ("running", "queued"):
        raise HTTPException(400, f"evaluation is already {ev.status} — nothing to cancel")
    local_llm.cancel_evaluation(evaluation_id)
    ev.status = "failed"
    ev.error = "Cancelled by user."
    db.commit()
    return {"cancelled": True, "evaluation_id": evaluation_id}


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
            out = local_llm.call_adapted_model(run, payload.prompt, max_tokens=250, _retrieval_k=3, _chunk_limit=500)
            answer = out["answer"]
            provider = out.get("provider", "unknown")
            served_by = (f"{dep.endpoint_name} ({dep.status}, {dep.traffic_pct}% traffic, "
                         f"adapter {run.adapter_hash}) via {provider}")
            retrieved_chunks = out["retrieved_chunks"]
            sources = out["sources"]
            citations = out["citations"]
            confidence = out["confidence"]
        else:
            answer, provider = local_llm.call_model(
                local_llm.DEFAULT_MODEL, local_llm.GENERIC_SYSTEM_PROMPT, payload.prompt, max_tokens=250
            )
            served_by = f"base model via {provider}"
    except HTTPException:
        raise
    except local_llm.ModelBusyError:
        return JSONResponse(
            {"error": "Model busy. Please retry in a few seconds."},
            status_code=503,
            headers={"Retry-After": "10"},
        )
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


# ----------------------------------------------------------------- employee auth & audit
@app.post("/api/auth/login", response_model=schemas.EmployeeOut)
def login_employee(payload: schemas.EmployeeLoginRequest, db: Session = Depends(get_db)):
    raw = payload.username_or_id.strip()
    raw_upper = raw.upper()

    # 1. Direct match on employee_id (case insensitive) or email (case insensitive)
    emp = db.query(models.Employee).filter(
        (models.Employee.employee_id == raw_upper) |
        (models.Employee.email.ilike(raw))
    ).first()

    if not emp:
        normalized = raw_upper
        if not normalized.startswith("HDFC-"):
            parts = raw_upper.replace("-", " ").split()
            if len(parts) == 2:
                normalized = f"HDFC-{parts[0]}-{parts[1]}"
            elif len(parts) == 1 and parts[0].isdigit():
                normalized = f"HDFC-AI-{parts[0]}"
            elif len(parts) == 1:
                normalized = f"HDFC-{parts[0]}"

        emp = db.query(models.Employee).filter(models.Employee.employee_id == normalized).first()

    if not emp:
        num_part = ''.join(filter(str.isdigit, raw))
        if num_part:
            emp = db.query(models.Employee).filter(models.Employee.employee_id.like(f"%{num_part}%")).first()

    if not emp:
        raise HTTPException(401, "Sign In Failed: Invalid Email / Employee ID or Password.")

    # Validate password against PostgreSQL database record
    if emp.password and emp.password != payload.password:
        raise HTTPException(401, "Sign In Failed: Incorrect password.")

    return emp


@app.post("/api/auth/register", response_model=schemas.EmployeeOut)
def register_employee(payload: schemas.EmployeeRegisterRequest, db: Session = Depends(get_db)):
    raw_id = payload.employee_id.strip().upper()
    if not raw_id.startswith("HDFC-"):
        parts = raw_id.replace("-", " ").split()
        if len(parts) == 2:
            raw_id = f"HDFC-{parts[0]}-{parts[1]}"

    emp = db.query(models.Employee).filter(models.Employee.employee_id == raw_id).first()
    if emp:
        emp.full_name = payload.full_name
        emp.email = payload.email
        emp.role = payload.role
        emp.password = payload.password
    else:
        emp = models.Employee(
            id=f"emp-{uuid.uuid4().hex[:8]}",
            employee_id=raw_id,
            full_name=payload.full_name,
            email=payload.email,
            role=payload.role,
            department="Enterprise AI",
            password=payload.password
        )
        db.add(emp)

    db.commit()
    db.refresh(emp)
    return emp


@app.post("/api/auth/reset-password", response_model=schemas.EmployeeOut)
def reset_password(payload: schemas.EmployeePasswordResetRequest, db: Session = Depends(get_db)):
    raw_id = payload.employee_id.strip().upper()
    
    emp = db.query(models.Employee).filter(
        (models.Employee.employee_id == raw_id) |
        (models.Employee.email.ilike(payload.email.strip()))
    ).first()

    if not emp:
        raise HTTPException(404, f"Employee ID '{payload.employee_id}' or email '{payload.email}' not found.")

    emp.password = payload.new_password
    if payload.email:
        emp.email = payload.email.strip()

    db.commit()
    db.refresh(emp)
    return emp


@app.post("/api/auth/verify-employee", response_model=schemas.EmployeeOut)
def verify_employee(payload: schemas.EmployeeVerifyRequest, db: Session = Depends(get_db)):
    raw = payload.employee_id.strip()
    raw_upper = raw.upper()

    emp = db.query(models.Employee).filter(
        (models.Employee.employee_id == raw_upper) |
        (models.Employee.email.ilike(raw))
    ).first()

    if not emp:
        raise HTTPException(404, f"Unauthorized personnel '{payload.employee_id}'. Access denied.")

    return emp


@app.get("/api/audit-logs", response_model=list[schemas.AuditLogOut])
def list_audit_logs(db: Session = Depends(get_db)):
    return db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(50).all()


@app.post("/api/audit-logs", response_model=schemas.AuditLogOut)
def create_audit_log(payload: schemas.AuditLogCreate, db: Session = Depends(get_db)):
    log = models.AuditLog(
        id=new_id("log"),
        employee_id=payload.employee_id,
        user_name=payload.user_name,
        action=payload.action,
        details=payload.details,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log



@app.get("/api/health")
def health():
    return local_llm.model_status()


# ---------------------------------------------------------------- frontend
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
