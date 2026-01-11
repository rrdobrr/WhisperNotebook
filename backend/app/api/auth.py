"""Authentication API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.schemas import LoginRequest, LoginResponse, TokenVerifyResponse
from backend.app.services.auth_service import AuthService

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Authenticate user and return JWT token.

    Args:
        credentials: Login credentials (username and password)
        db: Database session

    Returns:
        JWT access token with expiration info

    Raises:
        401: Invalid credentials
        503: Authentication not configured
    """
    # Check if authentication is enabled
    if not AuthService.is_auth_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication not configured. Set AUTH_USERNAME and AUTH_PASSWORD environment variables."
        )

    # Verify credentials
    if not AuthService.verify_credentials(credentials.username, credentials.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create access token
    access_token = AuthService.create_access_token(credentials.username, db)
    expiration_days = AuthService.get_jwt_expiration_days()

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in_days=expiration_days
    )


@router.get("/verify", response_model=TokenVerifyResponse)
async def verify_token(
    token: str,
    db: Session = Depends(get_db)
):
    """
    Verify if a JWT token is valid.

    Args:
        token: JWT token to verify
        db: Database session

    Returns:
        Token validity status and username if valid
    """
    username = AuthService.verify_token(token, db)

    if username:
        return TokenVerifyResponse(valid=True, username=username)
    else:
        return TokenVerifyResponse(valid=False)


@router.post("/reset-secret")
async def reset_jwt_secret(
    db: Session = Depends(get_db)
):
    """
    Reset JWT secret (invalidates all existing tokens).
    This endpoint will be protected by auth middleware in production.

    Args:
        db: Database session

    Returns:
        Success message
    """
    AuthService.reset_jwt_secret(db)

    return {"message": "JWT secret reset successfully. All existing tokens have been invalidated."}
