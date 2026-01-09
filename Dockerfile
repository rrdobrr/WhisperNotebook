# Multi-stage build for production

# Backend stage
FROM python:3.12-slim as backend

WORKDIR /app/backend

# Install system dependencies including ffmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Frontend stage
FROM node:20-alpine as frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ .
RUN npm run build

# Final stage
FROM python:3.12-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy backend
COPY --from=backend /app/backend /app/backend
COPY --from=backend /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages

# Copy frontend build
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Create necessary directories
RUN mkdir -p /app/uploads /app/temp /app/data /app/data/models

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL=sqlite:////app/data/whispertranscriber.db
ENV TRANSFORMERS_CACHE=/app/data/models
ENV HF_HOME=/app/data/models

EXPOSE 8000

# Start backend
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
