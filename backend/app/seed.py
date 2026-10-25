"""Load the committed seed data into the budget tables.

Usage: python -m app.seed

Replaces everything in sources, budget_lines and budget_values. Scenarios aren't touched.
"""

import csv
import json
import re
from collections import defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import insert, text
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import BudgetLine, BudgetValue, Source

SEED_DIR = Path(__file__).resolve().parent.parent / "data" / "seed"
BILLION = Decimal(1_000_000_000)
MILLION = Decimal(1_000_000)

# CBO ten-year file variables loaded as revenue lines.
REVENUE_SOURCES = {
    "proj_rev_individual_income": "Individual income taxes",
    "proj_rev_payroll": "Payroll taxes",
    "proj_rev_corporate_income": "Corporate income taxes",
    "proj_rev_customs": "Customs duties",
    "proj_rev_other": "Other revenue",
}


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def fiscal_year(value: str) -> int:
    return int(value.removeprefix("FY"))


def load_sources(session: Session) -> dict[str, Source]:
    sources = {}
    for entry in json.loads((SEED_DIR / "sources.json").read_text()):
        source = Source(
            publisher=entry["publisher"],
            title=entry["title"],
            url=entry["url"],
            table_or_page=entry["table_or_page"],
            published_on=date.fromisoformat(entry["published_on"])
            if entry["published_on"]
            else None,
            retrieved_on=date.fromisoformat(entry["retrieved_on"]),
            notes=entry["notes"],
        )
        session.add(source)
        sources[entry["key"]] = source
    session.flush()
    return sources


def add_line(session: Session, code: str, name: str, category: str, level: str, parent=None):
    line_id = session.execute(
        insert(BudgetLine)
        .values(code=code, name=name, category=category, level=level, parent_id=parent)
        .returning(BudgetLine.id)
    ).scalar_one()
    return line_id


def load_revenue(session: Session, source: Source) -> None:
    values = []
    rows = csv.DictReader((SEED_DIR / "cbo/2026-02/ten_year_budget.csv").open())
    by_variable = defaultdict(list)
    for row in rows:
        if row["variable"] in REVENUE_SOURCES and row["value"]:
            by_variable[row["variable"]].append(row)

    for variable, name in REVENUE_SOURCES.items():
        line_id = add_line(session, f"revenue:{slug(name)}", name, "revenue", "source")
        first_year = min(fiscal_year(r["date"]) for r in by_variable[variable])
        for row in by_variable[variable]:
            year = fiscal_year(row["date"])
            values.append(
                {
                    "line_id": line_id,
                    "fiscal_year": year,
                    # The first year in each CBO vintage is actual.
                    "basis": "actual" if year == first_year else "projected",
                    "amount_usd": Decimal(row["value"]) * BILLION,
                    "source_id": source.id,
                }
            )
    session.execute(insert(BudgetValue), values)


def load_outlays(session: Session, source: Source) -> None:
    """Agency > bureau > account lines. Agency and bureau values are sums of their accounts."""
    rows = list(csv.DictReader((SEED_DIR / "cbo/2026-02/spending_detail.csv").open()))
    totals: dict[str, dict[int, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    names: dict[str, tuple[str, str, str | None]] = {}  # code -> (name, level, parent code)

    for row in rows:
        agency = f"agency:{slug(row['agency'])}"
        bureau = f"bureau:{slug(row['agency'])}:{slug(row['bureau'])}"
        account = f"account:{row['tin']}"
        names.setdefault(agency, (row["agency"], "agency", None))
        names.setdefault(bureau, (row["bureau"], "bureau", agency))
        names.setdefault(account, (row["title"], "account", bureau))
        amount = Decimal(row["outlays"] or "0") * MILLION
        year = fiscal_year(row["date"])
        for code in (agency, bureau, account):
            totals[code][year] += amount

    ids: dict[str, int] = {}
    for level in ("agency", "bureau", "account"):
        for code, (name, line_level, parent) in names.items():
            if line_level == level:
                ids[code] = add_line(
                    session, code, name, "outlay", level, ids[parent] if parent else None
                )

    session.execute(
        insert(BudgetValue),
        [
            {
                "line_id": ids[code],
                "fiscal_year": year,
                "basis": "projected",
                "amount_usd": amount,
                "source_id": source.id,
            }
            for code, by_year in totals.items()
            for year, amount in by_year.items()
        ],
    )


def seed(session: Session) -> None:
    session.execute(text("TRUNCATE budget_values, budget_lines, sources RESTART IDENTITY CASCADE"))
    sources = load_sources(session)
    load_revenue(session, sources["cbo_ten_year_2026_02"])
    load_outlays(session, sources["cbo_spending_detail_2026_02"])
    session.commit()


if __name__ == "__main__":
    with SessionLocal() as session:
        seed(session)
    print("Seed data loaded.")
