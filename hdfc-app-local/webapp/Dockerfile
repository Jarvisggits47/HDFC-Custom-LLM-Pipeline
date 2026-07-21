FROM python:3.11-slim

WORKDIR /srv

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY frontend ./frontend

ENV PIPELINE_DB_PATH=/srv/data/pipeline.db
RUN mkdir -p /srv/data

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "/srv"]
