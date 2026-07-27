# 🏦 HDFC Custom LLM Pipeline — Enterprise AI Factory & RAG Infrastructure

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-0056b3?style=for-the-badge&logo=github)](https://jarvisggits47.github.io/HDFC-Custom-LLM-Pipeline/)
[![Backend API](https://img.shields.io/badge/Backend%20API-Render%20Cloud-00c7b7?style=for-the-badge&logo=render)](https://hdfc-custom-llm-backend.onrender.com/api/health)
[![Database](https://img.shields.io/badge/Database-PostgreSQL-336791?style=for-the-badge&logo=postgresql)](https://dashboard.render.com/)
[![License](https://img.shields.io/badge/Compliance-HDFC%20Enterprise-green?style=for-the-badge)](https://github.com/Jarvisggits47/HDFC-Custom-LLM-Pipeline)

An enterprise-grade, memory-protected Artificial Intelligence platform built for **HDFC Bank**. It provides a 0-to-end pipeline for ingesting policy documents (PDF/DOCX/TXT), semantic vector indexing, context-adaptation prompt compilation, automated compliance Evaluation Gates, model registry governance cards, canary traffic deployments, and real-time grounded inference with **100% cloud database persistence**.

---

## 🌟 Key Features & Architectural Highlights

- ⚡ **Zero-OOM Cloud GPU Acceleration**: Powered by Hugging Face Serverless GPU API (`InferenceClient` via `together` provider, `Llama-3.3-70B-Instruct` & `Qwen2.5-Coder-32B-Instruct`) for high-speed (300ms) multi-step AI model responses with **0 MB local RAM overhead**.
- 🗄️ **Permanent PostgreSQL Cloud Database**: Connected to Render Managed PostgreSQL (`hdfc_db`). All datasets, uploaded PDF documents, vector retriever indices, adapter builds, evaluation gate reports, model cards, and deployments persist permanently across container restarts.
- 📑 **Page-Aware RAG & PII Redaction**: Automated semantic chunking preserving exact page numbers for citations, sha256 chunk deduplication, and automatic PII redaction (PAN cards, Aadhaar, phone numbers).
- 🛡️ **Automated Compliance Evaluation Gate**: 5 automated test fixtures for compliance verification (fraud escalation, investment disclosure, legal refusal, factual grounding) executed in **3 seconds** on cloud GPUs.
- 🚀 **Model Registry & Canary Rollout**: Governance model cards (Intended/Prohibited use), 10% canary traffic allocation to 100% production traffic, and 1-click instant rollback capability.
- 🔒 **HDFC Employee Verification & Audit Trail**: Database-backed employee ID verification (`HDFC-AI-101`, `HDFC-DEV-3301`), Division + Numeric Code password reset flow (`DEV 3301` / `AI 101`), and real-time dashboard activity logging.

---

## 📋 Authorized HDFC Employee ID Directory

| Division Code | Unique Employee ID | Assigned Name & Role | Department |
| :--- | :--- | :--- | :--- |
| `AI` | **`HDFC-AI-101`** | Abhi (Lead AI Engineer & Admin) | AI & Machine Learning |
| `AI` | **`HDFC-AI-102`** | Senior AI Systems Architect | AI & Machine Learning |
| `AI` | **`HDFC-AI-103`** | RAG & LLM Alignment Specialist | AI & Machine Learning |
| `EMP` | **`HDFC-EMP-4829`** | Senior Banking Operations Manager | Banking Operations |
| `EMP` | **`HDFC-EMP-4830`** | Branch Operations Executive | Banking Operations |
| `EMP` | **`HDFC-EMP-5102`** | Fixed Deposit & Savings Specialist | Banking Operations |
| `GOV` | **`HDFC-GOV-9901`** | Chief Risk & Compliance Officer | Governance & Compliance |
| `GOV` | **`HDFC-GOV-9902`** | Nodal Grievance Redressal Officer | Governance & Compliance |
| `SEC` | **`HDFC-SEC-7701`** | Senior Fraud Investigation Lead | Cybersecurity & Fraud |
| `SEC` | **`HDFC-SEC-7702`** | Information Security Lead | Cybersecurity & Fraud |
| `DEV` | **`HDFC-DEV-3301`** | Core Pipeline Integration Developer | Enterprise IT |
| `DEV` | **`HDFC-DEV-3302`** | Cloud Platform Operations Engineer | Enterprise IT |

---

## 🚀 Quick Start & Local Setup

### Prerequisites
- Python 3.11+
- Git

### Installation
```bash
# 1. Clone repository
git clone https://github.com/Jarvisggits47/HDFC-Custom-LLM-Pipeline.git
cd HDFC-Custom-LLM-Pipeline

# 2. Install backend dependencies
cd hdfc-app-local/webapp/backend
pip install -r requirements.txt

# 3. Start local Uvicorn server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Open your browser at `http://localhost:8000` or open `hdfc-app-local/webapp/frontend/index.html`.

---

## 🌐 Production URLs

- **Live Frontend Application**: [https://jarvisggits47.github.io/HDFC-Custom-LLM-Pipeline/](https://jarvisggits47.github.io/HDFC-Custom-LLM-Pipeline/)
- **Live Render Backend API**: [https://hdfc-custom-llm-backend.onrender.com](https://hdfc-custom-llm-backend.onrender.com)
- **API Health Endpoint**: [https://hdfc-custom-llm-backend.onrender.com/api/health](https://hdfc-custom-llm-backend.onrender.com/api/health)

---

## 📄 License & Compliance

Developed for **HDFC Bank Enterprise AI Engineering**. All rights reserved.
