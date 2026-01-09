import os
import yt_dlp

def download_youtube_video(url: str, transcription_id: int) -> str:
    """Download YouTube video and return path"""

    output_dir = "uploads"
    os.makedirs(output_dir, exist_ok=True)

    output_template = os.path.join(output_dir, f"youtube_{transcription_id}_%(title)s.%(ext)s")

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': output_template,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
        }],
        'quiet': True,
        'no_warnings': True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)

        # Change extension to wav
        filename = filename.rsplit('.', 1)[0] + '.wav'

    return filename
