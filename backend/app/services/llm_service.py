import openai
from typing import List, Dict
import os

from app.database import SessionLocal, Settings, Cost
from app.services.encryption_service import decrypt_api_key
from app.config import config

# Import mock service if in demo mode
if config.is_demo_mode():
    from app.services.mock_services import MockLLMService

class LLMService:
    @staticmethod
    def get_api_key() -> str:
        """Get OpenAI API key from settings"""
        # In demo mode, return fake key
        if config.is_demo_mode():
            return "demo-key"

        db = SessionLocal()
        try:
            settings = db.query(Settings).first()
            if not settings or not settings.openai_api_key:
                raise Exception("OpenAI API key not configured. Please add it in settings.")

            return decrypt_api_key(settings.openai_api_key)
        finally:
            db.close()

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
        openai.api_key = api_key

        response = openai.ChatCompletion.create(
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
        openai.api_key = api_key

        response = openai.ChatCompletion.create(
            model=model,
            messages=messages,
            stream=True
        )

        for chunk in response:
            if chunk.choices[0].delta.get("content"):
                yield chunk.choices[0].delta.content

    @classmethod
    def summarize(cls, text: str, model: str = "gpt-4") -> str:
        """Summarize text"""
        # Use mock service in demo mode
        if config.is_demo_mode():
            return MockLLMService.summarize(text, model)

        messages = [
            {"role": "system", "content": "You are a helpful assistant that summarizes text concisely and accurately."},
            {"role": "user", "content": f"Please provide a concise summary of the following text:\n\n{text}"}
        ]

        response, _, _ = cls.chat_completion(messages, model)
        return response

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
    def test_api_key(cls, api_key: str) -> bool:
        """Test if API key is valid"""
        # Always return true in demo mode
        if config.is_demo_mode():
            return MockLLMService.test_api_key(api_key)

        try:
            openai.api_key = api_key
            openai.Model.list()
            return True
        except Exception:
            return False

    @classmethod
    def get_balance(cls) -> dict:
        """Get OpenAI account balance"""
        # Return demo balance in demo mode
        if config.is_demo_mode():
            return MockLLMService.get_balance()

        api_key = cls.get_api_key()
        openai.api_key = api_key

        try:
            # Note: OpenAI API doesn't provide balance endpoint directly
            # This is a placeholder - you might need to use billing API or dashboard
            return {
                "available": "N/A",
                "message": "Balance information not available via API. Please check your OpenAI dashboard."
            }
        except Exception as e:
            raise Exception(f"Failed to get balance: {str(e)}")
