import os
import yt_dlp
import re
import unicodedata

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

def download_youtube_video(url: str, transcription_id: int) -> str:
    """Download YouTube video and return path"""

    output_dir = "uploads"
    os.makedirs(output_dir, exist_ok=True)

    # Use a safe template without special characters
    output_template = os.path.join(output_dir, f"youtube_{transcription_id}_temp.%(ext)s")

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
        temp_filename = ydl.prepare_filename(info)

        # Change extension to wav
        temp_filename = temp_filename.rsplit('.', 1)[0] + '.wav'

        # Get video title and sanitize it
        video_title = info.get('title', 'video')
        safe_title = sanitize_filename(video_title)

        # Create final filename with sanitized title
        final_filename = os.path.join(output_dir, f"youtube_{transcription_id}_{safe_title}.wav")

        # Rename temp file to final name
        if os.path.exists(temp_filename):
            os.rename(temp_filename, final_filename)
            return final_filename

        return temp_filename
