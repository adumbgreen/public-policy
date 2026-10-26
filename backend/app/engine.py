"""Scores a scenario. Runs in the worker process, never in a web request."""

from collections.abc import Callable
from importlib.metadata import version

from sqlalchemy.orm import Session

from app.budget import Effect, estimate_for, load_baseline, scenario_years
from app.config import settings
from app.microsim import Change, ShardPool, YearResult, deciles
from app.schemas import IncomeTaxPolicy, ScenarioDefinition

ENGINE_VERSION = "1"

Scorer = Callable[[list[Change], list[int], Callable[[str], None]], dict[int, YearResult]]

_pool: ShardPool | None = None


def default_scorer(changes, years, progress):
    global _pool
    if _pool is None:
        progress("Loading household data")
        _pool = ShardPool(settings.engine_shards)
    try:
        return _pool.run(changes, years, progress)
    except Exception:
        # A shard may have died (for example, out of memory). Start fresh next time.
        _pool.terminate()
        _pool = None
        raise


def run(
    definition: ScenarioDefinition,
    session: Session,
    progress: Callable[[str], None] = lambda _: None,
    scorer: Scorer = default_scorer,
) -> dict:
    years = scenario_years(definition, load_baseline(session, set()))
    # Don't hold a read transaction open during the long simulation; it would block reseeding.
    session.commit()
    tax = [(i, p) for i, p in enumerate(definition.policies) if isinstance(p, IncomeTaxPolicy)]
    changes: list[Change] = [
        (path, value, policy.index_to_inflation)
        for _, policy in tax
        for path, value in policy.parameter_values.items()
    ]

    modeled: dict[int, Effect] = {}
    notes: dict[int, str] = {}
    distribution = None
    zero = dict.fromkeys(years, 0.0)
    if changes:
        results = scorer(changes, years, progress)
        revenue = {
            year: float((r.weight * (r.reform_tax - r.baseline_tax)).sum())
            for year, r in results.items()
        }
        distribution = {year: deciles(r) for year, r in results.items()}
        # Income tax policies are scored together, so their combined effect is reported once.
        first = tax[0][0]
        modeled[first] = Effect(revenue=revenue, outlays=zero)
        for index, _ in tax[1:]:
            modeled[index] = Effect(revenue=zero, outlays=zero)
            notes[index] = f"Scored together with '{definition.policies[first].name}'"
        if len(tax) > 1:
            notes[first] = "PolicyEngine-US microsimulation, all income tax changes combined"
    else:
        for index, _ in tax:
            modeled[index] = Effect(revenue=zero, outlays=zero)
            notes[index] = "No changes to current law"

    result = estimate_for(session, definition, modeled, notes)
    result["distribution"] = distribution
    result["notes"] = [
        "Baseline: CBO's February 2026 budget projections.",
        (
            f"Income tax changes: PolicyEngine-US {version('policyengine-us')}, households in each "
            "tax year, counted in the fiscal year with the same number."
        ),
        (
            "Net interest: CBO's projected average interest rate on debt held by the public, "
            "applied to the change in debt."
        ),
    ]
    if definition.options.labor_supply_responses:
        result["notes"].append(
            "Behavioral responses aren't applied yet. They need a cited set of labor-supply "
            "elasticities."
        )
    return result
