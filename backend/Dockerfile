FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY scripts ./scripts
ENV PYTHONPATH=/app/backend
CMD ["sh", "-c", "cd backend && alembic upgrade head && python -m app.ingest && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
