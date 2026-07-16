from __future__ import annotations

import json
from decimal import Decimal

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import String, select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import COOKIE_NAME, create_session, require_admin, verify_credentials
from .config import get_settings
from .db import get_session
from .ingest import content_hash, refresh_and_import, upsert_chunk
from .models import Category, FAQEntry, Location, Product, SyncRun
from .rag import orchestrator
from .schemas import (
    AdminLogin, CategoryOut, ChatRequest, ChatResponse, FAQCreate, FAQOut, FAQUpdate,
    LocationOut, ProductOut,
)


settings = get_settings()


app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/products", response_model=list[ProductOut])
async def products(
    search: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    in_stock: bool | None = None,
    collection: str | None = None,
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    conditions = [Product.active.is_(True)]
    if search:
        conditions.append(Product.search_document.ilike(f"%{search}%"))
    if min_price is not None: conditions.append(Product.price_cad >= Decimal(str(min_price)))
    if max_price is not None: conditions.append(Product.price_cad <= Decimal(str(max_price)))
    if in_stock is not None: conditions.append(Product.in_stock.is_(in_stock))
    if collection: conditions.append(Product.collections.cast(String).ilike(f"%{collection}%"))
    return (await session.scalars(select(Product).where(*conditions).order_by(Product.name).offset(offset).limit(limit))).all()


@app.get("/api/products/{product_id}", response_model=ProductOut)
async def product(product_id: int, session: AsyncSession = Depends(get_session)):
    item = await session.get(Product, product_id)
    if not item or not item.active: raise HTTPException(404, "Product not found")
    return item


@app.get("/api/categories", response_model=list[CategoryOut])
async def categories(session: AsyncSession = Depends(get_session)):
    return (await session.scalars(select(Category).where(Category.active.is_(True)).order_by(Category.name))).all()


@app.get("/api/locations", response_model=list[LocationOut])
async def locations(session: AsyncSession = Depends(get_session)):
    return (await session.scalars(select(Location).where(Location.active.is_(True)).order_by(Location.city, Location.address))).all()


@app.post("/api/chat")
async def chat(payload: ChatRequest):
    async def stream():
        yield f"event: status\ndata: {json.dumps({'stage': 'planning'})}\n\n"
        try:
            answer = await orchestrator.answer(payload)
        except Exception:
            answer = ChatResponse(
                answer="The AFC assistant is temporarily unavailable. Please try again shortly.",
                answer_parts=[],
                sources=[],
                product_cards=[],
                filters_applied=[],
                confidence="low",
            )
        yield f"event: result\ndata: {answer.model_dump_json()}\n\n"
        yield "event: done\ndata: {}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.post("/api/admin/login")
async def admin_login(payload: AdminLogin, response: Response):
    if not verify_credentials(payload.username, payload.password):
        raise HTTPException(401, "Invalid username or password")
    response.set_cookie(
        COOKIE_NAME,
        create_session(),
        httponly=True,
        secure=settings.secure_cookies,
        samesite=settings.session_cookie_samesite,
        max_age=60 * 60 * 8,
    )
    return {"authenticated": True}


@app.post("/api/admin/logout")
async def admin_logout(response: Response):
    response.delete_cookie(
        COOKIE_NAME,
        secure=settings.secure_cookies,
        samesite=settings.session_cookie_samesite,
    )
    return {"authenticated": False}


@app.get("/api/admin/faqs", response_model=list[FAQOut], dependencies=[Depends(require_admin)])
async def list_faqs(faq_type: str | None = None, status: str | None = None, session: AsyncSession = Depends(get_session)):
    conditions = []
    if faq_type: conditions.append(FAQEntry.faq_type == faq_type)
    if status: conditions.append(FAQEntry.status == status)
    return (await session.scalars(select(FAQEntry).where(*conditions).order_by(FAQEntry.updated_at.desc()))).all()


async def save_faq(session: AsyncSession, faq: FAQEntry, payload: FAQCreate | FAQUpdate):
    values = payload.model_dump()
    for key, value in values.items(): setattr(faq, key, value)
    faq.content_hash = content_hash(faq.question + faq.answer)
    session.add(faq); await session.flush()
    await upsert_chunk(session, "faq", faq.id, f"Question: {faq.question}\nAnswer: {faq.answer}", {"faq_type": faq.faq_type, "tags": faq.tags, "source_urls": faq.source_urls})
    await session.commit(); await session.refresh(faq)
    return faq


@app.post("/api/admin/faqs", response_model=FAQOut, dependencies=[Depends(require_admin)])
async def create_faq(payload: FAQCreate, session: AsyncSession = Depends(get_session)):
    return await save_faq(session, FAQEntry(), payload)


@app.put("/api/admin/faqs/{faq_id}", response_model=FAQOut, dependencies=[Depends(require_admin)])
async def update_faq(faq_id: str, payload: FAQUpdate, session: AsyncSession = Depends(get_session)):
    faq = await session.get(FAQEntry, faq_id)
    if not faq: raise HTTPException(404, "FAQ not found")
    return await save_faq(session, faq, payload)


@app.delete("/api/admin/faqs/{faq_id}", dependencies=[Depends(require_admin)])
async def delete_faq(faq_id: str, session: AsyncSession = Depends(get_session)):
    faq = await session.get(FAQEntry, faq_id)
    if not faq: raise HTTPException(404, "FAQ not found")
    faq.status = "archived"; await session.commit()
    return {"archived": True}


@app.post("/api/admin/sync", dependencies=[Depends(require_admin)])
async def start_sync():
    # Serverless functions cannot safely leave background tasks running after
    # returning. Complete the idempotent sync inside this invocation instead.
    return await refresh_and_import()


@app.get("/api/admin/sync/{task_id}", dependencies=[Depends(require_admin)])
async def sync_status(task_id: str, session: AsyncSession = Depends(get_session)):
    run = await session.get(SyncRun, task_id)
    if not run:
        raise HTTPException(404, "Sync run not found")
    return {
        "id": run.id,
        "status": run.status,
        "counts": run.counts,
        "error": run.error,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
    }
