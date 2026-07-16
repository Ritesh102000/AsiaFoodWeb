import asyncio

from openai import AsyncOpenAI

from .config import get_settings


class EmbeddingService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = AsyncOpenAI(api_key=self.settings.openai_api_key) if self.settings.openai_api_key else None

    async def embed(self, texts: list[str]) -> list[list[float] | None]:
        if not texts:
            return []
        if not self.client:
            return [None for _ in texts]
        response = await self.client.embeddings.create(
            model=self.settings.openai_embedding_model,
            input=texts,
            encoding_format="float",
        )
        return [item.embedding for item in sorted(response.data, key=lambda item: item.index)]


embedding_service = EmbeddingService()
