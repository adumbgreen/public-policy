import numpy as np
import pytest

from app import engine
from app.db import SessionLocal
from app.microsim import YearResult, build_reform, deciles
from app.schemas import ScenarioDefinition
from app.seed import seed

PATH = "gov.irs.deductions.standard.amount.SINGLE"


@pytest.fixture
def session():
    with SessionLocal() as session:
        seed(session)
        yield session


def fake_scorer(calls):
    def scorer(changes, years, progress):
        calls.append((changes, years))
        return {
            year: YearResult(
                weight=np.array([2.0, 1.0]),
                market_income=np.array([10.0, 20.0]),
                baseline_tax=np.array([100.0, 200.0]),
                reform_tax=np.array([50.0, 200.0]),
            )
            for year in years
        }

    return scorer


def definition(*policies, years=2):
    return ScenarioDefinition.model_validate(
        {"options": {"start_year": 2026, "years": years}, "policies": list(policies)}
    )


def test_income_tax_change_is_scored(session):
    calls = []
    tax = {"type": "income_tax", "name": "Deduction", "parameter_values": {PATH: 100000}}
    result = engine.run(definition(tax), session, scorer=fake_scorer(calls))
    assert calls == [([(PATH, 100000, True)], [2026, 2027])]
    policy = result["policies"][0]
    assert policy["status"] == "modeled"
    # Weighted change: 2 households x -50.
    assert policy["revenue_change"] == {2026: -100.0, 2027: -100.0}
    assert result["complete"] is True
    assert sum(row["total_tax_change"] for row in result["distribution"][2026]) == -100.0


def test_income_tax_policies_are_scored_together(session):
    calls = []
    other = "gov.irs.deductions.standard.amount.JOINT"
    a = {"type": "income_tax", "name": "A", "parameter_values": {PATH: 1}}
    b = {
        "type": "income_tax",
        "name": "B",
        "parameter_values": {other: 2},
        "index_to_inflation": False,
    }
    result = engine.run(definition(a, b), session, scorer=fake_scorer(calls))
    assert calls[0][0] == [(PATH, 1, True), (other, 2, False)]
    assert result["policies"][1]["note"] == "Scored together with 'A'"
    assert result["policies"][1]["revenue_change"] == {2026: 0.0, 2027: 0.0}


def test_no_microsimulation_without_tax_changes(session):
    def scorer(*args):
        raise AssertionError("should not run")

    custom = {"type": "custom", "name": "C", "category": "spending", "annual_change_usd": 1e9}
    empty_tax = {"type": "income_tax", "name": "T", "parameter_values": {}}
    result = engine.run(definition(custom, empty_tax), session, scorer=scorer)
    assert result["distribution"] is None
    assert result["policies"][1]["note"] == "No changes to current law"
    assert result["totals"]["outlay_change"][2026] == 1e9


class FakeParameter:
    def __init__(self, metadata=None, values=None):
        self.metadata = metadata or {}
        self.values = values or {}

    def __call__(self, instant):
        return self.values[instant]


class FakeParameters:
    def __init__(self, **children):
        self.children = children

    def get_child(self, path):
        return self.children[path]


def test_build_reform_indexes_with_rounding():
    uprating = {"parameter": "gov.irs.uprating", "rounding": {"type": "downwards", "interval": 50}}
    parameters = FakeParameters(
        **{
            PATH: FakeParameter({"uprating": uprating}),
            "gov.irs.uprating": FakeParameter(
                values={"2026-01-01": 100.0, "2027-01-01": 102.6, "2028-01-01": 105.0}
            ),
        }
    )
    reform = build_reform(parameters, [(PATH, 100000, True)], 2026, 2028)
    assert reform[PATH] == {
        "2026-01-01.2026-12-31": 100000,
        "2027-01-01.2027-12-31": 102600,
        "2028-01-01.2100-12-31": 105000,
    }
    fixed = build_reform(parameters, [(PATH, 100000, False)], 2026, 2028)
    assert fixed[PATH] == {"2026-01-01.2100-12-31": 100000}


def test_deciles_are_household_weighted():
    result = YearResult(
        weight=np.ones(20),
        market_income=np.arange(20.0),
        baseline_tax=np.zeros(20),
        reform_tax=-np.arange(20.0),
    )
    rows = deciles(result)
    assert [r["households"] for r in rows] == [2.0] * 10
    assert rows[0]["total_tax_change"] == -1.0  # incomes 0 and 1
    assert rows[9]["average_tax_change"] == -18.5
    assert rows[0]["share_with_tax_cut"] == 0.0  # a change of -1 doesn't count as a cut
