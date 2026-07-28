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
    assistant_name: Optional[str] = None
    classification: str = "internal"
    records: List[TaskRecordIn] = []


class DatasetOut(BaseModel):
    id: str
    owner_employee_id: Optional[str] = "HDFC-AI-101"
    name: str
    source: str
    purpose: str
    assistant_name: Optional[str] = None
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
    owner_employee_id: Optional[str] = "HDFC-AI-101"
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
    owner_employee_id: Optional[str] = "HDFC-AI-101"
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
    owner_employee_id: Optional[str] = "HDFC-AI-101"
    run_id: str
    evaluation_id: str
    version: str
    assistant_name: Optional[str] = None
    status: str
    model_card: Dict[str, Any]

    class Config:
        from_attributes = True


class DeploymentOut(BaseModel):
    id: str
    owner_employee_id: Optional[str] = "HDFC-AI-101"
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


class TempLoginRequest(BaseModel):
    username_or_email: str
    passcode: str


class TempPasscodeOut(BaseModel):
    id: str
    employee_id: str
    passcode: str
    status: str
    expires_in_minutes: int = 15
    expires_at: Any
    created_at: Any

    class Config:
        from_attributes = True


class UserSessionOut(BaseModel):
    id: str
    session_token: str
    employee_id: str
    login_type: str
    device_info: str
    ip_address: str
    status: str
    created_at: Any
    expires_at: Any

    class Config:
        from_attributes = True


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
    session_token: Optional[str] = None

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


class UserChatMessageIn(BaseModel):
    session_id: str
    assistant_name: Optional[str] = None
    model_id: Optional[str] = None
    message: str


class UserChatMessageOut(BaseModel):
    id: str
    user_id: str
    session_id: str
    assistant_name: Optional[str] = None
    model_id: Optional[str] = None
    sender: str
    message: str
    citations: List[str] = []
    created_at: Any

    class Config:
        from_attributes = True

