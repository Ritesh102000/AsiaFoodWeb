from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    ARRAY,
    Column,
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    type_annotation_map = {dict: JSON, list[str]: JSON}


product_categories = Table(
    "product_categories",
    Base.metadata,
    Column("product_id", ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), index=True)
    name: Mapped[str] = mapped_column(String(180), index=True)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    url: Mapped[str] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(300), index=True)
    normalized_name: Mapped[str] = mapped_column(String(300), index=True)
    unit: Mapped[str | None] = mapped_column(String(80))
    price_cad: Mapped[Decimal] = mapped_column(Numeric(10, 2), index=True)
    special_price_cad: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    order_limit: Mapped[int] = mapped_column(Integer, default=0)
    product_url: Mapped[str] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text)
    collections: Mapped[list[str]] = mapped_column(JSON, default=list)
    search_document: Mapped[str] = mapped_column(Text, default="")
    source_fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    categories: Mapped[list[Category]] = relationship(secondary=product_categories)


class Location(Base):
    __tablename__ = "locations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    city: Mapped[str] = mapped_column(String(120), index=True)
    address: Mapped[str] = mapped_column(Text)
    phone: Mapped[str] = mapped_column(String(40))
    fax: Mapped[list[str]] = mapped_column(JSON, default=list)
    source_url: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class FAQEntry(Base):
    __tablename__ = "faq_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    faq_type: Mapped[str] = mapped_column(String(40), index=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    city: Mapped[str | None] = mapped_column(String(120), index=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), index=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="published", index=True)
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    source_urls: Mapped[list[str]] = mapped_column(JSON, default=list)
    extra_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    language: Mapped[str] = mapped_column(String(10), default="en", index=True)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_type: Mapped[str] = mapped_column(String(20), index=True)
    source_id: Mapped[str] = mapped_column(String(64), index=True)
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    extra_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class SyncRun(Base):
    __tablename__ = "sync_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status: Mapped[str] = mapped_column(String(20), default="running", index=True)
    source: Mapped[str] = mapped_column(String(120), default="afcgrocery.com")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    counts: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
