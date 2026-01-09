from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db, Settings
from app.models.schemas import SettingsResponse, SettingsUpdate
from app.services.encryption_service import encrypt_api_key, decrypt_api_key

router = APIRouter()

@router.get("/", response_model=SettingsResponse)
async def get_settings(db: Session = Depends(get_db)):
    """Get current settings"""
    settings = db.query(Settings).first()
    if not settings:
        # Create default settings
        settings = Settings()
        db.add(settings)
        db.commit()
        db.refresh(settings)

    # Don't return the full API key, just indicate if it's set
    response = SettingsResponse(
        id=settings.id,
        openai_api_key="***" if settings.openai_api_key else None,
        openai_api_key_set=bool(settings.openai_api_key),
        default_transcription_method=settings.default_transcription_method,
        default_language=settings.default_language,
        default_model=settings.default_model,
        theme=settings.theme,
        add_timestamps=settings.add_timestamps,
        updated_at=settings.updated_at
    )
    return response

@router.put("/", response_model=SettingsResponse)
async def update_settings(settings_data: SettingsUpdate, db: Session = Depends(get_db)):
    """Update settings"""
    settings = db.query(Settings).first()
    if not settings:
        settings = Settings()
        db.add(settings)

    if settings_data.openai_api_key is not None:
        # Encrypt and store API key
        if settings_data.openai_api_key:
            settings.openai_api_key = encrypt_api_key(settings_data.openai_api_key)
        else:
            settings.openai_api_key = None

    if settings_data.default_transcription_method is not None:
        settings.default_transcription_method = settings_data.default_transcription_method

    if settings_data.default_language is not None:
        settings.default_language = settings_data.default_language

    if settings_data.default_model is not None:
        settings.default_model = settings_data.default_model

    if settings_data.theme is not None:
        settings.theme = settings_data.theme

    if settings_data.add_timestamps is not None:
        settings.add_timestamps = settings_data.add_timestamps

    db.commit()
    db.refresh(settings)

    return SettingsResponse(
        id=settings.id,
        openai_api_key="***" if settings.openai_api_key else None,
        openai_api_key_set=bool(settings.openai_api_key),
        default_transcription_method=settings.default_transcription_method,
        default_language=settings.default_language,
        default_model=settings.default_model,
        theme=settings.theme,
        add_timestamps=settings.add_timestamps,
        updated_at=settings.updated_at
    )

@router.get("/openai-balance")
def get_openai_balance(db: Session = Depends(get_db)):
    """Get OpenAI API balance"""
    from app.services.llm_service import LLMService

    try:
        balance = LLMService.get_balance()
        return {"balance": balance}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/test-openai-key")
def test_openai_key(request: dict):
    """Test if OpenAI API key is valid"""
    from app.services.llm_service import LLMService

    api_key = request.get("api_key")
    if not api_key:
        return {"valid": False, "error": "API key is required"}

    try:
        is_valid = LLMService.test_api_key(api_key)
        return {"valid": is_valid}
    except Exception as e:
        return {"valid": False, "error": str(e)}

@router.post("/download-model")
async def download_model():
    """Download Whisper model for local transcription"""
    from app.config import config
    import os

    if config.is_demo_mode():
        return {"status": "success", "message": "Model download is disabled in demo mode"}

    try:
        from faster_whisper import WhisperModel

        # Set model cache directory to volume path
        model_cache_dir = os.getenv("TRANSFORMERS_CACHE", "/app/data/models")
        os.makedirs(model_cache_dir, exist_ok=True)

        # Initialize model (this will download it if not present)
        model = WhisperModel(
            "large-v2",
            device="cpu",
            compute_type="int8",
            download_root=model_cache_dir
        )

        return {
            "status": "success",
            "message": "Model downloaded successfully",
            "model": "large-v2",
            "path": model_cache_dir
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download model: {str(e)}")

@router.get("/model-status")
async def get_model_status():
    """Check if Whisper model is downloaded"""
    from app.config import config
    import os

    if config.is_demo_mode():
        return {"downloaded": False, "message": "Demo mode"}

    try:
        model_cache_dir = os.getenv("TRANSFORMERS_CACHE", "/app/data/models")

        # Check if model directory exists and has files
        model_path = os.path.join(model_cache_dir, "models--Systran--faster-whisper-large-v2")
        downloaded = os.path.exists(model_path) and os.path.isdir(model_path)

        return {
            "downloaded": downloaded,
            "model": "large-v2",
            "path": model_cache_dir
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check model status: {str(e)}")
