import os
from typing import Optional

class Config:
    """Application configuration"""

    # Demo mode - run without API keys or model downloads
    DEMO_MODE: bool = os.getenv("DEMO_MODE", "false").lower() == "true"

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./whispertranscriber.db")

    # Security
    ENCRYPTION_KEY: Optional[str] = os.getenv("ENCRYPTION_KEY")

    # API Keys (optional in demo mode)
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")

    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # CORS
    ALLOWED_ORIGINS: list = os.getenv("ALLOWED_ORIGINS", "*").split(",")

    # File limits
    MAX_FILE_SIZE: int = 500 * 1024 * 1024  # 500MB

    @classmethod
    def is_demo_mode(cls) -> bool:
        """Check if running in demo mode"""
        return cls.DEMO_MODE

    @classmethod
    def get_encryption_key(cls) -> str:
        """Get encryption key or generate temporary one for demo"""
        if cls.DEMO_MODE and not cls.ENCRYPTION_KEY:
            # Generate temporary key for demo mode
            from cryptography.fernet import Fernet
            return Fernet.generate_key().decode()
        return cls.ENCRYPTION_KEY or ""

config = Config()
