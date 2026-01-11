from cryptography.fernet import Fernet
import os
from sqlalchemy.orm import Session

def get_encryption_key_from_db(db: Session) -> str:
    """
    Get or generate encryption key from database.
    This ensures the key persists across app restarts.
    """
    from backend.app.database import Settings

    settings = db.query(Settings).first()

    if not settings:
        # Create settings entry if it doesn't exist
        settings = Settings()
        db.add(settings)
        db.commit()
        db.refresh(settings)

    if not settings.encryption_key:
        # Generate new encryption key
        settings.encryption_key = Fernet.generate_key().decode()
        db.commit()
        print(f"✅ Generated new encryption key: {settings.encryption_key[:10]}...")

    return settings.encryption_key

def get_cipher(db: Session = None):
    """
    Get Fernet cipher instance.

    Args:
        db: Database session (required for auto-generation)

    Returns:
        Fernet cipher instance
    """
    # Try to get from environment first (for backwards compatibility)
    encryption_key = os.getenv("ENCRYPTION_KEY")

    if not encryption_key and db:
        # Auto-generate and store in database
        encryption_key = get_encryption_key_from_db(db)

    if not encryption_key:
        # Fallback: generate temporary key (will be lost on restart)
        encryption_key = Fernet.generate_key().decode()
        print("⚠️  Using temporary encryption key (will be lost on restart)")

    key = encryption_key.encode() if isinstance(encryption_key, str) else encryption_key
    return Fernet(key)

def encrypt_api_key(api_key: str, db: Session = None) -> str:
    """
    Encrypt API key.

    Args:
        api_key: Plain text API key to encrypt
        db: Database session (optional, for auto-generation)

    Returns:
        Encrypted API key
    """
    cipher = get_cipher(db)
    encrypted = cipher.encrypt(api_key.encode())
    return encrypted.decode()

def decrypt_api_key(encrypted_key: str, db: Session = None) -> str:
    """
    Decrypt API key.

    Args:
        encrypted_key: Encrypted API key
        db: Database session (optional, for auto-generation)

    Returns:
        Decrypted API key
    """
    cipher = get_cipher(db)
    decrypted = cipher.decrypt(encrypted_key.encode())
    return decrypted.decode()
