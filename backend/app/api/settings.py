from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import asyncio
import json
from typing import Optional
from tqdm.auto import tqdm as tqdm_auto

from app.database import get_db, Settings
from app.models.schemas import SettingsResponse, SettingsUpdate

router = APIRouter()

# Global state for download progress
class DownloadProgress:
    def __init__(self):
        self.current: float = 0.0
        self.total: float = 100.0
        self.status: str = "idle"  # idle, downloading, complete, error
        self.message: str = ""
        self.files_progress: dict = {}  # Track individual file downloads

    def reset(self):
        self.current = 0.0
        self.total = 100.0
        self.status = "idle"
        self.message = ""
        self.files_progress = {}

    def to_dict(self):
        return {
            "current": self.current,
            "total": self.total,
            "percentage": round((self.current / self.total * 100) if self.total > 0 else 0, 2),
            "status": self.status,
            "message": self.message,
            "files": self.files_progress
        }

download_progress = DownloadProgress()

# Custom TQDM class that updates global progress
class ProgressTQDM(tqdm_auto):
    def __init__(self, *args, **kwargs):
        self.file_desc = kwargs.get('desc', 'Downloading')
        super().__init__(*args, **kwargs)
        download_progress.status = "downloading"
        download_progress.message = self.file_desc

    def update(self, n=1):
        super().update(n)
        if self.total:
            download_progress.files_progress[self.file_desc] = {
                "current": self.n,
                "total": self.total,
                "percentage": round((self.n / self.total * 100), 2)
            }
            # Update overall progress (average of all files)
            if download_progress.files_progress:
                total_percentage = sum(f["percentage"] for f in download_progress.files_progress.values())
                avg_percentage = total_percentage / len(download_progress.files_progress)
                download_progress.current = avg_percentage
                download_progress.total = 100.0
        return self.n

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

    response = SettingsResponse(
        id=settings.id,
        default_transcription_method=settings.default_transcription_method,
        default_language=settings.default_language,
        default_model=settings.default_model,
        theme=settings.theme,
        add_timestamps=settings.add_timestamps,
        summary_prompt=settings.summary_prompt,
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

    if settings_data.summary_prompt is not None:
        settings.summary_prompt = settings_data.summary_prompt

    db.commit()
    db.refresh(settings)

    return SettingsResponse(
        id=settings.id,
        default_transcription_method=settings.default_transcription_method,
        default_language=settings.default_language,
        default_model=settings.default_model,
        theme=settings.theme,
        add_timestamps=settings.add_timestamps,
        summary_prompt=settings.summary_prompt,
        updated_at=settings.updated_at
    )

@router.get("/openai-key-status")
def get_openai_key_status():
    """Check if OpenAI API key is configured in environment"""
    from app.config import config
    import os

    # In demo mode, no key needed
    if config.is_demo_mode():
        return {"has_key": True, "message": "Demo mode - no key needed"}

    # Check if key exists in environment variables
    openai_key = os.getenv("OPENAI_API_KEY")
    has_key = openai_key is not None and openai_key.strip() != ""

    return {
        "has_key": has_key,
        "message": "OpenAI API key configured in environment" if has_key else "OpenAI API key not configured in environment"
    }

@router.get("/openai-balance")
def get_openai_balance(db: Session = Depends(get_db)):
    """Get OpenAI API balance"""
    from app.services.llm_service import LLMService

    try:
        balance = LLMService.get_balance()
        return {"balance": balance}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/download-progress")
async def download_progress_stream():
    """Server-Sent Events endpoint for model download progress"""
    async def event_generator():
        """Generate SSE events with download progress"""
        try:
            last_status = None
            while True:
                current_data = download_progress.to_dict()

                # Only send update if something changed or status is downloading
                if current_data != last_status or current_data["status"] == "downloading":
                    yield f"data: {json.dumps(current_data)}\n\n"
                    last_status = current_data.copy()

                # Stop streaming if download is complete or errored
                if current_data["status"] in ["complete", "error", "idle"]:
                    # Send final update
                    await asyncio.sleep(0.5)
                    yield f"data: {json.dumps(current_data)}\n\n"
                    break

                await asyncio.sleep(0.5)  # Update every 500ms
        except asyncio.CancelledError:
            # Client disconnected
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )

@router.post("/download-model")
async def download_model():
    """Download Whisper model for local transcription with progress tracking"""
    from app.config import config
    import os
    import logging

    logger = logging.getLogger(__name__)

    if config.is_demo_mode():
        return {"status": "success", "message": "Model download is disabled in demo mode"}

    # Reset progress state
    download_progress.reset()
    download_progress.status = "initializing"
    download_progress.message = "Preparing to download model..."

    try:
        from faster_whisper import WhisperModel
        from huggingface_hub import snapshot_download
        import asyncio

        # Set model cache directory to volume path
        model_cache_dir = os.getenv("TRANSFORMERS_CACHE", "/app/data/models")
        os.makedirs(model_cache_dir, exist_ok=True)

        # Check if model already exists
        model_path = os.path.join(model_cache_dir, "models--Systran--faster-whisper-large-v2")
        already_downloaded = os.path.exists(model_path) and os.path.isdir(model_path)

        if already_downloaded:
            logger.info("Model already exists, loading from cache...")
            download_progress.status = "complete"
            download_progress.message = "Model already cached"
            download_progress.current = 100
            download_progress.total = 100
        else:
            logger.info("Model not found, downloading from HuggingFace (this may take several minutes for ~3GB)...")

            # Run the blocking download in a thread pool
            def _download_model():
                download_progress.status = "downloading"
                download_progress.message = "Downloading model files from HuggingFace..."
                logger.info("Starting model download with progress tracking...")

                # Download model using huggingface_hub with custom progress bar
                try:
                    snapshot_download(
                        repo_id="Systran/faster-whisper-large-v2",
                        cache_dir=model_cache_dir,
                        tqdm_class=ProgressTQDM,
                        local_files_only=False
                    )
                    logger.info("Model download complete")
                except Exception as e:
                    logger.error(f"Snapshot download failed: {e}")
                    raise

                # Verify by loading the model
                download_progress.message = "Verifying model..."
                logger.info("Initializing WhisperModel from downloaded files...")
                model = WhisperModel(
                    "large-v2",
                    device="cpu",
                    compute_type="int8",
                    download_root=model_cache_dir
                )
                logger.info("WhisperModel initialization complete")

                # Verify model is actually usable
                download_progress.message = "Testing model integrity..."
                logger.info("Verifying model integrity...")
                _ = model.supported_languages
                logger.info("Model verification successful")

                return model

            # Execute the blocking operation in a thread pool
            loop = asyncio.get_event_loop()
            model = await loop.run_in_executor(None, _download_model)

            # Double-check that model files exist after download
            if not os.path.exists(model_path):
                download_progress.status = "error"
                download_progress.message = "Model files not found after download"
                raise Exception("Model files not found after download attempt")

            download_progress.status = "complete"
            download_progress.message = "Model downloaded and verified successfully"
            download_progress.current = 100
            download_progress.total = 100

        logger.info(f"Model successfully available at: {model_cache_dir}")

        return {
            "status": "success",
            "message": "Model downloaded and verified successfully" if not already_downloaded else "Model loaded from cache successfully",
            "model": "large-v2",
            "path": model_cache_dir,
            "already_cached": already_downloaded
        }
    except Exception as e:
        logger.error(f"Model download failed: {str(e)}")
        download_progress.status = "error"
        download_progress.message = f"Download failed: {str(e)}"
        raise HTTPException(status_code=500, detail=f"Failed to download model: {str(e)}")

@router.get("/model-status")
async def get_model_status():
    """Check if Whisper model is downloaded"""
    from app.config import config
    import os

    if config.is_demo_mode():
        return {
            "downloaded": True,
            "message": "Demo mode - no model needed",
            "model": "demo",
            "path": "demo",
            "download_progress": {
                "status": "complete",
                "message": "Demo mode",
                "percentage": 100,
                "current": 100,
                "total": 100
            }
        }

    try:
        model_cache_dir = os.getenv("TRANSFORMERS_CACHE", "/app/data/models")

        # Check if model directory exists and has files
        model_path = os.path.join(model_cache_dir, "models--Systran--faster-whisper-large-v2")
        downloaded = os.path.exists(model_path) and os.path.isdir(model_path)

        # Also return current download progress if downloading
        progress_info = download_progress.to_dict()

        return {
            "downloaded": downloaded,
            "model": "large-v2",
            "path": model_cache_dir,
            "download_progress": progress_info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check model status: {str(e)}")

async def auto_download_model_on_startup():
    """Automatically download Whisper model on server startup if not exists"""
    import os
    import logging

    logger = logging.getLogger(__name__)

    try:
        model_cache_dir = os.getenv("TRANSFORMERS_CACHE", "/app/data/models")
        model_path = os.path.join(model_cache_dir, "models--Systran--faster-whisper-large-v2")

        # Check if model already exists
        if os.path.exists(model_path) and os.path.isdir(model_path):
            logger.info("✓ Whisper model already downloaded")
            download_progress.status = "complete"
            download_progress.message = "Model ready"
            download_progress.current = 100
            download_progress.total = 100
            return

        # Model not found, start download
        print("\n" + "="*60)
        print("📥 WHISPER MODEL NOT FOUND")
        print("="*60)
        print("Starting automatic download of Whisper large-v2 model (~3GB)")
        print("This is a one-time operation and may take several minutes...")
        print("="*60 + "\n")

        download_progress.reset()
        download_progress.status = "downloading"
        download_progress.message = "Auto-downloading Whisper model on startup..."

        # Call the existing download_model function
        await download_model()

        print("\n" + "="*60)
        print("✓ Whisper model downloaded successfully!")
        print("="*60 + "\n")

    except Exception as e:
        logger.error(f"Failed to auto-download model: {e}")
        download_progress.status = "error"
        download_progress.message = f"Auto-download failed: {str(e)}"
        print("\n" + "="*60)
        print("⚠️  MODEL AUTO-DOWNLOAD FAILED")
        print("="*60)
        print(f"Error: {str(e)}")
        print("\nYou can manually download the model from Settings page")
        print("="*60 + "\n")
