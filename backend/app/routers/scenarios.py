import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Scenario, SimulationRun
from app.runs import queue_run
from app.schemas import RunOut, ScenarioIn, ScenarioOut, ScenarioSummary

router = APIRouter(prefix="/api")


def get_scenario(slug: str, session: Session) -> Scenario:
    scenario = session.scalars(select(Scenario).where(Scenario.slug == slug)).first()
    if scenario is None:
        raise HTTPException(404, "Scenario not found")
    return scenario


@router.get("/scenarios", response_model=list[ScenarioSummary])
def list_scenarios(session: Session = Depends(get_session)):
    return session.scalars(select(Scenario).order_by(Scenario.updated_at.desc()).limit(100)).all()


@router.post("/scenarios", response_model=ScenarioOut, status_code=201)
def create_scenario(body: ScenarioIn, session: Session = Depends(get_session)):
    scenario = Scenario(
        slug=secrets.token_urlsafe(6),
        name=body.name,
        description=body.description,
        definition=body.definition.model_dump(mode="json"),
    )
    session.add(scenario)
    session.commit()
    return scenario


@router.get("/scenarios/{slug}", response_model=ScenarioOut)
def read_scenario(slug: str, session: Session = Depends(get_session)):
    return get_scenario(slug, session)


@router.put("/scenarios/{slug}", response_model=ScenarioOut)
def update_scenario(slug: str, body: ScenarioIn, session: Session = Depends(get_session)):
    scenario = get_scenario(slug, session)
    scenario.name = body.name
    scenario.description = body.description
    scenario.definition = body.definition.model_dump(mode="json")
    session.commit()
    session.refresh(scenario)
    return scenario


@router.post("/scenarios/{slug}/runs", response_model=RunOut, status_code=202)
def start_run(slug: str, session: Session = Depends(get_session)):
    return queue_run(session, get_scenario(slug, session))


@router.get("/runs/{run_id}", response_model=RunOut)
def read_run(run_id: str, session: Session = Depends(get_session)):
    run = session.get(SimulationRun, run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    return run
