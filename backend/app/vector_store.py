from qdrant_client import AsyncQdrantClient, models

from .config import get_settings


class QdrantStore:
    def __init__(self) -> None:
        settings = get_settings()
        self.collection = settings.qdrant_collection
        self.client = AsyncQdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key or None,
        )

    async def ensure_collection(self) -> None:
        if await self.client.collection_exists(self.collection):
            return
        await self.client.create_collection(
            collection_name=self.collection,
            vectors_config=models.VectorParams(size=1536, distance=models.Distance.COSINE),
        )
        await self.client.create_payload_index(
            collection_name=self.collection,
            field_name="source_type",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )
        await self.client.create_payload_index(
            collection_name=self.collection,
            field_name="faq_type",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )

    async def upsert(self, point_id: str, vector: list[float] | None, payload: dict) -> None:
        if vector is None:
            return
        await self.ensure_collection()
        await self.client.upsert(
            collection_name=self.collection,
            points=[models.PointStruct(id=point_id, vector=vector, payload=payload)],
            wait=True,
        )

    async def delete(self, point_id: str) -> None:
        try:
            if not await self.client.collection_exists(self.collection):
                return
            await self.client.delete(
                collection_name=self.collection,
                points_selector=models.PointIdsList(points=[point_id]),
                wait=True,
            )
        except Exception:
            # PostgreSQL remains authoritative for chunk activity. A temporary
            # vector-store cleanup failure must not corrupt relational sync.
            return

    async def search(
        self,
        vector: list[float],
        source_types: list[str],
        faq_types: list[str] | None = None,
        limit: int = 20,
    ) -> list[tuple[str, float]]:
        await self.ensure_collection()
        must: list[models.Condition] = [
            models.FieldCondition(key="source_type", match=models.MatchAny(any=source_types))
        ]
        if faq_types:
            must.append(models.FieldCondition(key="faq_type", match=models.MatchAny(any=faq_types)))
        result = await self.client.query_points(
            collection_name=self.collection,
            query=vector,
            query_filter=models.Filter(must=must),
            limit=limit,
            with_payload=False,
        )
        return [(str(point.id), float(point.score)) for point in result.points]


qdrant_store = QdrantStore()
