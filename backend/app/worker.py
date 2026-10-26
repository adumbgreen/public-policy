"""Pulls queued simulation runs from Postgres and scores them one at a time."""

import logging
import time
from datetime import datetime

from sqlalchemy import select

from app import engine
from app.config import settings
from app.db import SessionLocal
from app.models import SimulationRun
from app.schemas import ScenarioDefinition

log = logging.getLogger("worker")


def process_next() -> bool:
    """Run the oldest queued simulation. Returns False when the queue is empty."""
    with SessionLocal() as session:
        run = session.scalars(
            select(SimulationRun)
            .where(SimulationRun.status == "queued")
            .order_by(SimulationRun.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        ).first()
        if run is None:
            return False
        run.status = "running"
        run.started_at = datetime.now()
        session.commit()

        def progress(text: str) -> None:
            run.progress = text
            session.commit()

        try:
            run.result = engine.run(
                ScenarioDefinition.model_validate(run.definition), session, progress
            )
            run.status = "succeeded"
        except Exception as exc:
            log.exception("Run %s failed", run.id)
            run.status = "failed"
            run.error = str(exc)
        run.finished_at = datetime.now()
        run.progress = None
        session.commit()
        return True


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    log.info("Worker started")
    while True:
        if not process_next():
            time.sleep(settings.worker_poll_seconds)


if __name__ == "__main__":
    main()
