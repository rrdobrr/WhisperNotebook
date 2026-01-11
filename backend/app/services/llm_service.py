from openai import OpenAI
from typing import List, Dict
import os

from app.config import config

# Import mock service if in demo mode
if config.is_demo_mode():
    from app.services.mock_services import MockLLMService

class LLMService:
    @staticmethod
    def get_api_key() -> str:
        """Get OpenAI API key from environment variable"""
        # In demo mode, return fake key
        if config.is_demo_mode():
            return "demo-key"

        api_key = config.OPENAI_API_KEY
        if not api_key:
            raise Exception("OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.")

        return api_key

    @staticmethod
    def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
        """Calculate cost based on OpenAI pricing"""
        pricing = {
            "gpt-4": {"prompt": 0.03, "completion": 0.06},
            "gpt-4-turbo": {"prompt": 0.01, "completion": 0.03},
            "gpt-3.5-turbo": {"prompt": 0.0005, "completion": 0.0015},
            "gpt-4o": {"prompt": 0.005, "completion": 0.015},
            "gpt-4o-mini": {"prompt": 0.00015, "completion": 0.0006},
        }

        model_pricing = pricing.get(model, pricing["gpt-4"])
        cost = (prompt_tokens / 1000 * model_pricing["prompt"]) + (completion_tokens / 1000 * model_pricing["completion"])
        return cost

    @classmethod
    def chat_completion(cls, messages: List[Dict], model: str = "gpt-4") -> tuple[str, int, float]:
        """Get chat completion from OpenAI"""
        # Use mock service in demo mode
        if config.is_demo_mode():
            return MockLLMService.chat_completion(messages, model)

        api_key = cls.get_api_key()
        client = OpenAI(api_key=api_key)

        response = client.chat.completions.create(
            model=model,
            messages=messages
        )

        content = response.choices[0].message.content
        tokens = response.usage.total_tokens
        cost = cls.calculate_cost(model, response.usage.prompt_tokens, response.usage.completion_tokens)

        return content, tokens, cost

    @classmethod
    def chat_completion_stream(cls, messages: List[Dict], model: str = "gpt-4"):
        """Get streaming chat completion from OpenAI"""
        # Use mock service in demo mode
        if config.is_demo_mode():
            for chunk in MockLLMService.chat_completion_stream(messages, model):
                yield chunk
            return

        api_key = cls.get_api_key()
        client = OpenAI(api_key=api_key)

        stream = client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True
        )

        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    @classmethod
    def summarize(cls, text: str, model: str = "gpt-4", custom_prompt: str = None) -> tuple[str, int, float]:
        """Summarize text and return summary, tokens, and cost"""
        # Use mock service in demo mode
        if config.is_demo_mode():
            summary = MockLLMService.summarize(text, model)
            return summary, 0, 0.0

        # Default prompt if no custom prompt provided
        default_prompt = """Создай подробный структурированный конспект следующего текста.

КРИТИЧЕСКИ ВАЖНО - Сохранение оригинальности:
- ОБЯЗАТЕЛЬНО сохраняй все оригинальные термины, названия, понятия и специфические формулировки из текста
- НЕ ЗАМЕНЯЙ авторские выражения на обобщенные или нормализованные варианты
- Если автор использует необычные, специфические или придуманные слова - переноси их в конспект БЕЗ ИЗМЕНЕНИЙ
- Сохраняй уникальный стиль и лексику автора
- Если есть специализированная терминология - используй её точно как в оригинале

Требования к структуре конспекта:
- Выдели основные разделы и темы
- Структурируй информацию с помощью заголовков и подзаголовков
- Раскрой ключевые понятия и термины (сохраняя оригинальные формулировки)
- Сохрани важные детали и примеры
- Используй маркированные списки для перечислений
- Используй нумерованные списки для последовательностей
- Сохраняй логическую структуру оригинального текста

Ответ должен быть на русском языке, но с сохранением ВСЕХ оригинальных терминов и формулировок из исходного текста.

Текст для конспектирования:

{text}"""

        # Use custom prompt if provided, otherwise use default
        user_prompt = custom_prompt if custom_prompt else default_prompt

        messages = [
            {"role": "system", "content": "Ты полезный ассистент, который создает подробные структурированные конспекты текстов на русском языке, максимально сохраняя оригинальную терминологию и формулировки автора."},
            {"role": "user", "content": user_prompt.replace("{text}", text)}
        ]

        response, tokens, cost = cls.chat_completion(messages, model)
        return response, tokens, cost

    @classmethod
    def process_text(cls, text: str, prompt: str, model: str = "gpt-4") -> str:
        """Process text with custom prompt"""
        # Use mock service in demo mode
        if config.is_demo_mode():
            return MockLLMService.process_text(text, prompt, model)

        messages = [
            {"role": "system", "content": "You are a helpful assistant that processes text according to user instructions."},
            {"role": "user", "content": f"{prompt}\n\nText:\n{text}"}
        ]

        response, _, _ = cls.chat_completion(messages, model)
        return response


    @classmethod
    def get_balance(cls) -> dict:
        """Get OpenAI account balance and usage information"""
        # Return demo balance in demo mode
        if config.is_demo_mode():
            return MockLLMService.get_balance()

        import requests
        api_key = cls.get_api_key()

        try:
            headers = {
                "Authorization": f"Bearer {api_key}"
            }

            # Get subscription info
            subscription_response = requests.get(
                "https://api.openai.com/v1/dashboard/billing/subscription",
                headers=headers
            )

            # Get credit grants (remaining balance)
            credits_response = requests.get(
                "https://api.openai.com/v1/dashboard/billing/credit_grants",
                headers=headers
            )

            if subscription_response.status_code == 200 and credits_response.status_code == 200:
                subscription_data = subscription_response.json()
                credits_data = credits_response.json()

                # Calculate total available credits
                total_granted = sum(grant.get("granted_amount", 0) for grant in credits_data.get("grants", []))
                total_used = sum(grant.get("used_amount", 0) for grant in credits_data.get("grants", []))
                total_available = total_granted - total_used

                return {
                    "total_available": f"${total_available:.2f}",
                    "total_granted": f"${total_granted:.2f}",
                    "total_used": f"${total_used:.2f}",
                    "hard_limit": f"${subscription_data.get('hard_limit_usd', 0):.2f}",
                    "plan": subscription_data.get("plan", {}).get("title", "Unknown")
                }
            else:
                return {
                    "error": "Unable to fetch balance",
                    "message": "Please check your OpenAI dashboard for billing information."
                }
        except Exception as e:
            return {
                "error": str(e),
                "message": "Please check your OpenAI dashboard for billing information."
            }
