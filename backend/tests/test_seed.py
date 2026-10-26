import csv
from decimal import Decimal

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import BudgetLine, BudgetValue, Source
from app.seed import SEED_DIR, seed


def cbo_total(variable: str, year: int) -> Decimal:
    """A headline total from CBO's ten-year file, in dollars."""
    for row in csv.DictReader((SEED_DIR / "cbo/2026-02/ten_year_budget.csv").open()):
        if row["variable"] == variable and row["date"] == f"FY{year}":
            return Decimal(row["value"]) * 1_000_000_000
    raise KeyError(variable)


def seeded_total(session, category: str, level: str, year: int) -> Decimal:
    return session.scalar(
        select(func.sum(BudgetValue.amount_usd))
        .join(BudgetLine)
        .where(
            BudgetLine.category == category,
            BudgetLine.level == level,
            BudgetValue.fiscal_year == year,
        )
    )


def test_seed_reconciles_with_cbo_totals():
    with SessionLocal() as session:
        seed(session)
        for year in (2026, 2036):
            outlays = cbo_total("proj_outlays_total", year)
            # CBO rounds account outlays to the nearest million.
            for level in ("agency", "bureau", "account"):
                assert abs(seeded_total(session, "outlay", level, year) - outlays) < 1_000_000
            revenue = cbo_total("proj_rev_total", year)
            assert abs(seeded_total(session, "revenue", "source", year) - revenue) < 1_000_000


def test_every_value_cites_a_source():
    with SessionLocal() as session:
        seed(session)
        assert session.scalar(select(func.count(Source.id))) == 3
        missing = session.scalar(
            select(func.count(BudgetValue.id)).where(BudgetValue.source_id.is_(None))
        )
        assert missing == 0
