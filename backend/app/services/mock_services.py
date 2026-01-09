"""
Mock services for DEMO MODE
Returns fake data without requiring API keys or model downloads
"""
import time
import random
from typing import Optional

class MockTranscriptionService:
    """Mock transcription service for demo"""

    @staticmethod
    def transcribe_local(audio_path: str, language: Optional[str] = None, add_timestamps: bool = True) -> tuple:
        """Return fake transcription"""
        time.sleep(1)  # Simulate processing

        fake_texts = [
            "Это демонстрационная транскрипция аудио файла.",
            "В демо режиме не требуется скачивать модели faster-whisper.",
            "Вы можете протестировать весь интерфейс без настройки API ключей.",
            "Это отличный способ быстро оценить функциональность приложения.",
            "Для реальной транскрибации настройте OpenAI API ключ или используйте локальную модель."
        ]

        if add_timestamps:
            full_text = []
            for i, text in enumerate(fake_texts):
                start = f"00:00:{i*5:02d},000"
                end = f"00:00:{(i+1)*5:02d},000"
                full_text.append(f"[{start}] {text}")
            text_content = "\n".join(full_text)
        else:
            text_content = " ".join(fake_texts)

        detected_lang = language if language and language != "auto" else "ru"
        cost = 0.0

        return text_content, detected_lang, cost

    @staticmethod
    def transcribe_api(audio_path: str, api_key: str, language: Optional[str] = None, add_timestamps: bool = True) -> tuple:
        """Return fake API transcription"""
        time.sleep(0.5)  # Simulate API call

        fake_texts = [
            "This is a demo transcription using mock API.",
            "No actual API calls are made in demo mode.",
            "The interface behaves as if real transcription happened.",
            "You can test all features without spending money.",
            "Add your OpenAI API key in settings for real transcription."
        ]

        if add_timestamps:
            full_text = []
            for i, text in enumerate(fake_texts):
                start = f"00:00:{i*5:02d},000"
                end = f"00:00:{(i+1)*5:02d},000"
                full_text.append(f"[{start}] {text}")
            text_content = "\n".join(full_text)
        else:
            text_content = " ".join(fake_texts)

        detected_lang = language if language and language != "auto" else "en"
        cost = 0.0  # No real cost in demo

        return text_content, detected_lang, cost


class MockLLMService:
    """Mock LLM service for demo"""

    @staticmethod
    def chat_completion(messages: list, model: str = "gpt-4") -> tuple:
        """Return fake chat response"""
        time.sleep(0.8)  # Simulate API call

        responses = [
            "Это демонстрационный ответ от AI ассистента. В демо режиме не требуется OpenAI API ключ.",
            "Я могу помочь вам с различными задачами. Это тестовый режим для демонстрации функциональности.",
            "В реальном режиме я буду использовать ChatGPT API для генерации ответов на ваши вопросы.",
            "Вы можете протестировать весь интерфейс чата без настройки API ключа.",
            "Для получения реальных ответов от AI добавьте OpenAI API ключ в настройках."
        ]

        response_text = random.choice(responses)
        tokens = len(response_text.split()) * 2  # Approximate
        cost = 0.0  # No real cost in demo

        return response_text, tokens, cost

    @staticmethod
    def chat_completion_stream(messages: list, model: str = "gpt-4"):
        """Return fake streaming response"""
        response = "Это демонстрационный стриминг ответ. В демо режиме API ключ не требуется. Вы можете протестировать весь функционал интерфейса."

        # Stream word by word
        words = response.split()
        for word in words:
            time.sleep(0.05)  # Simulate streaming delay
            yield word + " "

    @staticmethod
    def summarize(text: str, model: str = "gpt-4") -> str:
        """Return fake summary"""
        time.sleep(0.5)
        return f"📝 Краткое содержание (ДЕМО):\n\nЭто демонстрационная саммаризация текста. В реальном режиме будет использоваться ChatGPT API для создания качественной саммаризации вашего текста. Основные пункты будут выделены и структурированы.\n\nОригинальный текст содержал {len(text.split())} слов."

    @staticmethod
    def process_text(text: str, prompt: str, model: str = "gpt-4") -> str:
        """Return fake processed text"""
        time.sleep(0.5)
        return f"✨ Обработанный текст (ДЕМО):\n\nВаш промпт: '{prompt}'\n\nЭто демонстрационный результат обработки текста. В реальном режиме ChatGPT выполнит вашу инструкцию и обработает текст согласно промпту.\n\nОбработано символов: {len(text)}"

    @staticmethod
    def test_api_key(api_key: str) -> bool:
        """Always return true in demo"""
        time.sleep(0.3)
        return True

    @staticmethod
    def get_balance() -> dict:
        """Return fake balance"""
        return {
            "available": "$100.00 (DEMO)",
            "message": "Демонстрационный режим. Реальный баланс будет отображен после добавления API ключа."
        }


class MockYouTubeService:
    """Mock YouTube download for demo"""

    @staticmethod
    def download_youtube_video(url: str, transcription_id: int) -> str:
        """Simulate YouTube download"""
        import os
        time.sleep(2)  # Simulate download

        # Create fake file path
        filename = f"youtube_{transcription_id}_demo_video.wav"
        filepath = os.path.join("uploads", filename)

        # Create empty file for demo
        os.makedirs("uploads", exist_ok=True)
        with open(filepath, "wb") as f:
            f.write(b"DEMO")

        return filepath
