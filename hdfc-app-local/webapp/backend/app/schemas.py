from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class TaskRecordIn(BaseModel):
    task_type: str
    instruction: str
    response: str
    context: List[Dict[str, Any]] = []
    citations: List[str] = []
    refusal_required: bool = False
    escalation_required: bool = False


class TaskRecordOut(TaskRecordIn):
    id: str

    class Config:
        from_attributes = True


class DatasetCreate(BaseModel):
    name: str
    source: str
    purpose: str
    classification: str = "internal"
    records: List[TaskRecordIn] = []


class DatasetOut(BaseModel):
    id: str
    name: str
    source: str
    purpose: str
    classification: str
    status: str
    record_count: int = 0
    chunk_count: int = 0

    class Config:
        from_attributes = True


class RunCreate(BaseModel):
    name: str
    serving_model: str = "Qwen/Qwen2.5-0.5B-Instruct"
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    dataset_id: str


class RunOut(BaseModel):
    id: str
    name: str
    serving_model: str
    embedding_model: str
    dataset_id: str
    status: str
    progress: int
    build_steps: List[Dict[str, Any]] = []
    adapter_hash: Optional[str] = None
    record_count_used: int = 0
    chunk_count_used: int = 0
    error: Optional[str] = None

    class Config:
        from_attributes = True


class EvaluationCreate(BaseModel):
    run_id: str


class EvaluationOut(BaseModel):
    id: str
    run_id: str
    status: str
    progress: int
    results: Dict[str, Any] = {}
    gate_pass: Optional[bool] = None
    critical_failures: List[str] = []
    error: Optional[str] = None

    class Config:
        from_attributes = True


class RegistryCreate(BaseModel):
    run_id: str
    evaluation_id: str
    owner: str = "unassigned"


class RegistryOut(BaseModel):
    id: str
    run_id: str
    evaluation_id: str
    version: str
    status: str
    model_card: Dict[str, Any]

    class Config:
        from_attributes = True


class DeploymentOut(BaseModel):
    id: str
    model_id: str
    endpoint_name: str
    status: str
    traffic_pct: int

    class Config:
        from_attributes = True


class InferenceRequest(BaseModel):
    deployment_id: Optional[str] = None
    prompt: str


class InferenceResponse(BaseModel):
    answer: str
    escalation_required: bool
    served_by: str
    latency_ms: int
    retrieved_chunks: List[str] = []
    sources: List[str] = []
    citations: List[str] = []
    confidence: float = 0.0
    guardrail_category: str = "general"
    guardrail_blocked: bool = False


class EmployeeVerifyRequest(BaseModel):
    employee_id: str


class EmployeeLoginRequest(BaseModel):
    username_or_id: str
    password: str


class EmployeeRegisterRequest(BaseModel):
    employee_id: str
    full_name: str
    email: str
    role: str
    password: str


class EmployeePasswordResetRequest(BaseModel):
    employee_id: str
    email: str
    new_password: str


class EmployeeOut(BaseModel):
    id: str
    employee_id: str
    full_name: str
    email: str
    role: str
    department: str

    class Config:
        from_attributes = True


class AuditLogCreate(BaseModel):
    employee_id: str
    user_name: str
    action: str
    details: str


class AuditLogOut(BaseModel):
    id: str
    employee_id: str
    user_name: str
    action: str
    details: str
    created_at: Any

    class Config:
        from_attributes = True

