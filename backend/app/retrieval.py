from __future__ import annotations

import re
from decimal import Decimal

from sqlalchemy import String, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .hybrid import hybrid_search
from .models import FAQEntry, KnowledgeChunk, Location, Product
from .schemas import ProductFilters, SourceCard, SubQuestion


PRODUCT_STOP_WORDS = {
    "a", "an", "and", "any", "are", "available", "availability", "below", "can", "cost", "costs", "do", "does", "for", "from",
    "have", "in", "is", "items", "listed", "me", "of", "on", "or",
    "less", "max", "maximum", "priced", "product", "products", "show", "than", "the", "there", "to", "what", "which",
    "with", "you", "your", "find", "price", "prices", "stock", "under",
}


def tokenize(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", text.lower()) if len(token) > 1}


def lexical_score(query: str, text: str) -> float:
    q = tokenize(query)
    if not q:
        return 0
    return len(q & tokenize(text)) / len(q)


async def retrieve_products(session: AsyncSession, sub: SubQuestion, limit: int = 8) -> list[Product]:
    statement = compile_product_statement(sub, limit=40)
    result = (await session.scalars(statement)).all()
    search = sub.filters.search or sub.question
    return sorted(result, key=lambda p: lexical_score(search, p.search_document), reverse=True)[:limit]


def compile_product_statement(sub: SubQuestion, limit: int = 40):
    """Convert a validated query plan into parameterized SQLAlchemy SQL.

    The model never supplies raw SQL, column names, operators, or joins.
    """
    filters = [Product.active.is_(True), Product.price_cad > 0]
    f = sub.filters
    if f.min_price is not None:
        filters.append(Product.price_cad >= Decimal(str(f.min_price)))
    if f.max_price is not None:
        filters.append(Product.price_cad <= Decimal(str(f.max_price)))
    if f.in_stock is not None:
        filters.append(Product.in_stock.is_(f.in_stock))
    if f.collection:
        filters.append(Product.collections.cast(String).ilike(f"%{f.collection}%"))
    search = f.search or sub.question
    words = [word for word in tokenize(search) if word not in PRODUCT_STOP_WORDS]
    if words:
        filters.append(or_(*[Product.search_document.ilike(f"%{word}%") for word in words]))
    return select(Product).where(*filters).order_by(Product.in_stock.desc(), Product.price_cad.asc()).limit(limit)


async def retrieve_faqs(session: AsyncSession, sub: SubQuestion, limit: int = 6) -> list[FAQEntry]:
    filters = [FAQEntry.status == "published"]
    if sub.faq_types:
        filters.append(FAQEntry.faq_type.in_(sub.faq_types))
    faqs = (await session.scalars(select(FAQEntry).where(*filters).order_by(FAQEntry.priority.desc()))).all()
    return sorted(faqs, key=lambda faq: lexical_score(sub.question, faq.question + " " + faq.answer), reverse=True)[:limit]


async def retrieve_locations(session: AsyncSession, sub: SubQuestion, limit: int = 8) -> list[Location]:
    locations = (await session.scalars(select(Location).where(Location.active.is_(True)))).all()
    city_matches = [location for location in locations if location.city.lower() in sub.question.lower()]
    return city_matches[:limit] or locations[:limit]


async def retrieve_subquestion(session: AsyncSession, sub: SubQuestion) -> dict:
    products = await retrieve_products(session, sub) if "products" in sub.targets else []
    faqs = await retrieve_faqs(session, sub) if "faqs" in sub.targets else []
    locations = await retrieve_locations(session, sub) if "locations" in sub.targets else []
    source_types = []
    if "faqs" in sub.targets: source_types.append("faq")
    if "locations" in sub.targets: source_types.append("location")
    chunks = await hybrid_search(session, sub.question, source_types, sub.faq_types or None) if source_types else []

    faq_ids = [chunk.source_id for chunk in chunks if chunk.source_type == "faq"]
    location_ids = [chunk.source_id for chunk in chunks if chunk.source_type == "location"]
    if faq_ids:
        semantic = (await session.scalars(select(FAQEntry).where(FAQEntry.id.in_(faq_ids), FAQEntry.status == "published"))).all()
        by_id = {item.id: item for item in [*faqs, *semantic]}
        ids = list(dict.fromkeys([*[item.id for item in faqs], *faq_ids]))
        faqs = [by_id[item_id] for item_id in ids if item_id in by_id][:6]
    if location_ids:
        semantic = (await session.scalars(select(Location).where(Location.id.in_(location_ids), Location.active.is_(True)))).all()
        by_id = {item.id: item for item in [*locations, *semantic]}
        ids = list(dict.fromkeys([*[item.id for item in locations], *location_ids]))
        locations = [by_id[item_id] for item_id in ids if item_id in by_id][:8]
    sources: list[SourceCard] = []
    for product in products:
        sources.append(SourceCard(id=f"product:{product.id}", source_type="product", title=product.name, snippet=f"{product.unit or 'Unit not listed'} · ${product.price_cad} CAD · {'In stock' if product.in_stock else 'Out of stock'}", url=product.product_url))
    for faq in faqs:
        sources.append(SourceCard(id=f"faq:{faq.id}", source_type="faq", title=faq.question, snippet=faq.answer, url=faq.source_urls[0] if faq.source_urls else None))
    for location in locations:
        sources.append(SourceCard(id=f"location:{location.id}", source_type="location", title=f"{location.city} store", snippet=f"{location.address} · {location.phone}", url=location.source_url))
    return {"subquestion": sub, "products": products, "faqs": faqs, "locations": locations, "sources": sources}
