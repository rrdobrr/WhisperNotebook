from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
from datetime import datetime
import re
import unicodedata
import logging

from app.database import get_db, Text
from app.models.schemas import TextResponse, TextCreate, TextUpdate
from app.services.transcription_service import TranscriptionService

router = APIRouter()
logger = logging.getLogger(__name__)

def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to be safe for all filesystems.
    Removes/replaces problematic characters including Cyrillic.
    """
    # Split filename and extension
    name, ext = os.path.splitext(filename)

    # Transliterate Cyrillic to Latin
    translit_map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
        'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
        'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
        'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
        'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    }

    # Apply transliteration
    transliterated = ''.join(translit_map.get(c, c) for c in name)

    # Normalize unicode characters
    normalized = unicodedata.normalize('NFKD', transliterated)

    # Remove non-ASCII characters
    ascii_name = normalized.encode('ascii', 'ignore').decode('ascii')

    # Replace spaces and special characters with underscores
    cleaned = re.sub(r'[^\w\-.]', '_', ascii_name)

    # Remove multiple consecutive underscores
    cleaned = re.sub(r'_+', '_', cleaned)

    # Remove leading/trailing underscores
    cleaned = cleaned.strip('_')

    # If name becomes empty, use 'file'
    if not cleaned:
        cleaned = 'file'

    return cleaned + ext

@router.post("/upload", response_model=TextResponse)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    method: str = Form("local"),
    language: str = Form("auto"),
    add_timestamps: bool = Form(True),
    db: Session = Depends(get_db)
):
    """Upload audio or video file for transcription"""

    # Read file content first to validate size
    file_content = await file.read()
    file_size = len(file_content)

    if file_size > 500 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 500MB")

    if file_size == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes)")

    # Determine file type
    file_ext = os.path.splitext(file.filename)[1].lower()
    audio_exts = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.opus', '.wma', '.aac']
    video_exts = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv', '.wmv']

    if file_ext in audio_exts:
        file_type = "audio"
    elif file_ext in video_exts:
        file_type = "video"
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    # Save uploaded file
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)

    # Sanitize filename to prevent issues with special characters
    safe_filename = sanitize_filename(file.filename)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{safe_filename}"

    filepath = os.path.join(upload_dir, filename)

    logger.info(f"Saving uploaded file: {file.filename} -> {filename} ({file_size} bytes)")

    try:
        # Write to disk (file_content was already read above)
        with open(filepath, "wb") as buffer:
            buffer.write(file_content)
            buffer.flush()
            os.fsync(buffer.fileno())

        # Verify file was saved correctly
        saved_size = os.path.getsize(filepath)
        logger.info(f"File saved: {filepath} - Written: {len(file_content)} bytes, On disk: {saved_size} bytes")

        # Read first 16 bytes to verify file header
        with open(filepath, "rb") as verify:
            header = verify.read(16)
            logger.info(f"File header (hex): {header.hex()}")

            # Check for common audio/video formats
            if header.startswith(b'ID3'):
                logger.info("✓ Valid MP3 file with ID3 tag")
            elif header.startswith(b'\xff\xfb') or header.startswith(b'\xff\xf3') or header.startswith(b'\xff\xf2'):
                logger.info("✓ Valid MP3 file (MPEG audio)")
            elif header.startswith(b'RIFF'):
                logger.info("✓ Valid WAV/RIFF file")
            elif header.startswith(b'\x00\x00\x00'):
                logger.info("✓ Valid MP4/M4A file")
            else:
                logger.warning(f"⚠ Unknown file format, first 4 bytes: {header[:4].hex()}")

        if saved_size != len(file_content):
            logger.error(f"SIZE MISMATCH! Expected {len(file_content)}, got {saved_size}")

        if saved_size == 0:
            raise HTTPException(status_code=500, detail="File was saved as 0 bytes!")

    except Exception as e:
        logger.error(f"Failed to save file {filepath}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Create text record with "queued" status
    text = Text(
        title=file.filename,
        content="",
        status="queued",
        queued_at=datetime.utcnow(),
        source_type="upload",
        filename=filename,
        original_filename=file.filename,
        file_type=file_type,
        file_size=file_size,
        method=method,
        language=language if language != "auto" else None
    )
    db.add(text)
    db.commit()
    db.refresh(text)

    # Start transcription in background
    background_tasks.add_task(
        TranscriptionService.process_transcription,
        text.id,
        filepath,
        method,
        language,
        add_timestamps
    )

    return text

@router.post("/youtube", response_model=TextResponse)
async def transcribe_youtube(
    background_tasks: BackgroundTasks,
    youtube_url: str = Form(...),
    method: str = Form("local"),
    language: str = Form("auto"),
    add_timestamps: bool = Form(True),
    db: Session = Depends(get_db)
):
    """Download and transcribe YouTube video"""

    # Create text record with "queued" status
    text = Text(
        title=f"YouTube: {youtube_url[:50]}...",
        content="",
        status="queued",
        queued_at=datetime.utcnow(),
        source_type="youtube",
        original_filename=youtube_url,
        file_type="youtube",
        method=method,
        language=language if language != "auto" else None
    )
    db.add(text)
    db.commit()
    db.refresh(text)

    # Download and transcribe in background
    background_tasks.add_task(
        TranscriptionService.process_youtube,
        text.id,
        youtube_url,
        method,
        language,
        add_timestamps
    )

    return text

@router.post("/", response_model=TextResponse)
async def create_text(text_data: TextCreate, db: Session = Depends(get_db)):
    """Create new text manually"""
    text = Text(**text_data.model_dump())
    db.add(text)
    db.commit()
    db.refresh(text)
    return text

@router.get("/", response_model=List[TextResponse])
async def get_texts(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all texts with optional filters"""
    query = db.query(Text)

    if search:
        query = query.filter(
            (Text.title.contains(search)) | (Text.content.contains(search))
        )

    if status:
        query = query.filter(Text.status == status)

    if source_type:
        query = query.filter(Text.source_type == source_type)

    texts = query.order_by(Text.created_at.desc()).offset(skip).limit(limit).all()
    return texts

@router.get("/{text_id}", response_model=TextResponse)
async def get_text(text_id: int, db: Session = Depends(get_db)):
    """Get text by ID and mark as read"""
    text = db.query(Text).filter(Text.id == text_id).first()
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")

    # Mark as read if it was unread
    if text.status == "unread":
        text.status = "read"
        db.commit()
        db.refresh(text)

    return text

@router.put("/{text_id}", response_model=TextResponse)
async def update_text(text_id: int, text_data: TextUpdate, db: Session = Depends(get_db)):
    """Update text"""
    text = db.query(Text).filter(Text.id == text_id).first()
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")

    if text_data.title is not None:
        text.title = text_data.title
    if text_data.content is not None:
        text.content = text_data.content
    if text_data.status is not None:
        text.status = text_data.status
    if text_data.extra_metadata is not None:
        text.extra_metadata = text_data.extra_metadata
    if text_data.started_at is not None:
        text.started_at = text_data.started_at
    if text_data.queued_at is not None:
        text.queued_at = text_data.queued_at

    db.commit()
    db.refresh(text)
    return text

@router.delete("/{text_id}")
async def delete_text(text_id: int, db: Session = Depends(get_db)):
    """Delete text and associated file"""
    text = db.query(Text).filter(Text.id == text_id).first()
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")

    # Delete file if it exists
    if text.filename and os.path.exists(os.path.join("uploads", text.filename)):
        try:
            os.remove(os.path.join("uploads", text.filename))
        except Exception:
            pass

    db.delete(text)
    db.commit()

    return {"message": "Text deleted successfully"}

@router.post("/{text_id}/process")
def process_text(
    text_id: int,
    request: dict,
    db: Session = Depends(get_db)
):
    """Process text with custom prompt using LLM"""
    from app.services.llm_service import LLMService

    text = db.query(Text).filter(Text.id == text_id).first()
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")

    prompt = request.get("prompt")
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    try:
        result = LLMService.process_text(text.content, prompt)
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{text_id}/summarize")
def summarize_text(text_id: int, db: Session = Depends(get_db)):
    """Automatically summarize text using LLM and create new text with summary"""
    from app.services.llm_service import LLMService
    from app.database import Cost, Settings

    text = db.query(Text).filter(Text.id == text_id).first()
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")

    # Get custom prompt from settings
    settings = db.query(Settings).first()
    custom_prompt = settings.summary_prompt if settings and settings.summary_prompt else None

    try:
        summary, tokens, cost = LLMService.summarize(text.content, custom_prompt=custom_prompt)

        # Create new text with summary
        summary_text = Text(
            title=f"Конспект {text.title}",
            content=summary,
            status="read",
            source_type="manual"
        )
        db.add(summary_text)

        # Save cost to database
        cost_record = Cost(
            service="chatgpt",
            category="summary",
            amount=cost,
            details={
                "text_id": text_id,
                "summary_text_id": None,  # Will be updated after commit
                "tokens": tokens,
                "model": "gpt-4"
            }
        )
        db.add(cost_record)

        db.commit()
        db.refresh(summary_text)

        # Update cost record with summary_text_id
        cost_record.details["summary_text_id"] = summary_text.id
        db.commit()

        return {"summary_text_id": summary_text.id, "title": summary_text.title}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats/queue")
async def get_queue_stats(db: Session = Depends(get_db)):
    """Get transcription queue statistics"""
    processing = db.query(Text).filter(Text.status == "processing").count()
    unread = db.query(Text).filter(Text.status == "unread").count()
    total = db.query(Text).count()

    return {
        "processing": processing,
        "unread": unread,
        "total": total
    }
