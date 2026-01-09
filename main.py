
import os
import subprocess
import torch
from pydub import AudioSegment
from faster_whisper import WhisperModel
from datetime import timedelta
from tqdm import tqdm

# === НАСТРОЙКИ ===
videos_folder = "videos"
audio_temp = "temp_audio.wav"

# === Извлечение аудио ===
def extract_audio(video_path, out_wav="temp_audio.wav", sr=16000):
    if not os.path.isfile(video_path):
        raise FileNotFoundError(f"Файл не найден: {video_path}")
    command = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-ac", "1",
        "-ar", str(sr),
        "-vn",
        out_wav
    ]
    subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return out_wav

# === Форматирование времени ===
def format_timestamp(seconds):
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

# === Основной код ===

print("🔧 Загружаем модель large-v2 для транскрипции...")
model = WhisperModel(
    "large-v2",
    device="cpu",
    compute_type="int8"
)

# Поиск всех видеофайлов
video_files = []
for root, _, files in os.walk(videos_folder):
    for file in files:
        if file.lower().endswith((".mp4", ".mkv", ".mov", ".avi")):
            video_files.append(os.path.join(root, file))

if not video_files:
    print("❌ Нет видеофайлов в папке 'videos/'")
    exit(1)

print(f"🎬 Найдено {len(video_files)} видеофайлов. Начинаем обработку...")

for video_path in video_files:
    base_name = os.path.splitext(os.path.basename(video_path))[0]
    output_srt = os.path.join(os.path.dirname(video_path), f"{base_name}.srt")

    print(f"\n🎥 Обрабатываем файл: {video_path}")
    extract_audio(video_path, audio_temp)

    segments, _ = model.transcribe(audio_temp, language="ru", beam_size=1)

    subs = []
    segment_id = 1

    for segment in segments:
        start = format_timestamp(segment.start)
        end = format_timestamp(segment.end)
        text = segment.text.strip()

        print(f"[{start} --> {end}] {text}")

        subs.append((segment_id, start, end, text))
        segment_id += 1

    with open(output_srt, "w", encoding="utf-8") as f:
        for i, start, end, text in subs:
            f.write(f"{i}\n{start} --> {end}\n{text}\n\n")

    print(f"✅ Субтитры сохранены в: {output_srt}")

# Очистка временного аудиофайла
if os.path.exists(audio_temp):
    os.remove(audio_temp)

print("\n🏁 Обработка всех файлов завершена!")



