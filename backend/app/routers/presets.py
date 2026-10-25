from fastapi import APIRouter

from app.presets import PRESETS

router = APIRouter(prefix="/api")


@router.get("/presets")
def list_presets() -> list[dict]:
    return PRESETS
