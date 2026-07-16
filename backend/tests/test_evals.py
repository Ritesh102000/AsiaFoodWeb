import json
from pathlib import Path

from app.rag import enforce_source_authority, heuristic_plan


def test_eval_set_has_40_or_more_questions_and_expected_routes():
    questions = json.loads((Path(__file__).parents[1] / "evals" / "questions.json").read_text())
    assert len(questions) >= 40
    for item in questions:
        plan = enforce_source_authority(heuristic_plan(item["query"]))
        actual = {target for sub in plan.subquestions for target in sub.targets}
        assert set(item["routes"]).issubset(actual), item["id"]
