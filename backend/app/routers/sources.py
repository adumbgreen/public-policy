from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Source
from app.schemas import SourceOut

router = APIRouter(prefix="/api")


@router.get("/sources", response_model=list[SourceOut])
def list_sources(session: Session = Depends(get_session)):
    return session.scalars(select(Source).order_by(Source.publisher, Source.title)).all()
