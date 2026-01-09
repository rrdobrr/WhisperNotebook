from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
from datetime import datetime

from app.database import get_db, Text
from app.models.schemas import TextResponse, TextCreate, TextUpdate
from app.services.transcription_service import TranscriptionService

router = APIRouter()

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

    # Validate file size (max 500MB)
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > 500 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 500MB")

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

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    filepath = os.path.join(upload_dir, filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Create text record with "processing" status
    text = Text(
        title=file.filename,
        content="",
        status="processing",
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

    # Create text record with "processing" status
    text = Text(
        title=f"YouTube: {youtube_url[:50]}...",
        content="",
        status="processing",
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
    if text_data.metadata is not None:
        text.metadata = text_data.metadata

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
    """Automatically summarize text using LLM"""
    from app.services.llm_service import LLMService

    text = db.query(Text).filter(Text.id == text_id).first()
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")

    try:
        summary = LLMService.summarize(text.content)
        return {"summary": summary}
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
