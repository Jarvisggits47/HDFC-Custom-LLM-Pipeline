import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    DB_PATH = os.environ.get("PIPELINE_DB_PATH", "./pipeline.db")
    DATABASE_URL = f"sqlite:///{DB_PATH}"

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)

# Auto-migrate missing columns and tables for existing PostgreSQL / SQLite databases on module import
try:
    from sqlalchemy import text as _mig_text
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for tbl_sql in [
            "ALTER TABLE employees ADD COLUMN password VARCHAR DEFAULT 'Hdfc@2026';",
            "ALTER TABLE document_chunks ADD COLUMN content_hash VARCHAR;",
            "ALTER TABLE datasets ADD COLUMN assistant_name VARCHAR;",
            "ALTER TABLE model_registry ADD COLUMN assistant_name VARCHAR;",
            "ALTER TABLE datasets ADD COLUMN owner_employee_id VARCHAR DEFAULT 'HDFC-AI-101';",
            "ALTER TABLE document_chunks ADD COLUMN owner_employee_id VARCHAR DEFAULT 'HDFC-AI-101';",
            "ALTER TABLE runs ADD COLUMN owner_employee_id VARCHAR DEFAULT 'HDFC-AI-101';",
            "ALTER TABLE evaluations ADD COLUMN owner_employee_id VARCHAR DEFAULT 'HDFC-AI-101';",
            "ALTER TABLE model_registry ADD COLUMN owner_employee_id VARCHAR DEFAULT 'HDFC-AI-101';",
            "ALTER TABLE deployments ADD COLUMN owner_employee_id VARCHAR DEFAULT 'HDFC-AI-101';",
            "ALTER TABLE inference_log ADD COLUMN owner_employee_id VARCHAR DEFAULT 'HDFC-AI-101';",
            "CREATE TABLE IF NOT EXISTS temp_passcodes (id VARCHAR PRIMARY KEY, employee_id VARCHAR NOT NULL, passcode VARCHAR NOT NULL, status VARCHAR DEFAULT 'active', is_used BOOLEAN DEFAULT FALSE, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);",
            "CREATE TABLE IF NOT EXISTS user_sessions (id VARCHAR PRIMARY KEY, session_token VARCHAR UNIQUE NOT NULL, employee_id VARCHAR NOT NULL, login_type VARCHAR DEFAULT 'master', device_info VARCHAR DEFAULT 'Web Client', ip_address VARCHAR DEFAULT '127.0.0.1', status VARCHAR DEFAULT 'active', expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);",
            "CREATE TABLE IF NOT EXISTS user_chat_messages (id VARCHAR PRIMARY KEY, user_id VARCHAR NOT NULL, assistant_id VARCHAR, session_id VARCHAR NOT NULL, role VARCHAR NOT NULL, content TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"
        ]:
            try:
                conn.execute(_mig_text(tbl_sql))
            except Exception:
                pass
except Exception as _e:
    print(f"Database DDL migration note: {_e}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
