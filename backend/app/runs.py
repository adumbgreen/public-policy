import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import engine
from app.models import Scenario, SimulationRun


def definition_hash(definition: dict) -> str:
    return hashlib.sha256(json.dumps(definition, sort_keys=True).encode()).hexdigest()


def queue_run(session: Session, scenario: Scenario) -> SimulationRun:
    """Reuse a finished or in-progress run of the same definition, otherwise queue a new one."""
    digest = definition_hash(scenario.definition)
    existing = session.scalars(
        select(SimulationRun)
        .where(
            SimulationRun.definition_hash == digest,
            SimulationRun.engine_version == engine.ENGINE_VERSION,
            SimulationRun.status.in_(["queued", "running", "succeeded"]),
        )
        .order_by(SimulationRun.created_at.desc())
        .limit(1)
    ).first()
    if existing:
        return existing

    run = SimulationRun(
        scenario_id=scenario.id,
        definition=scenario.definition,
        definition_hash=digest,
        engine_version=engine.ENGINE_VERSION,
    )
    session.add(run)
    session.commit()
    return run
