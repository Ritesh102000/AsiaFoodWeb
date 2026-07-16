from app.rag import enforce_source_authority, heuristic_plan
from app.hybrid import reciprocal_rank_fusion
from app.retrieval import compile_product_statement


def test_compound_query_is_split_and_filtered():
    plan = heuristic_plan("Which drinks are under $5 and can sale items be returned?")
    assert len(plan.subquestions) == 2
    assert plan.subquestions[0].filters.max_price == 5
    assert "products" in plan.subquestions[0].targets
    assert "returns" in plan.subquestions[1].faq_types


def test_location_routing():
    plan = heuristic_plan("Where is the Brampton store?")
    assert "locations" in plan.subquestions[0].targets


def test_rrf_fuses_bm25_and_qdrant_rankings():
    assert reciprocal_rank_fusion([["a", "b", "c"], ["b", "d", "a"]])[:2] == ["b", "a"]


def test_rule_layer_routes_mixed_question_to_both_sources():
    plan = enforce_source_authority(heuristic_plan("What tea is under $5 and what is the return policy?"))
    targets = {target for sub in plan.subquestions for target in sub.targets}
    assert "products" in targets
    assert "faqs" in targets


def test_query_plan_compiles_to_parameterized_database_query():
    plan = heuristic_plan("Show tea under $5 in stock")
    statement = compile_product_statement(plan.subquestions[0])
    compiled = str(statement)
    assert "products.price_cad <=" in compiled
    assert "products.in_stock IS true" in compiled
    assert "DROP TABLE" not in compiled


def test_generic_budget_query_does_not_filter_product_names_by_grammar_words():
    plan = heuristic_plan("Which products cost less than $5?")
    compiled = str(compile_product_statement(plan.subquestions[0]))
    assert "lower(products.search_document)" not in compiled
