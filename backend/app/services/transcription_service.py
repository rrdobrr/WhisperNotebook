import os
import subprocess
from datetime import datetime, timedelta
from typing import Optional
import openai

from app.database import SessionLocal, Text, Cost, Settings
from app.config import config

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

        # Extract audio with compression: mono, 16kHz sample rate
        command = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-ac", "1",  # mono
            "-ar", "16000",  # 16kHz
            "-vn",  # no video
            output_path
        ]

        subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return output_path

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
        db = SessionLocal()

        try:
            text = db.query(Text).filter(Text.id == text_id).first()
            if not text:
                return

            # Already in "processing" status from creation

            # Extract audio if video
            audio_path = file_path
            if text.file_type == "video":
                temp_dir = "temp"
                os.makedirs(temp_dir, exist_ok=True)
                audio_path = os.path.join(temp_dir, f"{text.id}_audio.wav")
                cls.extract_audio(file_path, audio_path)

            # Transcribe
            if method == "local":
                text_content, detected_lang, cost = cls.transcribe_local(audio_path, language, add_timestamps)
            else:
                settings = db.query(Settings).first()
                if not settings or not settings.openai_api_key:
                    raise Exception("OpenAI API key not set")

                api_key = decrypt_api_key(settings.openai_api_key)
                text_content, detected_lang, cost = cls.transcribe_api(audio_path, api_key, language, add_timestamps)

            # Update text record with transcription result
            text.content = text_content
            text.language = detected_lang
            text.cost = cost
            text.status = "unread"  # Mark as unread after successful transcription
            db.commit()

            # Calculate duration
            try:
                audio_duration = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
                    capture_output=True,
                    text=True
                ).stdout.strip()
                text.duration = float(audio_duration)
                db.commit()
            except:
                pass

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
            text = db.query(Text).filter(Text.id == text_id).first()
            if text:
                text.status = "failed"
                text.error_message = str(e)
                db.commit()

        finally:
            db.close()

    @classmethod
    def process_youtube(cls, text_id: int, youtube_url: str, method: str, language: str, add_timestamps: bool):
        """Download YouTube video and process transcription"""
        db = SessionLocal()

        try:
            text = db.query(Text).filter(Text.id == text_id).first()
            if not text:
                return

            # Already in "processing" status from creation

            # Download video
            if config.is_demo_mode():
                video_path = MockYouTubeService.download_youtube_video(youtube_url, text_id)
            else:
                video_path = download_youtube_video(youtube_url, text_id)

            text.filename = os.path.basename(video_path)
            db.commit()

            # Process as regular video
            cls.process_transcription(text_id, video_path, method, language, add_timestamps)

        except Exception as e:
            text = db.query(Text).filter(Text.id == text_id).first()
            if text:
                text.status = "failed"
                text.error_message = str(e)
                db.commit()

        finally:
            db.close()
