from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

from app.database import init_db
from app.api import texts, chats, settings, costs
from app.config import config

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("temp", exist_ok=True)
    init_db()

    # Print demo mode status
    if config.is_demo_mode():
        print("\n" + "="*60)
        print("🎭 DEMO MODE ENABLED")
        print("="*60)
        print("✓ No API keys required")
        print("✓ No model downloads needed")
        print("✓ Mock responses for all services")
        print("✓ Perfect for testing the UI")
        print("\nTo disable demo mode: Set DEMO_MODE=false in .env")
        print("="*60 + "\n")

    yield
    # Shutdown

app = FastAPI(
    title="WhisperTranscriber API" + (" [DEMO MODE]" if config.is_demo_mode() else ""),
    description="Audio/Video transcription service with AI chat",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(texts.router, prefix="/api/texts", tags=["Texts"])
app.include_router(chats.router, prefix="/api/chats", tags=["Chats"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(costs.router, prefix="/api/costs", tags=["Costs"])

@app.get("/")
async def root():
    return {"message": "WhisperTranscriber API", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
