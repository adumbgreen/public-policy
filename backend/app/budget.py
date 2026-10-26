"""Budget effects that are arithmetic on CBO's baseline, and the yearly totals for a scenario.

Policies scored by a model (income tax changes) are passed in as `modeled` effects. Everything here
runs in milliseconds, so the API can return it while the user edits.
"""

from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import BudgetLine, BudgetValue, EconomicValue
from app.schemas import (
    CustomPolicy,
    IncomeTaxPolicy,
    PublishedEstimatePolicy,
    ScenarioDefinition,
    SpendingChangePolicy,
    VatPolicy,
)

ByYear = dict[int, float]


@dataclass
class Baseline:
    revenue: ByYear
    outlays: ByYear
    cpiu: ByYear
    interest_rate_pct: ByYear
    # Outlays for the lines that spending changes refer to, by line code.
    lines: dict[str, ByYear]

    @property
    def years(self) -> list[int]:
        return sorted(set(self.revenue) & set(self.outlays))


@dataclass
class Effect:
    revenue: ByYear
    outlays: ByYear


def load_baseline(session: Session, line_codes: set[str]) -> Baseline:
    def totals(category: str, level: str) -> ByYear:
        rows = session.execute(
            select(BudgetValue.fiscal_year, func.sum(BudgetValue.amount_usd))
            .join(BudgetLine)
            .where(BudgetLine.category == category, BudgetLine.level == level)
            .group_by(BudgetValue.fiscal_year)
        )
        return {year: float(amount) for year, amount in rows}

    def series(name: str) -> ByYear:
        rows = session.execute(
            select(EconomicValue.fiscal_year, EconomicValue.value).where(
                EconomicValue.series == name
            )
        )
        return {year: float(value) for year, value in rows}

    lines: dict[str, ByYear] = defaultdict(dict)
    if line_codes:
        rows = session.execute(
            select(BudgetLine.code, BudgetValue.fiscal_year, BudgetValue.amount_usd)
            .join(BudgetLine)
            .where(BudgetLine.code.in_(line_codes))
        )
        for code, year, amount in rows:
            lines[code][year] = float(amount)

    return Baseline(
        revenue=totals("revenue", "source"),
        outlays=totals("outlay", "agency"),
        cpiu=series("cpiu"),
        interest_rate_pct=series("debt_avg_interest_rate_pct"),
        lines=dict(lines),
    )


def scenario_years(definition: ScenarioDefinition, baseline: Baseline) -> list[int]:
    start = definition.options.start_year
    wanted = range(start, start + definition.options.years)
    return [year for year in wanted if year in baseline.years]


def custom_effect(policy: CustomPolicy, years: list[int], baseline: Baseline) -> Effect:
    # A policy that starts before the scenario is in effect from the scenario's first year.
    start = max(policy.start_year or years[0], years[0])
    amounts = {}
    for year in years:
        if year < start:
            amounts[year] = 0.0
        elif policy.index_to_inflation:
            amounts[year] = policy.annual_change_usd * baseline.cpiu[year] / baseline.cpiu[start]
        else:
            amounts[year] = policy.annual_change_usd
    zero = dict.fromkeys(years, 0.0)
    if policy.category == "revenue":
        return Effect(revenue=amounts, outlays=zero)
    return Effect(revenue=zero, outlays=amounts)


def spending_effect(policy: SpendingChangePolicy, years: list[int], baseline: Baseline) -> Effect:
    line = baseline.lines.get(policy.line_code, {})
    if policy.mode == "percent":
        outlays = {year: line.get(year, 0.0) * policy.value / 100 for year in years}
    else:
        outlays = dict.fromkeys(years, policy.value)
    return Effect(revenue=dict.fromkeys(years, 0.0), outlays=outlays)


def estimate(
    definition: ScenarioDefinition,
    baseline: Baseline,
    modeled: dict[int, Effect] | None = None,
    modeled_notes: dict[int, str] | None = None,
) -> dict:
    """Yearly budget effects of a scenario against CBO's baseline.

    `modeled` maps a policy's index to its effect from the microsimulation. Income tax policies
    without one are reported as pending.
    """
    modeled = modeled or {}
    modeled_notes = modeled_notes or {}
    years = scenario_years(definition, baseline)
    zero = dict.fromkeys(years, 0.0)
    policies = []

    for index, policy in enumerate(definition.policies):
        status, note, effect = "estimated", None, None
        if isinstance(policy, CustomPolicy):
            effect = custom_effect(policy, years, baseline)
            note = "Amounts you entered"
        elif isinstance(policy, SpendingChangePolicy):
            effect = spending_effect(policy, years, baseline)
            note = "Applied to CBO's baseline outlays for this line"
        elif isinstance(policy, IncomeTaxPolicy):
            if index in modeled:
                status, effect = "modeled", modeled[index]
                note = modeled_notes.get(
                    index, "PolicyEngine-US microsimulation, federal income tax"
                )
            else:
                status, note = "pending", "Calculated when you run the simulation"
        elif isinstance(policy, VatPolicy):
            status, note = "not_modeled", "The VAT model needs BLS consumer spending data"
        elif isinstance(policy, PublishedEstimatePolicy):
            status, note = "not_modeled", "Published estimates aren't loaded yet"

        effect = effect or Effect(revenue=zero, outlays=zero)
        policies.append(
            {
                "name": policy.name,
                "type": policy.type,
                "status": status,
                "note": note,
                "revenue_change": effect.revenue,
                "outlay_change": effect.outlays,
            }
        )

    revenue_change = {y: sum(p["revenue_change"][y] for p in policies) for y in years}
    outlay_change = {y: sum(p["outlay_change"][y] for p in policies) for y in years}

    # Debt service: CBO's average interest rate on debt held by the public, applied to the
    # change in debt at the start of the year plus half of this year's change in borrowing.
    interest_change, deficit_change, debt_change = {}, {}, 0.0
    for year in years:
        primary = outlay_change[year] - revenue_change[year]
        rate = baseline.interest_rate_pct[year] / 100
        interest = rate * (debt_change + primary / 2)
        interest_change[year] = interest
        deficit_change[year] = primary + interest
        debt_change += primary + interest

    baseline_deficit = {y: baseline.outlays[y] - baseline.revenue[y] for y in years}
    return {
        "years": years,
        "baseline": {
            "revenue": {y: baseline.revenue[y] for y in years},
            "outlays": {y: baseline.outlays[y] for y in years},
            "deficit": baseline_deficit,
        },
        "policies": policies,
        "totals": {
            "revenue_change": revenue_change,
            "outlay_change": outlay_change,
            "net_interest_change": interest_change,
            "deficit_change": deficit_change,
            "deficit": {y: baseline_deficit[y] + deficit_change[y] for y in years},
        },
        "complete": all(p["status"] in ("estimated", "modeled") for p in policies),
    }


def estimate_for(
    session: Session,
    definition: ScenarioDefinition,
    modeled: dict[int, Effect] | None = None,
    modeled_notes: dict[int, str] | None = None,
) -> dict:
    codes = {p.line_code for p in definition.policies if isinstance(p, SpendingChangePolicy)}
    return estimate(definition, load_baseline(session, codes), modeled, modeled_notes)
