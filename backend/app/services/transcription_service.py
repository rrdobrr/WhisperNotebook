import os
import subprocess
from datetime import datetime, timedelta
from typing import Optional
import openai
import traceback
import logging

from app.database import SessionLocal, Text, Cost, Settings
from app.config import config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import mock services if in demo mode
if config.is_demo_mode():
    from app.services.mock_services import MockTranscriptionService, MockYouTubeService
    from app.services.encryption_service import decrypt_api_key
else:
    from faster_whisper import WhisperModel
    from app.services.youtube_service import download_youtube_video
    from app.services.encryption_service import decrypt_api_key

class TranscriptionService:
    _local_model = None

    @classmethod
    def get_local_model(cls):
        """Get or initialize local Whisper model"""
        if config.is_demo_mode():
            return None  # No model needed in demo mode

        if cls._local_model is None:
            # Use volume path for model cache
            model_cache_dir = os.getenv("TRANSFORMERS_CACHE", "/app/data/models")
            os.makedirs(model_cache_dir, exist_ok=True)

            cls._local_model = WhisperModel(
                "large-v2",
                device="cpu",
                compute_type="int8",
                download_root=model_cache_dir
            )
        return cls._local_model

    @staticmethod
    def extract_audio(video_path: str, output_path: str = None) -> str:
        """Extract and compress audio from video"""
        if output_path is None:
            output_path = video_path.rsplit(".", 1)[0] + "_audio.wav"

        # Verify input file exists and has content
        import os
        if not os.path.exists(video_path):
            raise Exception(f"Input file does not exist: {video_path}")

        file_size = os.path.getsize(video_path)
        logger.info(f"Input file: {video_path}, size: {file_size} bytes")

        if file_size == 0:
            raise Exception(f"Input file is empty (0 bytes): {video_path}")

        # Read file header to verify it's valid
        with open(video_path, "rb") as f:
            header = f.read(16)
            logger.info(f"Input file header (hex): {header.hex()}")

        # First attempt: standard conversion
        command = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-ac", "1",  # mono
            "-ar", "16000",  # 16kHz
            "-vn",  # no video
            output_path
        ]

        logger.info(f"Running ffmpeg command: {' '.join(command)}")

        try:
            # Capture stderr to see actual ffmpeg error
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=True
            )
            logger.info(f"FFmpeg completed successfully")
            return output_path
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg failed with exit code {e.returncode}")
            logger.error(f"FFmpeg stderr (first 500 chars): {e.stderr[:500]}")

            # Second attempt: force format detection and be more lenient
            logger.info("Retrying with forced format detection...")
            command_retry = [
                "ffmpeg", "-y",
                "-err_detect", "ignore_err",  # Ignore errors
                "-f", "mp3",  # Force MP3 format
                "-i", video_path,
                "-ac", "1",
                "-ar", "16000",
                "-vn",
                output_path
            ]

            logger.info(f"Retry command: {' '.join(command_retry)}")

            try:
                result = subprocess.run(
                    command_retry,
                    capture_output=True,
                    text=True,
                    check=True
                )
                logger.info(f"FFmpeg succeeded on retry!")
                return output_path
            except subprocess.CalledProcessError as e2:
                logger.error(f"FFmpeg retry also failed: {e2.returncode}")
                logger.error(f"Retry stderr (first 500 chars): {e2.stderr[:500]}")
                raise Exception(f"FFmpeg conversion failed even with retry. Original error: {e.stderr[:500]}")

    @staticmethod
    def format_timestamp(seconds: float) -> str:
        """Format timestamp for SRT format"""
        td = timedelta(seconds=seconds)
        result = str(td)
        if '.' not in result:
            result += '.000000'
        result = result[:12].replace('.', ',')
        if "," not in result:
            result += ",000"
        elif len(result.split(",")[1]) < 3:
            result += "0" * (3 - len(result.split(",")[1]))
        return result.zfill(12)

    @classmethod
    def transcribe_local(cls, audio_path: str, language: Optional[str] = None, add_timestamps: bool = True):
        """Transcribe using local faster-whisper model"""
        # Use mock service in demo mode
        if config.is_demo_mode():
            return MockTranscriptionService.transcribe_local(audio_path, language, add_timestamps)

        model = cls.get_local_model()

        kwargs = {"beam_size": 1}
        if language and language != "auto":
            kwargs["language"] = language

        segments, info = model.transcribe(audio_path, **kwargs)

        full_text = []
        srt_content = []
        segment_id = 1

        for segment in segments:
            text = segment.text.strip()

            if add_timestamps:
                start = cls.format_timestamp(segment.start)
                end = cls.format_timestamp(segment.end)
                srt_content.append(f"{segment_id}\n{start} --> {end}\n{text}\n")
                full_text.append(f"[{start}] {text}")
                segment_id += 1
            else:
                full_text.append(text)

        return "\n".join(full_text), info.language if not language else language, 0.0

    @staticmethod
    def transcribe_api(audio_path: str, api_key: str, language: Optional[str] = None, add_timestamps: bool = True):
        """Transcribe using OpenAI Whisper API"""
        # Use mock service in demo mode
        if config.is_demo_mode():
            return MockTranscriptionService.transcribe_api(audio_path, api_key, language, add_timestamps)

        openai.api_key = api_key

        with open(audio_path, "rb") as audio_file:
            kwargs = {"model": "whisper-1", "file": audio_file}

            if language and language != "auto":
                kwargs["language"] = language

            if add_timestamps:
                kwargs["response_format"] = "srt"
            else:
                kwargs["response_format"] = "text"

            transcript = openai.Audio.transcribe(**kwargs)

        # Calculate cost (OpenAI Whisper API pricing: $0.006 per minute)
        try:
            audio_duration = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
                capture_output=True,
                text=True
            ).stdout.strip()
            duration_minutes = float(audio_duration) / 60
            cost = duration_minutes * 0.006
        except:
            cost = 0.006  # Default minimal cost if duration can't be determined

        detected_language = language if language and language != "auto" else "auto"

        return transcript, detected_language, cost

    @classmethod
    def process_transcription(cls, text_id: int, file_path: str, method: str, language: str, add_timestamps: bool):
        """Process transcription in background"""
        from datetime import datetime
        db = SessionLocal()

        try:
            text = db.query(Text).filter(Text.id == text_id).first()
            if not text:
                logger.error(f"Text with id {text_id} not found")
                return

            # Check if there's already a processing item (queue system)
            processing_text = db.query(Text).filter(Text.status == "processing").first()
            if processing_text and processing_text.id != text_id:
                # Another transcription is in progress, keep this one queued
                logger.info(f"Text {text_id} staying in queue - {processing_text.id} is currently processing")
                return

            # Mark as processing (started_at should already be set by client)
            text.status = "processing"
            db.commit()

            logger.info(f"Starting transcription for text_id={text_id}, file_path={file_path}, method={method}")
            logger.info(f"Current working directory: {os.getcwd()}")
            logger.info(f"Absolute file path: {os.path.abspath(file_path)}")

            # Verify file exists
            if not os.path.exists(file_path):
                # List files in directory to help debug
                upload_dir = os.path.dirname(file_path) or "uploads"
                if os.path.exists(upload_dir):
                    files_in_dir = os.listdir(upload_dir)
                    logger.error(f"File not found: {file_path}")
                    logger.error(f"Files in {upload_dir}: {files_in_dir}")
                else:
                    logger.error(f"Upload directory does not exist: {upload_dir}")
                raise FileNotFoundError(f"File not found: {file_path}")

            # Verify input file is readable
            try:
                file_size = os.path.getsize(file_path)
                logger.info(f"Input file size: {file_size} bytes")

                # Check if file is readable
                with open(file_path, 'rb') as f:
                    # Try to read first few bytes
                    header = f.read(16)
                    logger.info(f"File header (first 16 bytes): {header.hex()}")
            except Exception as e:
                logger.error(f"Cannot read input file: {e}")
                raise

            # Always convert to WAV for compatibility with PyAV/faster-whisper
            # This solves issues with various audio formats and codecs
            temp_dir = "temp"
            os.makedirs(temp_dir, exist_ok=True)
            audio_path = os.path.join(temp_dir, f"{text.id}_audio.wav")

            if text.file_type == "video":
                logger.info(f"Extracting audio from video to {audio_path}")
                cls.extract_audio(file_path, audio_path)
            else:
                # Convert audio file to standard WAV format
                logger.info(f"Converting audio file to WAV: {file_path} -> {audio_path}")
                cls.extract_audio(file_path, audio_path)

            # Verify converted file exists
            if not os.path.exists(audio_path):
                raise FileNotFoundError(f"Converted audio file not found: {audio_path}")

            logger.info(f"Audio prepared for transcription: {audio_path} (size: {os.path.getsize(audio_path)} bytes)")

            # Calculate duration BEFORE transcription starts (for UI estimates)
            try:
                audio_duration = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
                    capture_output=True,
                    text=True
                ).stdout.strip()
                text.duration = float(audio_duration)
                db.commit()
                logger.info(f"Audio duration: {text.duration} seconds")
            except Exception as e:
                logger.warning(f"Could not determine audio duration: {e}")

            # Transcribe
            logger.info(f"Starting transcription with method={method}")
            if method == "local":
                text_content, detected_lang, cost = cls.transcribe_local(audio_path, language, add_timestamps)
            else:
                settings = db.query(Settings).first()
                if not settings or not settings.openai_api_key:
                    raise Exception("OpenAI API key not set")

                api_key = decrypt_api_key(settings.openai_api_key, db)
                text_content, detected_lang, cost = cls.transcribe_api(audio_path, api_key, language, add_timestamps)

            # Update text record with transcription result
            text.content = text_content
            text.language = detected_lang
            text.cost = cost
            text.status = "unread"  # Mark as unread after successful transcription
            db.commit()

            # Duration was already calculated before transcription

            # Record cost
            if cost > 0:
                cost_record = Cost(
                    service="whisper",
                    category="transcription",
                    amount=cost,
                    details={"text_id": text.id, "method": method, "file": text.original_filename}
                )
                db.add(cost_record)
                db.commit()

            # Cleanup temp audio
            if audio_path != file_path and os.path.exists(audio_path):
                os.remove(audio_path)

        except Exception as e:
            # Log full traceback
            error_traceback = traceback.format_exc()
            logger.error(f"Transcription failed for text_id={text_id}:")
            logger.error(error_traceback)

            # Rollback the failed transaction before attempting new queries
            db.rollback()

            try:
                text = db.query(Text).filter(Text.id == text_id).first()
                if text:
                    text.status = "failed"
                    # Store both error message and traceback
                    text.error_message = f"{str(e)}\n\nFull traceback:\n{error_traceback}"
                    db.commit()
                    logger.info(f"Updated text_id={text_id} status to failed")
            except Exception as update_error:
                # If we can't update the status, at least log it
                logger.error(f"Failed to update text status for {text_id}: {update_error}")
                logger.error(traceback.format_exc())
                db.rollback()

        finally:
            db.close()

            # Process next queued item if any
            cls.process_next_in_queue()

    @classmethod
    def process_next_in_queue(cls):
        """Process the next queued transcription if no other is processing"""
        from fastapi import BackgroundTasks
        import asyncio

        db = SessionLocal()
        try:
            # Check if there's anything processing
            processing = db.query(Text).filter(Text.status == "processing").first()
            if processing:
                logger.info("Transcription already in progress, not starting new one")
                return

            # Get the oldest queued item
            queued = db.query(Text).filter(Text.status == "queued").order_by(Text.queued_at).first()
            if not queued:
                logger.info("No queued transcriptions")
                return

            logger.info(f"Starting next queued transcription: {queued.id}")

            # Determine file path
            if queued.source_type == "youtube":
                # For YouTube, we need to call process_youtube
                from threading import Thread
                thread = Thread(
                    target=cls.process_youtube,
                    args=(queued.id, queued.original_filename, queued.method, queued.language, True)
                )
                thread.start()
            else:
                # For uploaded files
                from threading import Thread
                file_path = os.path.join("uploads", queued.filename)
                thread = Thread(
                    target=cls.process_transcription,
                    args=(queued.id, file_path, queued.method, queued.language, True)
                )
                thread.start()

        except Exception as e:
            logger.error(f"Error processing next in queue: {e}")
            logger.error(traceback.format_exc())
        finally:
            db.close()

    @classmethod
    def process_youtube(cls, text_id: int, youtube_url: str, method: str, language: str, add_timestamps: bool):
        """Download YouTube video and process transcription"""
        from datetime import datetime
        db = SessionLocal()

        try:
            text = db.query(Text).filter(Text.id == text_id).first()
            if not text:
                logger.error(f"Text with id {text_id} not found")
                return

            # Check if there's already a processing item (queue system)
            processing_text = db.query(Text).filter(Text.status == "processing").first()
            if processing_text and processing_text.id != text_id:
                # Another transcription is in progress, keep this one queued
                logger.info(f"Text {text_id} staying in queue - {processing_text.id} is currently processing")
                return

            # Mark as processing (started_at should already be set by client)
            text.status = "processing"
            db.commit()

            logger.info(f"Starting YouTube download for text_id={text_id}, url={youtube_url}")

            # Download video
            if config.is_demo_mode():
                video_path = MockYouTubeService.download_youtube_video(youtube_url, text_id)
            else:
                video_path = download_youtube_video(youtube_url, text_id)

            logger.info(f"Downloaded YouTube video to {video_path}")
            logger.info(f"Absolute video path: {os.path.abspath(video_path)}")

            text.filename = os.path.basename(video_path)
            db.commit()

            # Process as regular video
            cls.process_transcription(text_id, video_path, method, language, add_timestamps)

        except Exception as e:
            # Log full traceback
            error_traceback = traceback.format_exc()
            logger.error(f"YouTube transcription failed for text_id={text_id}:")
            logger.error(error_traceback)

            # Rollback the failed transaction before attempting new queries
            db.rollback()

            try:
                text = db.query(Text).filter(Text.id == text_id).first()
                if text:
                    text.status = "failed"
                    # Store both error message and traceback
                    text.error_message = f"{str(e)}\n\nFull traceback:\n{error_traceback}"
                    db.commit()
                    logger.info(f"Updated text_id={text_id} status to failed")
            except Exception as update_error:
                # If we can't update the status, at least log it
                logger.error(f"Failed to update YouTube text status for {text_id}: {update_error}")
                logger.error(traceback.format_exc())
                db.rollback()

        finally:
            db.close()

            # Process next queued item if any
            cls.process_next_in_queue()
