from pydantic import BaseModel, field_validator
from typing import Optional, List, Union
from datetime import datetime

# Text schemas
class TextCreate(BaseModel):
    title: str
    content: str = ""
    source_type: str  # upload, youtube, manual
    status: str = "unread"  # processing, unread, read

    # Optional fields for transcriptions
    filename: Optional[str] = None
    original_filename: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    duration: Optional[float] = None
    method: Optional[str] = None
    language: Optional[str] = None
    cost: Optional[float] = 0.0
    error_message: Optional[str] = None
    extra_metadata: Optional[dict] = None

class TextUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    extra_metadata: Optional[dict] = None
    started_at: Optional[Union[int, str]] = None
    queued_at: Optional[Union[int, str]] = None

class TextResponse(BaseModel):
    id: int
    title: str
    content: str
    status: str
    source_type: str

    # Optional fields
    filename: Optional[str]
    original_filename: Optional[str]
    file_type: Optional[str]
    file_size: Optional[int]
    duration: Optional[float]
    method: Optional[str]
    language: Optional[str]
    cost: float
    error_message: Optional[str]
    extra_metadata: Optional[dict]

    # Queue timestamps - accept both int and string (no validation)
    started_at: Optional[Union[int, str]] = None
    queued_at: Optional[Union[int, str]] = None

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Chat schemas
class ChatCreate(BaseModel):
    title: Optional[str] = "New Chat"
    model: Optional[str] = "gpt-4"

class ChatUpdate(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None

class ChatResponse(BaseModel):
    id: int
    title: str
    model: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Message schemas
class MessageCreate(BaseModel):
    content: str
    text_ids: Optional[List[int]] = []

class AttachmentInfo(BaseModel):
    text_id: int
    title: str

class MessageResponse(BaseModel):
    id: int
    chat_id: int
    role: str
    content: str
    tokens: Optional[int]
    cost: float
    created_at: datetime
    attachments: List[AttachmentInfo] = []

    class Config:
        from_attributes = True

# Settings schemas
class SettingsUpdate(BaseModel):
    default_transcription_method: Optional[str] = None
    default_language: Optional[str] = None
    default_model: Optional[str] = None
    theme: Optional[str] = None
    add_timestamps: Optional[bool] = None
    summary_prompt: Optional[str] = None

class SettingsResponse(BaseModel):
    id: int
    default_transcription_method: str
    default_language: str
    default_model: str
    theme: str
    add_timestamps: bool
    summary_prompt: Optional[str] = None
    updated_at: datetime

    class Config:
        from_attributes = True

# Authentication schemas
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_days: int

class TokenVerifyResponse(BaseModel):
    valid: bool
    username: Optional[str] = None
