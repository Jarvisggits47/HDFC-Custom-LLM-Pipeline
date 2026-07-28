import os
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

# Load .env from the webapp directory (two levels up from this file)
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text as _sql
from sqlalchemy.orm import Session

from typing import Optional
from . import models, schemas, local_llm, document_prep
from .database import Base, engine, SessionLocal, get_db

Base.metadata.create_all(bind=engine)

app = FastAPI(title="HDFC custom LLM pipeline — control plane")

def get_emp_id_from_req(request: Request, db: Optional[Session] = None) -> str:
    session_token = request.headers.get("X-Session-Token")
    emp_id = request.headers.get("X-Employee-ID") or request.query_params.get("employee_id")

    if session_token and db:
        try:
            sess = db.query(models.UserSession).filter(models.UserSession.session_token == session_token).first()
            if sess and sess.status == "terminated":
                raise HTTPException(401, "Session has been terminated remotely by the account owner.")
        except HTTPException:
            raise
        except Exception:
            pass

    if not emp_id or emp_id in ("null", "undefined", ""):
        return "HDFC-AI-101"
    return emp_id.strip()

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
    1. Schema migration: add missing columns & create tables if missing.
    2. Mark stale mid-flight runs/evaluations as failed.
    3. Kick off background model preloading.
    """
    try:
        models.Base.metadata.create_all(bind=engine)
    except Exception as _e:
        print(f"Table creation note: {_e}")
    try:
        raw_conn = engine.raw_connection()
        raw_conn.autocommit = True
        cursor = raw_conn.cursor()
        for sql in [
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS password VARCHAR DEFAULT 'Hdfc@2026';",
            "ALTER TABLE employees ADD COLUMN password VARCHAR DEFAULT 'Hdfc@2026';",
            "ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS content_hash VARCHAR;",
            "ALTER TABLE document_chunks ADD COLUMN content_hash VARCHAR;",
            "ALTER TABLE datasets ADD COLUMN IF NOT EXISTS assistant_name VARCHAR;",
            "ALTER TABLE datasets ADD COLUMN assistant_name VARCHAR;",
            "ALTER TABLE model_registry ADD COLUMN IF NOT EXISTS assistant_name VARCHAR;",
            "ALTER TABLE model_registry ADD COLUMN assistant_name VARCHAR;"
        ]:
            try: cursor.execute(sql)
            except Exception: pass
        cursor.close()
        raw_conn.close()
    except Exception as e:
        print(f"Startup DDL migration note: {e}")

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
        try:
            emp_count = db.execute(_sql("SELECT count(*) FROM employees")).scalar() or 0
        except Exception:
            emp_count = 0

        if emp_count == 0:
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

        # Auto-seed initial HDFC Bank Policy dataset if datasets table is empty
        if db.query(models.Dataset).count() == 0:
            default_ds = models.Dataset(
                id=new_id("ds"),
                owner_employee_id="HDFC-AI-101",
                name="HDFC Bank Comprehensive Policy Portal v3.1",
                assistant_name="HDFC Loan & Policy Specialist AI",
                source="HDFC Intranet Policy Repository Q2-2026",
                purpose="Grounded Q&A, loan eligibility, KYC, FD rules, and compliance guidance.",
                status="approved",
                classification="internal"
            )
            db.add(default_ds)
            db.commit()
            db.refresh(default_ds)

            default_text = """HDFC Bank Fixed Deposit Policy 2026: Premature withdrawal of fixed deposits is subject to a 1.0% penalty on the applicable interest rate.
HDFC Bank Savings Account Policy 2026: Regular savings accounts require a minimum average monthly balance of INR 10,000 in metro branches and INR 5,000 in semi-urban branches.
HDFC Personal Loan Policy 2026: Personal loan interest rates range from 10.50% to 15.00% p.a. for salaried professionals with a credit score above 750.
HDFC UPI & Digital Security 2026: Unrecognized digital transactions must be reported within 3 days for zero liability protection under RBI guidelines."""
            ingest_document(db, default_ds.id, "HDFC_Master_Policy_2026.pdf", default_text)
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
def create_dataset(request: Request, payload: schemas.DatasetCreate, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request)
    assistant_title = (payload.assistant_name.strip() if payload.assistant_name and payload.assistant_name.strip() else f"{payload.name} AI")
    ds = models.Dataset(
        id=new_id("ds"),
        owner_employee_id=emp_id,
        name=payload.name,
        source=payload.source,
        purpose=payload.purpose,
        assistant_name=assistant_title,
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
def list_datasets(request: Request, db: Session = Depends(get_db)):
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
def create_run(request: Request, payload: schemas.RunCreate, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request)
    ds = db.query(models.Dataset).filter(models.Dataset.id == payload.dataset_id).first()
    if not ds:
        raise HTTPException(404, "dataset not found")
    if ds.status != "approved":
        raise HTTPException(400, "dataset must be approved before it can be used in a run")
    run = models.Run(
        id=new_id("run"),
        owner_employee_id=emp_id,
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
def list_runs(request: Request, db: Session = Depends(get_db)):
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
def create_evaluation(request: Request, payload: schemas.EvaluationCreate, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request)
    run = db.query(models.Run).filter(models.Run.id == payload.run_id).first()
    if not run:
        raise HTTPException(404, "run not found")
    if run.status != "completed":
        raise HTTPException(400, "run must complete before it can be evaluated")
    ev = models.Evaluation(id=new_id("eval"), owner_employee_id=emp_id, run_id=run.id, status="queued", progress=0)
    db.add(ev)
    db.commit()
    db.refresh(ev)

    local_llm.start_evaluation(ev.id, SessionLocal)
    return ev


@app.get("/api/evaluations", response_model=list[schemas.EvaluationOut])
def list_evaluations(request: Request, db: Session = Depends(get_db)):
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
def register_model(request: Request, payload: schemas.RegistryCreate, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request)
    run = db.query(models.Run).filter(models.Run.id == payload.run_id).first()
    ev = db.query(models.Evaluation).filter(models.Evaluation.id == payload.evaluation_id).first()
    if not run or not ev:
        raise HTTPException(404, "run or evaluation not found")
    if ev.run_id != run.id:
        raise HTTPException(400, "evaluation does not belong to this run")
    if ev.status != "completed":
        raise HTTPException(400, "evaluation has not completed yet")

    ds = db.query(models.Dataset).filter(models.Dataset.id == run.dataset_id).first()
    asst_name = (ds.assistant_name if ds and ds.assistant_name else f"HDFC Bank AI ({version})")

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
        owner_employee_id=emp_id,
        run_id=run.id,
        evaluation_id=ev.id,
        version=version,
        assistant_name=asst_name,
        status="registered",
        model_card=model_card,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.get("/api/registry", response_model=list[schemas.RegistryOut])
def list_registry(request: Request, db: Session = Depends(get_db)):
    return db.query(models.ModelRegistryEntry).order_by(models.ModelRegistryEntry.created_at.desc()).all()


@app.post("/api/registry/{model_id}/promote", response_model=schemas.DeploymentOut)
def promote_model(request: Request, model_id: str, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request)
    entry = db.query(models.ModelRegistryEntry).filter(models.ModelRegistryEntry.id == model_id).first()
    if not entry:
        raise HTTPException(404, "model not found")
    if not entry.model_card.get("gate_pass"):
        raise HTTPException(400, "cannot promote: evaluation gate did not pass (critical failure present)")

    entry.status = "promoted"
    db.commit()

    deployment = models.Deployment(
        id=new_id("dep"),
        owner_employee_id=emp_id,
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
def list_deployments(request: Request, db: Session = Depends(get_db)):
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
def infer(request: Request, payload: schemas.InferenceRequest, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request)
    served_by = "base model (no active deployment, no banking context)"
    retrieved_chunks: list[str] = []
    sources: list[str] = []
    citations: list[str] = []
    confidence = 0.0

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
        owner_employee_id=emp_id,
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


@app.get("/api/user/assistants")
def get_user_assistants(db: Session = Depends(get_db)):
    models_list = db.query(models.ModelRegistryEntry).all()
    results = []
    for m in models_list:
        run = db.query(models.Run).filter(models.Run.id == m.run_id).first()
        ds = db.query(models.Dataset).filter(models.Dataset.id == run.dataset_id).first() if run else None
        asst_title = m.assistant_name or (ds.assistant_name if ds else None) or (ds.name if ds else "HDFC Banking Assistant")
        results.append({
            "model_id": m.id,
            "version": m.version,
            "assistant_name": asst_title,
            "status": m.status,
            "dataset_name": ds.name if ds else "HDFC Policy Dataset"
        })
    if not results:
        results.append({
            "model_id": "default-banking-llm",
            "version": "v1.0",
            "assistant_name": "HDFC Official AI Banking Assistant",
            "status": "active",
            "dataset_name": "HDFC Core Policy"
        })
    return results


@app.get("/api/user/chat-sessions")
def get_user_chat_sessions(request: Request, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request)
    msgs = db.query(models.UserChatMessage).filter(
        models.UserChatMessage.user_id == emp_id
    ).order_by(models.UserChatMessage.created_at.desc()).all()

    sessions = {}
    for m in msgs:
        if m.session_id not in sessions:
            sessions[m.session_id] = {
                "session_id": m.session_id,
                "assistant_name": m.assistant_name or "HDFC Banking Assistant",
                "last_message": m.message[:60] + ("…" if len(m.message) > 60 else ""),
                "created_at": m.created_at.isoformat()
            }
    return list(sessions.values())


@app.get("/api/user/chat-history/{session_id}")
def get_user_chat_history(session_id: str, request: Request, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request)
    msgs = db.query(models.UserChatMessage).filter(
        models.UserChatMessage.user_id == emp_id,
        models.UserChatMessage.session_id == session_id
    ).order_by(models.UserChatMessage.created_at.asc()).all()
    return msgs


@app.post("/api/user/chat")
def user_chat_inference(request: Request, payload: schemas.UserChatMessageIn, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request)
    start = time.time()

    user_msg = models.UserChatMessage(
        id=new_id("umsg"),
        user_id=emp_id,
        session_id=payload.session_id,
        assistant_name=payload.assistant_name,
        model_id=payload.model_id,
        sender="user",
        message=payload.message
    )
    db.add(user_msg)
    db.commit()

    guard = guardrails.check_prompt(payload.message)
    if guard["blocked"]:
        ans = f"⚠️ [GUARDRAIL BLOCK] Query blocked under safety policy ({guard['category']})."
        citations = []
    else:
        dep = db.query(models.Deployment).filter(models.Deployment.status == "active").first()
        dep_id = dep.id if dep else None
        inf_req = schemas.InferenceRequest(deployment_id=dep_id, prompt=payload.message)
        inf_res = predict(request, inf_req, db)
        ans = inf_res.answer
        citations = inf_res.citations

    asst_msg = models.UserChatMessage(
        id=new_id("amsg"),
        user_id=emp_id,
        session_id=payload.session_id,
        assistant_name=payload.assistant_name,
        model_id=payload.model_id,
        sender="assistant",
        message=ans,
        citations=citations
    )
    db.add(asst_msg)
    db.commit()

    return {
        "user_message": payload.message,
        "answer": ans,
        "citations": citations,
        "session_id": payload.session_id
    }


@app.get("/api/monitoring")
def monitoring(request: Request, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request)
    logs = db.query(models.InferenceLog).filter(
        models.InferenceLog.owner_employee_id == emp_id
    ).all()
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
@app.post("/api/auth/generate-temp-passcode", response_model=schemas.TempPasscodeOut)
def generate_temp_passcode(request: Request, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request, db)

    # Invalidate any previously active passcodes for this employee
    db.query(models.TempPasscode).filter(
        models.TempPasscode.employee_id == emp_id,
        models.TempPasscode.status == "active"
    ).update({"status": "revoked", "is_used": True})
    db.commit()

    passcode_str = f"TMP-{uuid.uuid4().hex[:6].upper()}"
    expires_at = datetime.utcnow() + timedelta(minutes=15)

    tp = models.TempPasscode(
        id=new_id("passcode"),
        employee_id=emp_id,
        passcode=passcode_str,
        status="active",
        is_used=False,
        expires_at=expires_at,
    )
    db.add(tp)

    log = models.AuditLog(
        id=new_id("log"),
        employee_id=emp_id,
        user_name="Security Control",
        action="TEMP_PASSCODE_GENERATED",
        details=f"Generated 15-min temporary passcode {passcode_str} for remote login",
    )
    db.add(log)
    db.commit()
    db.refresh(tp)

    out = schemas.TempPasscodeOut.model_validate(tp)
    out.expires_in_minutes = 15
    return out


@app.post("/api/auth/login-temp-passcode", response_model=schemas.EmployeeOut)
def login_temp_passcode(request: Request, payload: schemas.TempLoginRequest, db: Session = Depends(get_db)):
    raw = payload.username_or_email.strip()
    pass_code = payload.passcode.strip().upper()

    emp = db.query(models.Employee).filter(
        (models.Employee.employee_id == raw.upper()) |
        (models.Employee.email.ilike(raw))
    ).first()

    if not emp:
        raise HTTPException(401, f"Unauthorized personnel '{raw}'. Access denied.")

    tp = db.query(models.TempPasscode).filter(
        models.TempPasscode.employee_id == emp.employee_id,
        models.TempPasscode.passcode == pass_code,
        models.TempPasscode.is_used == False,
        models.TempPasscode.status == "active",
        models.TempPasscode.expires_at > datetime.utcnow(),
    ).first()

    if not tp:
        any_tp = db.query(models.TempPasscode).filter(
            models.TempPasscode.employee_id == emp.employee_id,
            models.TempPasscode.passcode == pass_code,
        ).first()

        if any_tp:
            if any_tp.is_used or any_tp.status == "used":
                raise HTTPException(401, "This temporary passcode has already been used. Please generate a new passcode from your main profile to log in.")
            elif any_tp.status == "revoked":
                raise HTTPException(401, "This temporary passcode was revoked because a new passcode was generated. Please generate a new passcode from your main profile to log in.")
            elif any_tp.expires_at <= datetime.utcnow():
                raise HTTPException(401, "This temporary passcode has expired (15-minute limit reached). Please generate a new passcode from your main profile to log in.")

        raise HTTPException(401, "Invalid temporary passcode. Please generate a new passcode from your main profile to log in.")

    tp.is_used = True
    tp.status = "used"

    session_token = f"sess-{uuid.uuid4().hex}"
    user_agent = request.headers.get("User-Agent") or "Mobile / Secondary Device"
    client_ip = request.client.host if request.client else "127.0.0.1"

    sess = models.UserSession(
        id=new_id("sess"),
        session_token=session_token,
        employee_id=emp.employee_id,
        login_type="temp_passcode",
        device_info=user_agent[:120],
        ip_address=client_ip,
        status="active",
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(sess)

    log = models.AuditLog(
        id=new_id("log"),
        employee_id=emp.employee_id,
        user_name=emp.full_name,
        action="TEMP_PASSCODE_LOGIN",
        details=f"Logged in via temporary passcode {pass_code} on {user_agent[:60]}",
    )
    db.add(log)
    db.commit()

    out = schemas.EmployeeOut.model_validate(emp)
    out.session_token = session_token
    return out


@app.get("/api/auth/latest-temp-passcode")
def get_latest_temp_passcode(request: Request, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request, db)
    tp = db.query(models.TempPasscode).filter(
        models.TempPasscode.employee_id == emp_id
    ).order_by(models.TempPasscode.created_at.desc()).first()

    if not tp:
        return {"has_passcode": False}

    is_expired = tp.expires_at <= datetime.utcnow()
    status = "expired" if is_expired else ("used" if tp.is_used else tp.status)
    remaining_sec = max(0, int((tp.expires_at - datetime.utcnow()).total_seconds())) if (not is_expired and status == "active") else 0

    return {
        "has_passcode": True,
        "passcode": tp.passcode,
        "status": status,
        "is_used": tp.is_used,
        "expires_in_seconds": remaining_sec,
        "created_at": tp.created_at.isoformat()
    }


@app.get("/api/auth/active-sessions", response_model=list[schemas.UserSessionOut])
def list_active_sessions(request: Request, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request, db)
    sessions = db.query(models.UserSession).filter(
        models.UserSession.employee_id == emp_id,
        models.UserSession.status == "active",
        models.UserSession.expires_at > datetime.utcnow(),
    ).order_by(models.UserSession.created_at.desc()).all()
    return sessions


@app.get("/api/auth/terminated-sessions", response_model=list[schemas.UserSessionOut])
def list_terminated_sessions(request: Request, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request, db)
    sessions = db.query(models.UserSession).filter(
        models.UserSession.employee_id == emp_id,
        models.UserSession.status == "terminated",
    ).order_by(models.UserSession.created_at.desc()).limit(5).all()
    return sessions


@app.post("/api/auth/terminate-session/{session_id}")
def terminate_session(request: Request, session_id: str, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request, db)
    sess = db.query(models.UserSession).filter(
        models.UserSession.id == session_id,
        models.UserSession.employee_id == emp_id
    ).first()

    if not sess:
        raise HTTPException(404, "Session not found or not owned by user.")

    if sess.login_type == "master":
        raise HTTPException(400, "Primary Master Account session cannot be terminated. Only secondary temp passcode sessions can be killed.")

    sess.status = "terminated"

    emp = db.query(models.Employee).filter(models.Employee.employee_id == emp_id).first()
    user_name = emp.full_name if emp else emp_id

    log = models.AuditLog(
        id=new_id("log"),
        employee_id=emp_id,
        user_name=user_name,
        action="SESSION_TERMINATED_REMOTELY",
        details=f"Master account remotely killed secondary session ({sess.device_info})",
    )
    db.add(log)
    db.commit()
    return {"terminated": True, "session_id": session_id}


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

    session_token = f"sess-{uuid.uuid4().hex}"
    sess = models.UserSession(
        id=new_id("sess"),
        session_token=session_token,
        employee_id=emp.employee_id,
        login_type="master",
        device_info="Master Password Login",
        status="active",
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db.add(sess)
    db.commit()

    out = schemas.EmployeeOut.model_validate(emp)
    out.session_token = session_token
    return out


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
def list_audit_logs(request: Request, db: Session = Depends(get_db)):
    emp_id = get_emp_id_from_req(request)
    return db.query(models.AuditLog).filter(
        models.AuditLog.employee_id == emp_id
    ).order_by(models.AuditLog.created_at.desc()).limit(50).all()


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
