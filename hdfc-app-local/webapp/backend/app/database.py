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

# Auto-migrate missing columns for existing PostgreSQL / SQLite tables on module import
try:
    from sqlalchemy import text as _mig_text
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        try:
            conn.execute(_mig_text("ALTER TABLE employees ADD COLUMN password VARCHAR DEFAULT 'Hdfc@2026';"))
        except Exception:
            pass
        try:
            conn.execute(_mig_text("ALTER TABLE document_chunks ADD COLUMN content_hash VARCHAR;"))
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
