from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from app.budget import estimate_for
from app.db import get_session
from app.models import BudgetLine, BudgetValue
from app.schemas import ScenarioDefinition

router = APIRouter(prefix="/api")


class LineOut(BaseModel):
    code: str
    name: str
    level: str
    parent_code: str | None
    outlays_usd: float | None


@router.get("/budget/lines", response_model=list[LineOut])
def list_lines(
    level: Literal["agency", "bureau", "account"] | None = None,
    parent: str | None = None,
    year: int = 2026,
    session: Session = Depends(get_session),
):
    """Outlay lines with their outlays in one fiscal year, largest first."""
    if level is None and parent is None:
        raise HTTPException(422, "Pass level or parent")
    parent_line = aliased(BudgetLine)
    query = (
        select(BudgetLine, parent_line.code, BudgetValue.amount_usd)
        .outerjoin(parent_line, BudgetLine.parent_id == parent_line.id)
        .outerjoin(
            BudgetValue,
            (BudgetValue.line_id == BudgetLine.id) & (BudgetValue.fiscal_year == year),
        )
        .where(BudgetLine.category == "outlay")
        .order_by(BudgetValue.amount_usd.desc().nulls_last())
    )
    if level:
        query = query.where(BudgetLine.level == level)
    if parent:
        query = query.where(parent_line.code == parent)
    return [
        LineOut(
            code=line.code,
            name=line.name,
            level=line.level,
            parent_code=parent_code,
            outlays_usd=float(amount) if amount is not None else None,
        )
        for line, parent_code, amount in session.execute(query)
    ]


@router.post("/estimate")
def estimate(definition: ScenarioDefinition, session: Session = Depends(get_session)) -> dict:
    """Instant budget effects. Income tax changes are pending until a simulation run."""
    return estimate_for(session, definition)
