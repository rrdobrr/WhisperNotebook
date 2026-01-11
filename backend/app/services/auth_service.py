"""Authentication service for JWT-based auth"""
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from backend.app.database import Settings

# Password hashing context (not used for env-based auth, but kept for future extensibility)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Configuration
ALGORITHM = "HS256"


class AuthService:
    """Service for handling JWT authentication"""

    @staticmethod
    def get_jwt_secret(db: Session) -> str:
        """
        Get or generate JWT secret from database.
        This ensures the secret persists across app restarts.
        """
        settings = db.query(Settings).first()

        if not settings:
            # Create settings entry if it doesn't exist
            settings = Settings()
            db.add(settings)
            db.commit()
            db.refresh(settings)

        if not settings.jwt_secret:
            # Generate new JWT secret
            settings.jwt_secret = secrets.token_urlsafe(32)
            db.commit()
            print(f"✅ Generated new JWT secret: {settings.jwt_secret[:10]}...")

        return settings.jwt_secret

    @staticmethod
    def get_jwt_expiration_days() -> int:
        """Get JWT expiration days from environment variable"""
        return int(os.getenv("JWT_EXPIRATION_DAYS", "30"))

    @staticmethod
    def verify_credentials(username: str, password: str) -> bool:
        """
        Verify username and password against environment variables.

        Args:
            username: Username to verify
            password: Password to verify

        Returns:
            True if credentials match, False otherwise
        """
        expected_username = os.getenv("AUTH_USERNAME")
        expected_password = os.getenv("AUTH_PASSWORD")

        # If no credentials are set in env, deny access (security by default)
        if not expected_username or not expected_password:
            print("⚠️  AUTH_USERNAME or AUTH_PASSWORD not set in environment")
            return False

        return username == expected_username and password == expected_password

    @staticmethod
    def create_access_token(username: str, db: Session) -> str:
        """
        Create a JWT access token.

        Args:
            username: Username to encode in token
            db: Database session

        Returns:
            Encoded JWT token
        """
        jwt_secret = AuthService.get_jwt_secret(db)
        expiration_days = AuthService.get_jwt_expiration_days()

        # Calculate expiration time
        expire = datetime.utcnow() + timedelta(days=expiration_days)

        # Create token payload
        payload = {
            "sub": username,
            "exp": expire,
            "iat": datetime.utcnow()
        }

        # Encode token
        token = jwt.encode(payload, jwt_secret, algorithm=ALGORITHM)

        print(f"✅ Created JWT token for '{username}' (expires in {expiration_days} days)")

        return token

    @staticmethod
    def verify_token(token: str, db: Session) -> Optional[str]:
        """
        Verify and decode JWT token.

        Args:
            token: JWT token to verify
            db: Database session

        Returns:
            Username from token if valid, None otherwise
        """
        try:
            jwt_secret = AuthService.get_jwt_secret(db)

            # Decode and verify token
            payload = jwt.decode(token, jwt_secret, algorithms=[ALGORITHM])
            username: str = payload.get("sub")

            if username is None:
                return None

            return username

        except JWTError as e:
            print(f"❌ JWT verification failed: {e}")
            return None

    @staticmethod
    def reset_jwt_secret(db: Session) -> str:
        """
        Reset JWT secret (invalidates all existing tokens).

        Args:
            db: Database session

        Returns:
            New JWT secret
        """
        settings = db.query(Settings).first()

        if not settings:
            settings = Settings()
            db.add(settings)

        # Generate new secret
        settings.jwt_secret = secrets.token_urlsafe(32)
        db.commit()

        print(f"✅ Reset JWT secret - all existing tokens invalidated")

        return settings.jwt_secret

    @staticmethod
    def is_auth_enabled() -> bool:
        """
        Check if authentication is enabled (both username and password are set).

        Returns:
            True if auth is enabled, False otherwise
        """
        username = os.getenv("AUTH_USERNAME")
        password = os.getenv("AUTH_PASSWORD")

        return bool(username and password)
