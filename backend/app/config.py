import os
from typing import Optional
from pathlib import Path

def _get_database_url() -> str:
    """
    Get database URL with smart defaults.
    Tries in order:
    1. DATABASE_URL from env (user override)
    2. /app/data/whispertranscriber.db (Railway/Docker with volume)
    3. ./whispertranscriber.db (local development)
    """
    if os.getenv("DATABASE_URL"):
        return os.getenv("DATABASE_URL")

    # Check if running in containerized environment (Railway/Docker)
    volume_path = Path("/app/data")
    if volume_path.exists() and volume_path.is_dir():
        return "sqlite:////app/data/whispertranscriber.db"

    # Local development
    return "sqlite:///./whispertranscriber.db"

def _get_model_cache_dir() -> str:
    """
    Get model cache directory with smart defaults.
    Tries in order:
    1. TRANSFORMERS_CACHE from env (user override)
    2. /app/data/models (Railway/Docker with volume)
    3. ./data/models (local development)
    """
    if os.getenv("TRANSFORMERS_CACHE"):
        return os.getenv("TRANSFORMERS_CACHE")

    # Check if running in containerized environment
    volume_path = Path("/app/data")
    if volume_path.exists() and volume_path.is_dir():
        cache_dir = volume_path / "models"
        cache_dir.mkdir(exist_ok=True)
        return str(cache_dir)

    # Local development
    cache_dir = Path("./data/models")
    cache_dir.mkdir(parents=True, exist_ok=True)
    return str(cache_dir)

class Config:
    """Application configuration"""

    # Demo mode - run without API keys or model downloads
    DEMO_MODE: bool = os.getenv("DEMO_MODE", "false").lower() == "true"

    # Database - Smart defaults
    DATABASE_URL: str = _get_database_url()

    # Model storage - Smart defaults
    TRANSFORMERS_CACHE: str = _get_model_cache_dir()
    HF_HOME: str = _get_model_cache_dir()  # Use same directory for Hugging Face

    # API Keys (optional in demo mode)
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")

    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8080"))

    # CORS
    ALLOWED_ORIGINS: list = os.getenv("ALLOWED_ORIGINS", "*").split(",")

    # File limits
    MAX_FILE_SIZE: int = 500 * 1024 * 1024  # 500MB

    @classmethod
    def is_demo_mode(cls) -> bool:
        """Check if running in demo mode"""
        return cls.DEMO_MODE

    @classmethod
    def setup_environment(cls):
        """
        Set up environment variables for downstream services.
        Call this during app initialization.
        """
        # Set environment variables so other parts of the app can use them
        os.environ["DATABASE_URL"] = cls.DATABASE_URL
        os.environ["TRANSFORMERS_CACHE"] = cls.TRANSFORMERS_CACHE
        os.environ["HF_HOME"] = cls.HF_HOME

config = Config()
# Set up environment on module load
config.setup_environment()
