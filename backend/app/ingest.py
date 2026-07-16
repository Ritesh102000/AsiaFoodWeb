from __future__ import annotations

import asyncio
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import SessionLocal
from .embeddings import embedding_service
from .models import Category, FAQEntry, KnowledgeChunk, Location, Product, SyncRun
from .vector_store import qdrant_store


TOPIC_TO_TYPE = {
    "about": "brand", "assortment": "assortment", "specials": "promotions",
    "delivery": "delivery", "pickup": "pickup", "locations": "locations",
    "returns": "returns", "product_availability": "product_availability",
    "contact": "contact", "customer_accounts": "accounts", "book_a_time": "accounts",
    "careers": "careers", "mobile_apps": "service_status", "social_media": "service_status",
    "covid_pages": "service_status", "terms": "legal", "service_disclaimer": "legal",
    "termination": "legal", "legal_liability": "legal",
}


def content_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def flatten_categories(items: list[dict], parent_id: int | None = None):
    for item in items:
        yield item, parent_id
        yield from flatten_categories(item.get("children", []), item["id"])


async def upsert_chunk(
    session: AsyncSession, source_type: str, source_id: str, content: str, metadata: dict
) -> bool:
    digest = content_hash(f"{source_type}:{source_id}:{content}")
    existing = await session.scalar(select(KnowledgeChunk).where(KnowledgeChunk.source_type == source_type, KnowledgeChunk.source_id == source_id))
    if existing and existing.content_hash == digest:
        existing.active = True
        existing.extra_metadata = metadata
        return False
    if existing:
        existing.content = content
        existing.content_hash = digest
        existing.extra_metadata = metadata
        existing.active = True
    else:
        existing = KnowledgeChunk(
            source_type=source_type, source_id=source_id, content=content,
            content_hash=digest, extra_metadata=metadata,
        )
        session.add(existing)
    await session.flush()
    vector = (await embedding_service.embed([content]))[0]
    await qdrant_store.upsert(
        existing.id,
        vector,
        {"source_type": source_type, "source_id": source_id, **metadata},
    )
    return True


async def import_snapshot(session: AsyncSession, data_dir: Path | None = None) -> dict:
    data_dir = data_dir or get_settings().data_dir
    manifest = read_json(data_dir / "manifest.json")
    fetched_at = datetime.fromisoformat(manifest["fetched_at"])
    counts = {"categories": 0, "products": 0, "locations": 0, "faqs": 0, "embedded": 0}

    category_ids: set[int] = set()
    for item, parent_id in flatten_categories(read_json(data_dir / "categories.json")):
        category_ids.add(item["id"])
        category = await session.get(Category, item["id"]) or Category(id=item["id"])
        category.parent_id = parent_id
        category.name = item["name"]
        category.slug = item["slug"]
        category.url = item["url"]
        category.image_url = item.get("image_url")
        category.active = True
        session.add(category)
        counts["categories"] += 1
    for category in (await session.scalars(select(Category))).all():
        if category.id not in category_ids:
            category.active = False

    product_ids: set[int] = set()
    for item in read_json(data_dir / "products.json"):
        product_ids.add(item["id"])
        product = await session.get(Product, item["id"]) or Product(id=item["id"])
        product.name = item["name"]
        product.normalized_name = re.sub(r"[^a-z0-9]+", " ", item["name"].lower()).strip()
        product.unit = item.get("unit")
        product.price_cad = item["price_cad"]
        product.special_price_cad = item["special_price_cad"]
        product.in_stock = item["in_stock"]
        product.order_limit = item["order_limit"]
        product.product_url = item["product_url"]
        product.image_url = item.get("image_url")
        product.collections = item.get("collections", [])
        product.search_document = " ".join(filter(None, [item["name"], item.get("unit"), *item.get("collections", [])]))
        product.source_fetched_at = fetched_at
        product.active = True
        session.add(product)
        counts["products"] += 1
    for product in (await session.scalars(select(Product))).all():
        if product.id not in product_ids:
            product.active = False

    # Product facts belong only to PostgreSQL. Qdrant/BM25 is reserved for
    # general knowledge so prices and stock can never become stale vector facts.
    for chunk in (await session.scalars(select(KnowledgeChunk).where(KnowledgeChunk.source_type == "product"))).all():
        chunk.active = False

    location_ids: set[str] = set()
    for item in read_json(data_dir / "locations.json"):
        location_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"afc-location:{item['address'].lower()}"))
        location_ids.add(location_id)
        location = await session.get(Location, location_id) or Location(id=location_id)
        location.city = item["city"]
        location.address = item["address"]
        location.phone = item["phone"]
        location.fax = item["fax"]
        location.source_url = item["source_url"]
        location.active = True
        session.add(location)
        await session.flush()
        counts["locations"] += 1
        changed = await upsert_chunk(
            session, "location", location.id,
            f"Asian Food Centre {item['city']} location: {item['address']}. Phone {item['phone']}.",
            {"city": item["city"], "url": item["source_url"]},
        )
        counts["embedded"] += int(changed)
    for location in (await session.scalars(select(Location))).all():
        if location.id not in location_ids:
            location.active = False
    for chunk in (await session.scalars(select(KnowledgeChunk).where(KnowledgeChunk.source_type == "location"))).all():
        if chunk.source_id not in location_ids:
            chunk.active = False
            await qdrant_store.delete(chunk.id)

    existing_faqs = {(faq.extra_metadata or {}).get("topic"): faq for faq in (await session.scalars(select(FAQEntry))).all() if (faq.extra_metadata or {}).get("seeded")}
    for item in read_json(data_dir / "knowledge_base.json")["facts"]:
        topic = item["topic"]
        question = f"What should customers know about {topic.replace('_', ' ')}?"
        digest = content_hash(question + item["answer"])
        faq = existing_faqs.get(topic) or FAQEntry()
        faq.question = question
        faq.answer = item["answer"]
        faq.faq_type = TOPIC_TO_TYPE.get(topic, "other")
        faq.tags = [topic]
        faq.status = "published"
        faq.source_urls = item["source_urls"]
        faq.extra_metadata = {"topic": topic, "seeded": True}
        faq.language = "en"
        faq.content_hash = digest
        session.add(faq)
        await session.flush()
        counts["faqs"] += 1
        changed = await upsert_chunk(
            session, "faq", faq.id, f"Question: {question}\nAnswer: {item['answer']}",
            {"faq_type": faq.faq_type, "tags": faq.tags, "source_urls": faq.source_urls},
        )
        counts["embedded"] += int(changed)

    await session.commit()
    return counts


async def run_import() -> dict:
    async with SessionLocal() as session:
        run = SyncRun(status="running")
        session.add(run)
        await session.commit()
        try:
            counts = await import_snapshot(session)
            run.status = "completed"
            run.counts = counts
            run.finished_at = datetime.now(timezone.utc)
            await session.commit()
            return {"id": run.id, "status": run.status, "counts": counts}
        except Exception as exc:
            await session.rollback()
            run.status = "failed"
            run.error = str(exc)
            run.finished_at = datetime.now(timezone.utc)
            session.add(run)
            await session.commit()
            raise


async def refresh_and_import() -> dict:
    """Refresh the public snapshot when the scraper is available, then upsert it."""
    scraper = Path(__file__).resolve().parents[2] / "scripts" / "scrape_afc.py"
    if scraper.exists():
        process = await asyncio.create_subprocess_exec(
            "python3", str(scraper),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()
        if process.returncode:
            raise RuntimeError(f"AFC scraper failed: {stderr.decode(errors='replace')[-500:]}")
    return await run_import()


if __name__ == "__main__":
    print(asyncio.run(run_import()))
