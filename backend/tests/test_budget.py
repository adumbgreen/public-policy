import pytest

from app.budget import Baseline, Effect, estimate
from app.schemas import ScenarioDefinition

YEARS = [2026, 2027, 2028]


def baseline(**lines):
    return Baseline(
        revenue={2026: 5000.0, 2027: 5200.0, 2028: 5400.0},
        outlays={2026: 7000.0, 2027: 7300.0, 2028: 7600.0},
        cpiu={2026: 100.0, 2027: 102.0, 2028: 104.04},
        interest_rate_pct={2026: 4.0, 2027: 4.0, 2028: 5.0},
        lines=lines,
    )


def scenario(*policies, start_year=2026, years=3):
    return ScenarioDefinition.model_validate(
        {"options": {"start_year": start_year, "years": years}, "policies": list(policies)}
    )


def custom(**overrides):
    base = {"type": "custom", "name": "P", "category": "spending", "annual_change_usd": 100.0}
    return base | overrides


def test_custom_spending_with_debt_service():
    result = estimate(scenario(custom()), baseline())
    totals = result["totals"]
    assert result["years"] == YEARS
    assert totals["outlay_change"] == {2026: 100.0, 2027: 100.0, 2028: 100.0}
    # Interest on half of this year's borrowing plus all earlier added debt.
    assert totals["net_interest_change"][2026] == pytest.approx(0.04 * 50)
    debt_2026 = 100 + 2
    assert totals["net_interest_change"][2027] == pytest.approx(0.04 * (debt_2026 + 50))
    debt_2027 = debt_2026 + 100 + 0.04 * (debt_2026 + 50)
    assert totals["net_interest_change"][2028] == pytest.approx(0.05 * (debt_2027 + 50))
    assert totals["deficit_change"][2026] == pytest.approx(102)
    assert totals["deficit"][2026] == pytest.approx(2000 + 102)
    assert result["complete"] is True


def test_custom_revenue_indexed_from_start_year():
    policy = custom(category="revenue", start_year=2027, index_to_inflation=True)
    totals = estimate(scenario(policy), baseline())["totals"]
    assert totals["outlay_change"] == dict.fromkeys(YEARS, 0.0)
    assert totals["revenue_change"][2026] == 0
    assert totals["revenue_change"][2027] == pytest.approx(100)
    assert totals["revenue_change"][2028] == pytest.approx(100 * 104.04 / 102)
    assert totals["deficit_change"][2027] < 0


def test_spending_change_percent_and_amount():
    line = {2026: 800.0, 2027: 820.0, 2028: 840.0}
    cut = {"type": "spending_change", "name": "Cut", "line_code": "agency:x", "mode": "percent"}
    result = estimate(
        scenario(cut | {"value": -25}, cut | {"mode": "amount", "value": 10}),
        baseline(**{"agency:x": line}),
    )
    assert result["policies"][0]["outlay_change"] == {2026: -200.0, 2027: -205.0, 2028: -210.0}
    assert result["policies"][1]["outlay_change"] == dict.fromkeys(YEARS, 10.0)


def test_income_tax_is_pending_until_modeled():
    tax = {"type": "income_tax", "name": "Tax", "parameter_values": {}}
    definition = scenario(tax)

    pending = estimate(definition, baseline())
    assert pending["policies"][0]["status"] == "pending"
    assert pending["complete"] is False

    effect = Effect(
        revenue={2026: -700.0, 2027: -720.0, 2028: -740.0}, outlays=dict.fromkeys(YEARS, 0.0)
    )
    modeled = estimate(definition, baseline(), {0: effect})
    assert modeled["policies"][0]["status"] == "modeled"
    assert modeled["totals"]["revenue_change"][2027] == -720
    assert modeled["complete"] is True


def test_vat_is_not_modeled_yet():
    result = estimate(scenario({"type": "vat", "name": "VAT", "rate": 0.03}), baseline())
    assert result["policies"][0]["status"] == "not_modeled"
    assert result["complete"] is False


def test_years_are_limited_to_the_baseline():
    assert estimate(scenario(start_year=2027, years=10), baseline())["years"] == [2027, 2028]
