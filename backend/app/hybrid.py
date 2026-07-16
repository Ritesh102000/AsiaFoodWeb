import re
from collections import defaultdict

from rank_bm25 import BM25Okapi
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .embeddings import embedding_service
from .models import KnowledgeChunk
from .vector_store import qdrant_store


def tokens(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", value.lower())


def reciprocal_rank_fusion(rankings: list[list[str]], k: int = 60) -> list[str]:
    scores: dict[str, float] = defaultdict(float)
    for ranking in rankings:
        for rank, item_id in enumerate(ranking, start=1):
            scores[item_id] += 1.0 / (k + rank)
    return [item_id for item_id, _ in sorted(scores.items(), key=lambda item: item[1], reverse=True)]


async def hybrid_search(
    session: AsyncSession,
    query: str,
    source_types: list[str],
    faq_types: list[str] | None = None,
    limit: int = 12,
) -> list[KnowledgeChunk]:
    chunks = (await session.scalars(
        select(KnowledgeChunk).where(
            KnowledgeChunk.active.is_(True), KnowledgeChunk.source_type.in_(source_types)
        )
    )).all()
    if faq_types:
        chunks = [chunk for chunk in chunks if chunk.extra_metadata.get("faq_type") in faq_types]
    if not chunks:
        return []

    bm25 = BM25Okapi([tokens(chunk.content) for chunk in chunks])
    scores = bm25.get_scores(tokens(query))
    bm25_ids = [
        chunks[index].id
        for index in sorted(range(len(chunks)), key=lambda index: scores[index], reverse=True)[: max(limit * 2, 20)]
    ]

    dense_ids: list[str] = []
    vector = (await embedding_service.embed([query]))[0]
    if vector is not None:
        try:
            dense_ids = [item_id for item_id, _ in await qdrant_store.search(
                vector, source_types, faq_types, max(limit * 2, 20)
            )]
        except Exception:
            dense_ids = []

    ordered_ids = reciprocal_rank_fusion([bm25_ids, dense_ids])[:limit]
    by_id = {chunk.id: chunk for chunk in chunks}
    return [by_id[item_id] for item_id in ordered_ids if item_id in by_id]
