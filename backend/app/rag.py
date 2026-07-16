from __future__ import annotations

import asyncio
import hashlib
import json
import re

from openai import AsyncOpenAI

from .config import get_settings
from .db import SessionLocal
from .retrieval import retrieve_subquestion
from .schemas import ChatRequest, ChatResponse, ProductFilters, QueryPlan, SubQuestion


FAQ_HINTS = {
    "return": "returns", "refund": "returns", "delivery": "delivery", "deliver": "delivery",
    "pickup": "pickup", "location": "locations", "store": "locations", "career": "careers",
    "job": "careers", "contact": "contact", "phone": "contact", "account": "accounts",
    "legal": "legal", "terms": "legal", "sale": "promotions",
}


def heuristic_plan(message: str) -> QueryPlan:
    parts = [part.strip(" ?.!") for part in re.split(r"\?|\band\b|;", message, flags=re.I) if part.strip(" ?.!")]
    subquestions = []
    for part in parts[:5] or [message]:
        lower = part.lower()
        faq_types = sorted({value for key, value in FAQ_HINTS.items() if key in lower})
        product_signal = any(token in lower for token in ["product", "price", "$", "under", "stock", "drink", "juice", "rice", "pickle", "tea", "food", "show", "which"])
        location_signal = any(token in lower for token in ["location", "store", "brampton", "etobicoke", "mississauga", "address"])
        targets = []
        if product_signal: targets.append("products")
        if faq_types: targets.append("faqs")
        if location_signal: targets.append("locations")
        if not targets: targets = ["faqs", "products"]
        max_price = None
        price = re.search(r"(?:under|below|less than|up to)\s*\$?\s*(\d+(?:\.\d+)?)", lower)
        if price: max_price = float(price.group(1))
        search = re.sub(r"\b(under|below|less than|up to|in stock|products?|show me|which|what|do you have)\b|\$?\d+(?:\.\d+)?", " ", lower)
        search = " ".join(search.split()) or None
        subquestions.append(SubQuestion(
            question=part,
            targets=targets,
            faq_types=faq_types,
            filters=ProductFilters(search=search, max_price=max_price, in_stock=True if "in stock" in lower else None),
        ))
    return QueryPlan(intent="compound" if len(subquestions) > 1 else "single", subquestions=subquestions)


def enforce_source_authority(plan: QueryPlan) -> QueryPlan:
    """Rule layer: items use PostgreSQL; general facts use the Qdrant/BM25 KB."""
    product_terms = {"product", "item", "price", "cost", "stock", "available", "drink", "juice", "rice", "pickle", "tea", "food", "oil", "flour", "atta", "under", "cheapest"}
    general_terms = set(FAQ_HINTS)
    for sub in plan.subquestions:
        words = set(re.findall(r"[a-z0-9]+", sub.question.lower()))
        targets = set(sub.targets)
        if words & product_terms:
            targets.add("products")
        if words & general_terms or sub.faq_types:
            targets.add("faqs")
        if words & {"location", "store", "address", "brampton", "etobicoke", "mississauga"}:
            targets.add("locations")
        sub.targets = [target for target in ("products", "faqs", "locations") if target in targets]
    return plan


class RAGOrchestrator:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = AsyncOpenAI(api_key=self.settings.openai_api_key) if self.settings.openai_api_key else None

    async def plan(self, request: ChatRequest) -> QueryPlan:
        if not self.client:
            return enforce_source_authority(heuristic_plan(request.message))
        try:
            response = await self.client.responses.parse(
                model=self.settings.openai_chat_model,
                reasoning={"effort": "low"},
                store=False,
                safety_identifier=hashlib.sha256(request.session_id.encode()).hexdigest()[:32],
                input=[
                    {"role": "system", "content": "Plan retrieval for an AFC grocery assistant. Split compound requests into at most five independently answerable questions. Use products for catalog/price/stock, faqs for policies/brand/service, and locations for store details. Extract exact price, stock, collection, and search filters. Return empty filters rather than inventing values."},
                    {"role": "user", "content": request.message},
                ],
                text_format=QueryPlan,
            )
            return enforce_source_authority(response.output_parsed or heuristic_plan(request.message))
        except Exception:
            return enforce_source_authority(heuristic_plan(request.message))

    async def answer(self, request: ChatRequest) -> ChatResponse:
        plan = await self.plan(request)
        if plan.needs_clarification and plan.clarification_question:
            return ChatResponse(answer=plan.clarification_question, answer_parts=[], sources=[], product_cards=[], filters_applied=[], confidence="low", needs_clarification=True)
        # AsyncSession cannot service concurrent statements. Give every parallel
        # retrieval branch its own short-lived session/connection.
        async def retrieve_branch(subquestion: SubQuestion):
            async with SessionLocal() as branch_session:
                return await retrieve_subquestion(branch_session, subquestion)

        results = await asyncio.gather(*(retrieve_branch(sub) for sub in plan.subquestions))
        sources = []
        products = []
        seen_sources, seen_products = set(), set()
        answer_parts = []
        for result in results:
            for source in result["sources"]:
                if source.id not in seen_sources:
                    sources.append(source); seen_sources.add(source.id)
            for product in result["products"]:
                if product.id not in seen_products:
                    products.append(product); seen_products.add(product.id)
            facts = [source.snippet for source in result["sources"][:8]]
            answer_parts.append({"question": result["subquestion"].question, "evidence": facts, "source_ids": [source.id for source in result["sources"][:8]]})

        if not sources:
            return ChatResponse(answer="I couldn't find that in AFC's current product or FAQ data. Please contact the store at +1 416-740-3262 for confirmation.", answer_parts=answer_parts, sources=[], product_cards=[], filters_applied=[sub.filters.model_dump(exclude_none=True) for sub in plan.subquestions], confidence="low")

        if self.client:
            try:
                evidence = "\n".join(f"[{source.id}] {source.title}: {source.snippet}" for source in sources[:20])
                response = await self.client.responses.create(
                    model=self.settings.openai_chat_model,
                    reasoning={"effort": "low"}, store=False,
                    safety_identifier=hashlib.sha256(request.session_id.encode()).hexdigest()[:32],
                    input=[
                        {"role": "system", "content": "Answer only from the supplied AFC evidence. Cover every part of a compound question. Cite factual sentences with source ids in square brackets. Never invent prices, stock, delivery details, or policy exceptions. If evidence for a part is missing, say so and suggest contacting AFC."},
                        {"role": "user", "content": f"Question: {request.message}\n\nEvidence:\n{evidence}"},
                    ],
                )
                answer = response.output_text
            except Exception:
                answer = self._fallback_answer(answer_parts, sources)
        else:
            answer = self._fallback_answer(answer_parts, sources)
        confidence = "high" if all(part["source_ids"] for part in answer_parts) else "medium"
        return ChatResponse(answer=answer, answer_parts=answer_parts, sources=sources, product_cards=products[:8], filters_applied=[sub.filters.model_dump(exclude_none=True) for sub in plan.subquestions], confidence=confidence)

    @staticmethod
    def _fallback_answer(parts: list[dict], sources: list) -> str:
        output = []
        for part in parts:
            if part["evidence"]:
                evidence = part["evidence"][:4]
                refs = " ".join(f"[{sid}]" for sid in part["source_ids"][:4])
                output.append(f"{part['question']}: " + "; ".join(evidence) + f" {refs}")
            else:
                output.append(f"{part['question']}: I couldn't find this in the current AFC data.")
        return "\n\n".join(output)


orchestrator = RAGOrchestrator()
