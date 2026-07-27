import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON, Boolean, ForeignKey
from .database import Base


def now():
    return datetime.datetime.utcnow()


class Dataset(Base):
    __tablename__ = "datasets"
    id = Column(String, primary_key=True)
    owner_employee_id = Column(String, default="HDFC-AI-101", index=True)
    name = Column(String, nullable=False)
    source = Column(String, nullable=False)
    purpose = Column(String, nullable=False)
    classification = Column(String, default="internal")
    status = Column(String, default="registered")  # registered -> approved
    created_at = Column(DateTime, default=now)


class DatasetRecord(Base):
    """A single real task record belonging to a dataset — this is the actual
    content used to build the context adapter, not just metadata."""
    __tablename__ = "dataset_records"
    id = Column(String, primary_key=True)
    dataset_id = Column(String, ForeignKey("datasets.id"))
    task_type = Column(String, nullable=False)
    instruction = Column(String, nullable=False)
    context = Column(JSON, default=list)   # list of {doc_id, effective_date, text}
    response = Column(String, nullable=False)
    citations = Column(JSON, default=list)
    refusal_required = Column(Boolean, default=False)
    escalation_required = Column(Boolean, default=False)


class DocumentChunk(Base):
    """A chunk of a real uploaded policy document (PDF or pasted text),
    used for live retrieval at inference time — this is the actual RAG
    layer, not everything stuffed statically into one system prompt."""
    __tablename__ = "document_chunks"
    id = Column(String, primary_key=True)
    dataset_id = Column(String, ForeignKey("datasets.id"))
    owner_employee_id = Column(String, default="HDFC-AI-101", index=True)
    source_filename = Column(String, nullable=False)
    chunk_index = Column(Integer, default=0)
    page = Column(Integer, default=1)
    text = Column(String, nullable=False)
    content_hash = Column(String, nullable=True, index=True)  # sha256[:32] of chunk text for dedup
    pii_redacted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=now)

    @property
    def chunk_id(self) -> str:
        return f"{self.source_filename}#p{self.page}-{self.chunk_index}"


class Run(Base):
    """A context-adapter build: assembles the approved dataset's records into
    a system prompt used for live Claude API calls. Not weight fine-tuning —
    see webapp/README.md for why, and for the real-LoRA swap-in path."""
    __tablename__ = "runs"
    id = Column(String, primary_key=True)
    owner_employee_id = Column(String, default="HDFC-AI-101", index=True)
    name = Column(String, nullable=False)
    serving_model = Column(String, nullable=False)  # e.g. HuggingFaceTB/SmolLM2-360M-Instruct
    embedding_model = Column(String, default="BAAI/bge-small-en-v1.5")
    dataset_id = Column(String, ForeignKey("datasets.id"))
    status = Column(String, default="queued")  # queued -> building -> completed / failed
    progress = Column(Integer, default=0)
    build_steps = Column(JSON, default=list)  # list of {step, label, detail}
    system_prompt = Column(String, nullable=True)
    adapter_hash = Column(String, nullable=True)
    record_count_used = Column(Integer, default=0)
    chunk_count_used = Column(Integer, default=0)
    retriever_path = Column(String, nullable=True)
    error = Column(String, nullable=True)
    created_at = Column(DateTime, default=now)


class Evaluation(Base):
    """Live evaluation: makes real API calls (base vs adapted) for each
    fixture case and scores the actual generated text."""
    __tablename__ = "evaluations"
    id = Column(String, primary_key=True)
    owner_employee_id = Column(String, default="HDFC-AI-101", index=True)
    run_id = Column(String, ForeignKey("runs.id"))
    status = Column(String, default="queued")  # queued -> running -> completed / failed
    progress = Column(Integer, default=0)
    results = Column(JSON, default=dict)
    gate_pass = Column(Boolean, nullable=True)
    critical_failures = Column(JSON, default=list)
    error = Column(String, nullable=True)
    created_at = Column(DateTime, default=now)


class ModelRegistryEntry(Base):
    __tablename__ = "model_registry"
    id = Column(String, primary_key=True)
    owner_employee_id = Column(String, default="HDFC-AI-101", index=True)
    run_id = Column(String, ForeignKey("runs.id"))
    evaluation_id = Column(String, ForeignKey("evaluations.id"))
    version = Column(String, nullable=False)
    status = Column(String, default="registered")  # registered -> promoted -> decommissioned
    model_card = Column(JSON, default=dict)
    created_at = Column(DateTime, default=now)


class Deployment(Base):
    __tablename__ = "deployments"
    id = Column(String, primary_key=True)
    owner_employee_id = Column(String, default="HDFC-AI-101", index=True)
    model_id = Column(String, ForeignKey("model_registry.id"))
    endpoint_name = Column(String, nullable=False)
    status = Column(String, default="canary")  # canary -> active -> rolled_back
    traffic_pct = Column(Integer, default=10)
    created_at = Column(DateTime, default=now)


class InferenceLog(Base):
    __tablename__ = "inference_log"
    id = Column(String, primary_key=True)
    owner_employee_id = Column(String, default="HDFC-AI-101", index=True)
    deployment_id = Column(String, ForeignKey("deployments.id"), nullable=True)
    prompt = Column(String)
    response = Column(String)
    escalation_required = Column(Boolean, default=False)
    guardrail_category = Column(String, default="general")
    confidence = Column(Integer, default=0)  # 0-100
    latency_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=now)


class Employee(Base):
    __tablename__ = "employees"
    id = Column(String, primary_key=True)
    employee_id = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    role = Column(String, nullable=False)
    department = Column(String, nullable=False)
    password = Column(String, nullable=False, default="Hdfc@2026")
    created_at = Column(DateTime, default=now)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(String, primary_key=True)
    employee_id = Column(String, nullable=False)
    user_name = Column(String, nullable=False)
    action = Column(String, nullable=False)
    details = Column(String, nullable=False)
    created_at = Column(DateTime, default=now)

