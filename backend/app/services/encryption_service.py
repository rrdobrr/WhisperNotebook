from cryptography.fernet import Fernet
import os

from app.config import config

def get_cipher():
    """Get Fernet cipher instance"""
    encryption_key = config.get_encryption_key()

    if not encryption_key:
        # Generate temporary key for demo
        encryption_key = Fernet.generate_key().decode()
        if not config.is_demo_mode():
            print(f"⚠️  Generated new encryption key. Set ENCRYPTION_KEY={encryption_key} in your environment.")

    key = encryption_key.encode() if isinstance(encryption_key, str) else encryption_key
    return Fernet(key)

def encrypt_api_key(api_key: str) -> str:
    """Encrypt API key"""
    cipher = get_cipher()
    encrypted = cipher.encrypt(api_key.encode())
    return encrypted.decode()

def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypt API key"""
    cipher = get_cipher()
    decrypted = cipher.decrypt(encrypted_key.encode())
    return decrypted.decode()
