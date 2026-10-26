import pytest

from app.db import SessionLocal
from app.seed import seed

DEFENSE = "agency:department-of-defense-military-programs"


@pytest.fixture
def seeded():
    with SessionLocal() as session:
        seed(session)


def test_agency_lines_are_sorted_by_outlays(client, seeded):
    agencies = client.get("/api/budget/lines", params={"level": "agency"}).json()
    assert len(agencies) == 134
    assert agencies[0]["name"] == "Department of Health and Human Services"
    amounts = [a["outlays_usd"] for a in agencies if a["outlays_usd"] is not None]
    assert amounts == sorted(amounts, reverse=True)

    bureaus = client.get("/api/budget/lines", params={"parent": DEFENSE}).json()
    assert bureaus and all(b["parent_code"] == DEFENSE for b in bureaus)


def test_estimate_defense_cut(client, seeded):
    defense = next(
        a
        for a in client.get("/api/budget/lines", params={"level": "agency"}).json()
        if a["code"] == DEFENSE
    )
    definition = {
        "options": {"start_year": 2026, "years": 10},
        "policies": [
            {
                "type": "spending_change",
                "name": "Cut defense 25%",
                "line_code": DEFENSE,
                "mode": "percent",
                "value": -25,
            }
        ],
    }
    result = client.post("/api/estimate", json=definition).json()
    assert result["years"] == list(range(2026, 2036))
    assert result["totals"]["outlay_change"]["2026"] == pytest.approx(
        -0.25 * defense["outlays_usd"]
    )
    assert result["totals"]["deficit_change"]["2035"] < 0
    assert result["complete"] is True


def test_spending_presets_point_at_real_lines(client, seeded):
    codes = {a["code"] for a in client.get("/api/budget/lines", params={"level": "agency"}).json()}
    presets = client.get("/api/presets").json()
    for preset in presets:
        if preset["type"] == "spending_change":
            assert preset["line_code"] in codes
