from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


FAQ_TYPES = (
    "brand", "assortment", "promotions", "delivery", "pickup", "returns",
    "locations", "product_availability", "accounts", "careers", "legal",
    "service_status", "contact", "other",
)
FAQType = Literal[
    "brand", "assortment", "promotions", "delivery", "pickup", "returns",
    "locations", "product_availability", "accounts", "careers", "legal",
    "service_status", "contact", "other",
]


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    unit: str | None
    price_cad: Decimal
    special_price_cad: Decimal
    in_stock: bool
    order_limit: int
    product_url: str
    image_url: str | None
    collections: list[str]
    active: bool


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parent_id: int | None
    name: str
    slug: str
    url: str
    image_url: str | None


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    city: str
    address: str
    phone: str
    fax: list[str]
    source_url: str


class FAQBase(BaseModel):
    question: str = Field(min_length=3)
    answer: str = Field(min_length=3)
    faq_type: FAQType
    tags: list[str] = []
    city: str | None = None
    category_id: int | None = None
    product_id: int | None = None
    priority: int = 0
    status: Literal["draft", "published", "archived"] = "published"
    valid_from: date | None = None
    valid_to: date | None = None
    source_urls: list[str] = []
    extra_metadata: dict = {}
    language: str = "en"


class FAQCreate(FAQBase):
    pass


class FAQUpdate(FAQBase):
    pass


class FAQOut(FAQBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    updated_at: datetime


class AdminLogin(BaseModel):
    username: str
    password: str


class ProductFilters(BaseModel):
    search: str | None = None
    min_price: float | None = None
    max_price: float | None = None
    in_stock: bool | None = None
    collection: str | None = None
    category: str | None = None


class SubQuestion(BaseModel):
    question: str
    targets: list[Literal["products", "faqs", "locations"]]
    faq_types: list[FAQType] = []
    filters: ProductFilters = ProductFilters()


class QueryPlan(BaseModel):
    language: str = "en"
    intent: str
    subquestions: list[SubQuestion] = Field(min_length=1, max_length=5)
    needs_clarification: bool = False
    clarification_question: str | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    session_id: str = Field(min_length=8, max_length=100)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=12)


class SourceCard(BaseModel):
    id: str
    source_type: str
    title: str
    snippet: str
    url: str | None = None


class ChatResponse(BaseModel):
    answer: str
    answer_parts: list[dict]
    sources: list[SourceCard]
    product_cards: list[ProductOut]
    filters_applied: list[dict]
    confidence: Literal["high", "medium", "low"]
    needs_clarification: bool = False
