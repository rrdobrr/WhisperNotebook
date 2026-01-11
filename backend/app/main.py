from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import os
from pathlib import Path

from app.database import init_db, SessionLocal
from app.api import texts, chats, settings, costs, auth
from app.config import config
from app.services.auth_service import AuthService

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("temp", exist_ok=True)
    init_db()

    # Run database migrations
    try:
        from app.database import run_migrations
        run_migrations()
    except Exception as e:
        print(f"Warning: Migration failed: {e}")

    # Print demo mode status
    if config.is_demo_mode():
        print("\n" + "="*60)
        print("🎭 DEMO MODE ENABLED")
        print("="*60)
        print("✓ No API keys required")
        print("✓ No model downloads needed")
        print("✓ Mock responses for all services")
        print("✓ Perfect for testing the UI")
        print("\nTo disable demo mode: Set DEMO_MODE=false in environment variables")
        print("="*60 + "\n")
    else:
        # Auto-download Whisper model if not exists (only in non-demo mode)
        from app.api.settings import auto_download_model_on_startup
        import asyncio
        asyncio.create_task(auto_download_model_on_startup())

    # Print authentication status
    if AuthService.is_auth_enabled():
        print("\n" + "="*60)
        print("🔒 AUTHENTICATION ENABLED")
        print("="*60)
        print(f"✓ JWT expiration: {AuthService.get_jwt_expiration_days()} days")
        print("✓ All API endpoints are protected")
        print("\nUsers must login to access the application")
        print("="*60 + "\n")
    else:
        print("\n" + "="*60)
        print("⚠️  AUTHENTICATION DISABLED")
        print("="*60)
        print("⚠️  No AUTH_USERNAME or AUTH_PASSWORD set")
        print("⚠️  Application is publicly accessible")
        print("\nTo enable authentication:")
        print("  Set AUTH_USERNAME and AUTH_PASSWORD in environment")
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

# Authentication middleware
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """
    Middleware to protect API endpoints with JWT authentication.
    Exempts /health, /api/auth/*, and frontend routes.
    """
    path = request.url.path

    # Exempt paths that don't require authentication
    exempt_paths = [
        "/health",
        "/api/auth/login",
        "/api/auth/verify",
    ]

    # Allow all non-API routes (frontend)
    if not path.startswith("/api/"):
        return await call_next(request)

    # Allow exempt paths
    if path in exempt_paths:
        return await call_next(request)

    # If auth is not enabled, allow all requests
    if not AuthService.is_auth_enabled():
        return await call_next(request)

    # Extract token from Authorization header
    auth_header = request.headers.get("Authorization")

    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header.replace("Bearer ", "")

    # Verify token
    db = SessionLocal()
    try:
        username = AuthService.verify_token(token, db)

        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Add username to request state for use in endpoints
        request.state.username = username

    finally:
        db.close()

    return await call_next(request)

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(texts.router, prefix="/api/texts", tags=["Texts"])
app.include_router(chats.router, prefix="/api/chats", tags=["Chats"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(costs.router, prefix="/api/costs", tags=["Costs"])

# Health check
@app.get("/health")
async def health():
    return {"status": "healthy"}

# Serve static files from frontend build
frontend_dist = Path("/app/frontend/dist")
if frontend_dist.exists():
    # Mount static assets (js, css, images, etc.)
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    # Serve index.html for all non-API routes (SPA fallback)
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # If file exists in dist, serve it
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        # Otherwise serve index.html (for SPA routing)
        return FileResponse(frontend_dist / "index.html")
else:
    @app.get("/")
    async def root():
        return {"message": "WhisperTranscriber API", "status": "running", "note": "Frontend not built"}
